"""Unit-тесты без Postgres/Redis (чистая логика)."""

from __future__ import annotations

from backend.scenarios.schema import validate_scenario_dict
from backend.simulator.paz import interlock_reason
from backend.simulator.process_model import create_initial_process, tick_process
from backend.simulator.session import SessionStore
from backend.storage.audit_chain import hash_entry, verify_chain


def test_process_tick_advances_time():
    p = create_initial_process()
    p["running"] = True
    p["valveL1"] = 100
    p["pumpN1"] = "running"
    p["powerOk"] = True
    next_p = tick_process(p, 1.0)
    assert next_p["simTimeSec"] >= 1.0


def test_paz_blocks_start_n1_without_power():
    p = create_initial_process()
    p["powerOk"] = False
    reason = interlock_reason(p, "start-N1", None)
    assert reason


def test_session_command_and_tick():
    store = SessionStore()
    sess = store.create(user_id="u1", exercise_id="startup")
    # open L1 then start N1 needs power+steam typically — just fuel reject
    bad = store.apply_command(sess.id, "fuel", {"fuelTarget": 50})
    # may ok or reject depending on steam; ensure shape
    assert "ok" in bad
    store.tick_all(0.5)
    got = store.get(sess.id)
    assert got is not None
    assert got.sim_time >= 0.5


def test_audit_hmac_chain():
    e1 = {
        "id": "a1",
        "at": 1,
        "actor": "admin",
        "role": "admin",
        "action": "login",
        "detail": None,
    }
    h1 = hash_entry(e1, "")
    e1["prev_hash"] = ""
    e1["entry_hash"] = h1
    e2 = {
        "id": "a2",
        "at": 2,
        "actor": "admin",
        "role": "admin",
        "action": "create",
        "detail": "x",
    }
    h2 = hash_entry(e2, h1)
    e2["prev_hash"] = h1
    e2["entry_hash"] = h2
    assert verify_chain([e1, e2])["ok"] is True
    e2["entry_hash"] = "deadbeef"
    assert verify_chain([e1, e2])["ok"] is False


def test_scenario_schema_ok():
    doc = {
        "id": "sc-demo",
        "name": "Демо",
        "version": "1.0.0",
        "initial": {"pumpN1": "stopped"},
        "checklist": ["Открыть Л-1"],
        "goldenSequence": ["open-L1", "start-N1"],
    }
    assert validate_scenario_dict(doc)["ok"] is True
    bad = {**doc, "version": "x"}
    assert validate_scenario_dict(bad)["ok"] is False
