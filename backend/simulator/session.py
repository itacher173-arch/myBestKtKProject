"""In-memory simulation session store."""

from __future__ import annotations

import copy
import secrets
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .faults import apply_fault
from .paz import interlock_reason
from .process_model import (
    MODEL_VERSION,
    create_initial_process,
    create_warm_process,
    tick_process,
)

ProcessState = dict[str, Any]
ActionDict = dict[str, Any]

DEFAULT_SCENARIO_VERSION = "scenarios-1.1"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _new_seed(explicit: int | str | None) -> int:
    if explicit is None or explicit == "":
        return secrets.randbits(31)
    return int(explicit)


@dataclass
class Session:
    id: str
    user_id: str
    process: ProcessState
    running: bool = False
    paused: bool = False
    exercise_id: Optional[str] = None
    actions_log: list[dict[str, Any]] = field(default_factory=list)
    sim_time: float = 0.0
    seed: int = 0
    model_version: str = MODEL_VERSION
    scenario_version: str = DEFAULT_SCENARIO_VERSION
    time_scale: float = 1.0
    fault_type: Optional[str] = None
    trigger_delay_sec: Optional[float] = None
    fault_triggered: bool = False
    pending_fault_messages: list[str] = field(default_factory=list)
    # Internal: when pump N1 entered "starting" (sim_time), for ~1.5 s ramp
    _pump_n1_start_sim: Optional[float] = field(default=None, repr=False)

    def public(self) -> dict[str, Any]:
        messages = list(self.pending_fault_messages)
        self.pending_fault_messages.clear()
        return {
            "id": self.id,
            "userId": self.user_id,
            "exerciseId": self.exercise_id,
            "running": self.running,
            "paused": self.paused,
            "simTimeSec": self.sim_time,
            "seed": self.seed,
            "modelVersion": self.model_version,
            "scenarioVersion": self.scenario_version,
            "timeScale": self.time_scale,
            "faultTriggered": self.fault_triggered,
            "faultType": self.fault_type,
            "process": self.process,
            "actionsLog": self.actions_log[-80:],
            "systemMessages": messages,
        }


class SessionStore:
    """In-memory store for training simulation sessions (server tick + PAZ)."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def active_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.running and not s.paused)

    def create(
        self,
        user_id: str,
        *,
        exercise_id: Optional[str] = None,
        warm_start: bool = False,
        session_id: Optional[str] = None,
        initial: Optional[dict[str, Any]] = None,
        seed: int | str | None = None,
        model_version: Optional[str] = None,
        scenario_version: Optional[str] = None,
        fault_type: Optional[str] = None,
        trigger_delay_sec: Optional[float] = None,
        time_scale: float = 1.0,
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        process = create_warm_process() if warm_start else create_initial_process()
        if initial:
            process.update(copy.deepcopy(initial))
        if not warm_start:
            process["running"] = True
        session = Session(
            id=sid,
            user_id=user_id,
            process=process,
            running=True,
            paused=False,
            exercise_id=exercise_id,
            actions_log=[],
            sim_time=float(process.get("simTimeSec", 0)),
            seed=_new_seed(seed),
            model_version=(model_version or MODEL_VERSION).strip() or MODEL_VERSION,
            scenario_version=(
                scenario_version or DEFAULT_SCENARIO_VERSION
            ).strip()
            or DEFAULT_SCENARIO_VERSION,
            time_scale=_clamp(float(time_scale), 0.25, 4.0),
            fault_type=fault_type,
            trigger_delay_sec=trigger_delay_sec,
            fault_triggered=False,
        )
        self._sessions[sid] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())

    def apply_command(
        self,
        session_id: str,
        action: str | ActionDict | None = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        if isinstance(action, dict):
            cmd: ActionDict = dict(action)
        else:
            cmd = {"type": str(action or ""), **(payload or {})}
        result = self._apply_command_dict(session_id, cmd)
        sess = result.get("session")
        if isinstance(sess, Session):
            result = {**result, "session": sess.public()}
        return result

    def _apply_command_dict(self, session_id: str, action: ActionDict) -> dict[str, Any]:
        """
        Apply an operator command to a session.

        Expected action shape (camelCase-friendly):
          {"type": "start-N1"} | {"action": "start-N1"}
          {"type": "fuel", "fuelTarget": 60}  # or "value" / "percent"
          {"type": "open-L1"} / {"type": "close-L1"} / {"type": "stop-L1"}
          {"type": "elou-demulsifier", "on": true}
          {"type": "elou-field", "on": true}
          {"type": "elou-wash", "on": true}
          {"type": "stop-N1"} / {"type": "stop-N2"} / {"type": "stop-N3"}
          {"type": "set-avo", "on": true}
          {"type": "set-level-setpoint", "column": "K-1", "percent": 50}
          # raw "patch" is rejected — use typed commands only
          optional "description" for the actions_log entry

        Returns:
          {"ok": True, "session": Session} on success
          {"ok": False, "reason": str, "session": Session | None} on reject / missing
        """
        session = self._sessions.get(session_id)
        if session is None:
            return {"ok": False, "reason": "Session not found", "session": None}

        action_type = str(action.get("type") or action.get("action") or "")
        if not action_type:
            return {
                "ok": False,
                "reason": "Action missing type/action field",
                "session": session,
            }

        fuel_target = _fuel_target_from_action(action)
        guarded = _to_guarded_action(action_type, action)

        if guarded is not None:
            reason = interlock_reason(session.process, guarded, fuel_target)
            if reason:
                self._append_log(
                    session,
                    action.get("description")
                    or f"Отклонено ({action_type}): {reason}",
                    rejected=True,
                    action_type=action_type,
                    reason=reason,
                )
                return {"ok": False, "reason": reason, "session": session}

        err = _apply_action_to_process(session, action_type, action, fuel_target)
        if err:
            return {"ok": False, "reason": err, "session": session}

        desc = action.get("description") or _default_description(action_type, action, fuel_target)
        self._append_log(session, desc, rejected=False, action_type=action_type)
        return {"ok": True, "session": session}

    def tick_all(self, dt: float) -> list[Session]:
        """Advance all non-paused running sessions by dt * time_scale seconds."""
        updated: list[Session] = []
        for session in self._sessions.values():
            if session.paused or not session.running:
                continue
            dt_eff = dt * float(session.time_scale or 1.0)
            if dt_eff <= 0:
                continue
            session.process["running"] = True
            session.process = tick_process(session.process, dt_eff)
            session.sim_time = float(
                session.process.get("simTimeSec", session.sim_time + dt_eff)
            )
            self._promote_pump_n1(session)
            self._maybe_auto_fault(session)
            updated.append(session)
        return updated

    def inject_fault(self, session: Session, fault_type: Optional[str] = None) -> Optional[str]:
        """Apply fault patch. Returns error reason or None."""
        ft = fault_type or session.fault_type
        if not ft:
            return "No fault type configured"
        if session.fault_triggered and not fault_type:
            return "Fault already triggered"
        try:
            patch, messages = apply_fault(ft)
        except ValueError as exc:
            return str(exc)
        session.process.update(patch)
        session.fault_type = ft
        session.fault_triggered = True
        session.pending_fault_messages.extend(messages)
        session.pending_fault_messages.append(
            f"--- Запущена нештатная ситуация: «{ft}» ---"
        )
        self._append_log(
            session,
            f"Инжекция отказа: {ft}",
            rejected=False,
            action_type="inject-fault",
        )
        return None

    def _maybe_auto_fault(self, session: Session) -> None:
        if session.fault_triggered or not session.fault_type:
            return
        delay = session.trigger_delay_sec
        if delay is None:
            return
        if session.sim_time < float(delay):
            return
        self.inject_fault(session)

    def _promote_pump_n1(self, session: Session) -> None:
        """Mirror frontend 1.5 s starting → running ramp (in sim time)."""
        if session.process.get("pumpN1") != "starting":
            session._pump_n1_start_sim = None
            return
        now = float(session.process.get("simTimeSec", session.sim_time))
        if session._pump_n1_start_sim is None:
            session._pump_n1_start_sim = now
            return
        if now - session._pump_n1_start_sim >= 1.5:
            if session.process.get("powerOk"):
                session.process["pumpN1"] = "running"
            session._pump_n1_start_sim = None

    def _append_log(
        self,
        session: Session,
        description: str,
        *,
        rejected: bool,
        action_type: str,
        reason: Optional[str] = None,
    ) -> None:
        entry: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "at": time.time(),
            "simTimeSec": session.sim_time,
            "description": description,
            "action": action_type,
            "rejected": rejected,
        }
        if reason:
            entry["reason"] = reason
        session.actions_log.append(entry)


def _fuel_target_from_action(action: ActionDict) -> Optional[float]:
    for key in ("fuelTarget", "value", "percent"):
        if key in action and action[key] is not None:
            return float(action[key])
    return None


def _to_guarded_action(action_type: str, action: ActionDict) -> Optional[str]:
    """Map command type to a GuardedAction checked by PAZ, if applicable."""
    direct = {
        "open-L1",
        "open-L2",
        "open-L3",
        "start-N1",
        "start-N2",
        "start-N3",
        "elou-demulsifier",
        "elou-field",
        "elou-wash",
        "fuel",
        "shutdown-fuel",
        "shutdown-stop-furnace-pump",
        "shutdown-stop-N1",
    }
    if action_type in direct:
        # Turning ELOU off is not gated by PAZ in TS (only enabling uses sequence guards)
        if action_type.startswith("elou-") and action.get("on") is False:
            return None
        return action_type

    # Aliases
    aliases = {
        "start-N-1": "start-N1",
        "start-N-2": "start-N2",
        "start-N-3": "start-N3",
        "open-L-1": "open-L1",
        "open-L-2": "open-L2",
        "open-L-3": "open-L3",
        "set-fuel": "fuel",
        "fuelGas": "fuel",
        "stop-N2": "shutdown-stop-furnace-pump",
        "stop-N3": "shutdown-stop-furnace-pump",
        "stop-N1": "shutdown-stop-N1",
        "stop-N-1": "shutdown-stop-N1",
        "stop-N-2": "shutdown-stop-furnace-pump",
        "stop-N-3": "shutdown-stop-furnace-pump",
    }
    return aliases.get(action_type)


def _apply_action_to_process(
    session: Session,
    action_type: str,
    action: ActionDict,
    fuel_target: Optional[float],
) -> Optional[str]:
    """Mutate session.process. Return error reason or None."""
    p = session.process
    t = action_type

    if t in ("start-N1", "start-N-1"):
        if p.get("pumpN1") in ("running", "starting"):
            return "Н-1 уже в работе"
        p["pumpN1"] = "starting"
        session._pump_n1_start_sim = session.sim_time
        return None

    if t in ("start-N2", "start-N-2"):
        if p.get("pumpN2") in ("running", "starting"):
            return "Н-2 уже в работе"
        p["pumpN2"] = "running"
        return None

    if t in ("start-N3", "start-N-3"):
        if p.get("pumpN3") in ("running", "starting"):
            return "Н-3 уже в работе"
        p["pumpN3"] = "running"
        return None

    if t in ("stop-N1", "stop-N-1", "shutdown-stop-N1"):
        p["pumpN1"] = "stopped"
        p["pressureN1"] = 0
        session._pump_n1_start_sim = None
        return None

    if t in ("stop-N2", "stop-N-2"):
        p["pumpN2"] = "stopped"
        return None

    if t in ("stop-N3", "stop-N-3"):
        p["pumpN3"] = "stopped"
        return None

    if t == "shutdown-stop-furnace-pump":
        which = action.get("pump") or action.get("id") or "N-2"
        if which in ("N-3", "N3", "pumpN3"):
            p["pumpN3"] = "stopped"
        else:
            p["pumpN2"] = "stopped"
        return None

    if t in ("open-L1", "open-L-1"):
        p["valveL1Motion"] = "opening"
        return None
    if t in ("open-L2", "open-L-2"):
        p["valveL2Motion"] = "opening"
        return None
    if t in ("open-L3", "open-L-3"):
        p["valveL3Motion"] = "opening"
        return None

    if t in ("close-L1", "close-L-1"):
        p["valveL1Motion"] = "closing"
        return None
    if t in ("close-L2", "close-L-2"):
        p["valveL2Motion"] = "closing"
        return None
    if t in ("close-L3", "close-L-3"):
        p["valveL3Motion"] = "closing"
        return None

    if t in ("stop-L1", "stop-L-1"):
        p["valveL1Motion"] = "idle"
        return None
    if t in ("stop-L2", "stop-L-2"):
        p["valveL2Motion"] = "idle"
        return None
    if t in ("stop-L3", "stop-L-3"):
        p["valveL3Motion"] = "idle"
        return None

    if t == "elou-demulsifier":
        p["demulsifierOn"] = bool(action.get("on", True))
        return None
    if t == "elou-field":
        p["electricFieldOn"] = bool(action.get("on", True))
        return None
    if t == "elou-wash":
        p["washWaterOn"] = bool(action.get("on", True))
        return None

    if t in ("fuel", "set-fuel", "fuelGas", "shutdown-fuel"):
        if t == "shutdown-fuel":
            target = 0.0
        else:
            if fuel_target is None:
                return "fuel action requires fuelTarget/value/percent"
            target = _clamp(round(fuel_target), 0, 100)
        # Extra soft blocks mirrored from TrainerContext setFuelGas
        if not p.get("steamOk") and target > 0:
            return (
                "Подача топлива заблокирована: нет технологического пара (горелки погашены)."
            )
        if (p.get("coilRupture") or p.get("furnaceEsd")) and target > 0:
            return "Подача топлива заблокирована: ESD / разрыв змеевика."
        p["fuelGasPercent"] = target
        if target == 0:
            p["safeShutdownInitiated"] = True
        return None

    if t in ("set-avo", "avoFan"):
        p["avoFanOn"] = bool(action.get("on", True))
        return None

    if t in ("set-level-setpoint", "levelSetpoint"):
        column = action.get("column") or action.get("id") or "K-1"
        percent = _clamp(round(float(action.get("percent", action.get("value", 50)))), 10, 90)
        if column in ("K-2", "K2"):
            p["levelSetpointK2"] = percent
        else:
            p["levelSetpointK1"] = percent
        return None

    if t == "restore-snapshot":
        snapshot = action.get("process")
        if not isinstance(snapshot, dict):
            return "restore-snapshot requires process"
        required_keys = set(create_initial_process())
        missing_keys = required_keys.difference(snapshot)
        if missing_keys:
            return (
                "restore-snapshot is missing process fields: "
                + ", ".join(sorted(missing_keys))
            )
        restored = {
            key: copy.deepcopy(snapshot[key])
            for key in required_keys
        }
        try:
            session.sim_time = max(0.0, float(restored["simTimeSec"]))
        except (TypeError, ValueError):
            return "restore-snapshot has invalid simTimeSec"
        restored["simTimeSec"] = session.sim_time
        restored["running"] = True
        session.process = restored
        session.running = True
        session.paused = bool(action.get("paused", False))
        session.fault_triggered = bool(action.get("faultTriggered", False))
        session._pump_n1_start_sim = (
            session.sim_time if restored.get("pumpN1") == "starting" else None
        )
        return None

    if t == "patch":
        # Произвольный patch запрещён: только типизированные команды.
        return "patch action is disabled; use typed commands"

    if t in ("pause",):
        session.paused = True
        return None
    if t in ("resume",):
        session.paused = False
        return None
    if t in ("stop-sim",):
        session.running = False
        p["running"] = False
        return None
    if t in ("start-sim",):
        session.running = True
        p["running"] = True
        return None

    if t in ("set-time-scale", "timeScale", "time-scale"):
        scale = action.get("timeScale", action.get("value", action.get("scale")))
        if scale is None:
            return "set-time-scale requires timeScale/value"
        session.time_scale = _clamp(float(scale), 0.25, 10.0)
        return None

    if t in ("inject-fault", "injectFault"):
        ft = action.get("faultType") or session.fault_type
        if not ft:
            return "inject-fault requires faultType"
        if session.fault_triggered and not action.get("force"):
            return "Fault already triggered"
        try:
            patch, messages = apply_fault(str(ft))
        except ValueError as exc:
            return str(exc)
        p.update(patch)
        session.fault_type = str(ft)
        session.fault_triggered = True
        session.pending_fault_messages.extend(messages)
        session.pending_fault_messages.append(
            f"--- Запущена нештатная ситуация: «{ft}» ---"
        )
        return None

    return f"Unknown action type: {action_type}"


def _default_description(
    action_type: str,
    action: ActionDict,
    fuel_target: Optional[float],
) -> str:
    names = {
        "start-N1": "Насос 'Н-1': нажата кнопка 'Пуск'",
        "start-N2": "Насос 'Н-2': нажата кнопка 'Пуск'",
        "start-N3": "Насос 'Н-3': нажата кнопка 'Пуск'",
        "stop-N1": "Насос 'Н-1': нажата кнопка 'Стоп'",
        "stop-N2": "Насос 'Н-2': нажата кнопка 'Стоп'",
        "stop-N3": "Насос 'Н-3': нажата кнопка 'Стоп'",
        "shutdown-stop-N1": "Насос 'Н-1': нажата кнопка 'Стоп'",
        "shutdown-stop-furnace-pump": "Насос печного тракта: Стоп",
        "open-L1": "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Открыть'",
        "open-L2": "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Открыть'",
        "open-L3": "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Открыть'",
        "close-L1": "Электрозадвижка 'Л-1 (вход сырья)' нажата кнопка 'Закрыть'",
        "close-L2": "Электрозадвижка 'Л-2 (вывод бензина НК-180°С)' нажата кнопка 'Закрыть'",
        "close-L3": "Электрозадвижка 'Л-3 (вывод товарного мазута)' нажата кнопка 'Закрыть'",
        "elou-demulsifier": "ЭЛОУ: деэмульгатор",
        "elou-field": "ЭЛОУ: электрическое поле",
        "elou-wash": "ЭЛОУ: промывная вода",
        "shutdown-fuel": "Печь: топливный газ отсечён",
    }
    if action_type in ("fuel", "set-fuel", "fuelGas"):
        pct = int(fuel_target if fuel_target is not None else 0)
        return f"Печь 'П-1': Изменена подача топливного газа на {pct}%"
    if action_type in names:
        base = names[action_type]
        if action_type.startswith("elou-") and "on" in action:
            return f"{base}: {'включено' if action.get('on') else 'отключено'}"
        return base
    return f"Команда: {action_type}"


store = SessionStore()
