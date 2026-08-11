"""Unit-тесты без Postgres/Redis (чистая логика)."""

from __future__ import annotations

import time

from backend.gateway import app as gateway_app
from backend.scenarios.schema import validate_scenario_dict
from backend.simulator import checkpoint_store
from backend.simulator.paz import interlock_reason
from backend.simulator.process_model import create_initial_process, tick_process
from backend.simulator.session import SessionStore
from backend.storage.access import is_admin, is_instructor, require_roles
from backend.storage.audit_chain import hash_entry, verify_chain
from backend.storage.auth import (
    _bootstrap_admin_credentials,
    _demo_account_specs,
    _demo_accounts_enabled,
    hash_password,
    normalize_roles,
    primary_role,
    verify_password,
)


class _FakeRedis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, **_kwargs):
        self.data[key] = value
        return True

    def delete(self, key):
        return int(self.data.pop(key, None) is not None)

    def expire(self, _key, _ttl):
        return True

    def pipeline(self):
        return _FakePipeline(self)


class _FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.operations = []

    def get(self, key):
        self.operations.append(("get", (key,), {}))
        return self

    def set(self, key, value, **kwargs):
        self.operations.append(("set", (key, value), kwargs))
        return self

    def delete(self, key):
        self.operations.append(("delete", (key,), {}))
        return self

    def execute(self):
        return [
            getattr(self.redis, operation)(*args, **kwargs)
            for operation, args, kwargs in self.operations
        ]


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


def test_session_seed_and_versions():
    store = SessionStore()
    sess = store.create(
        user_id="u1",
        exercise_id="sc-01",
        seed=42,
        model_version="processModel-1.2",
        scenario_version="scenarios-1.1",
        fault_type="fuelGas",
        trigger_delay_sec=10,
    )
    pub = sess.public()
    assert pub["seed"] == 42
    assert pub["modelVersion"] == "processModel-1.2"
    assert pub["scenarioVersion"] == "scenarios-1.1"
    assert pub["faultTriggered"] is False
    again = store.create(user_id="u2", seed=42)
    assert again.seed == 42
    assert again.public()["seed"] == 42


def test_session_time_scale_and_auto_fault():
    store = SessionStore()
    sess = store.create(
        user_id="u1",
        seed=7,
        fault_type="demulsifier",
        trigger_delay_sec=1.0,
        time_scale=2.0,
    )
    store.tick_all(0.3)  # 0.6 sim-sec
    got = store.get(sess.id)
    assert got is not None
    assert got.sim_time >= 0.5
    assert got.fault_triggered is False
    store.tick_all(0.3)  # +0.6 → ~1.2
    got = store.get(sess.id)
    assert got is not None
    assert got.fault_triggered is True
    assert got.process.get("demulsifierOn") is False
    msgs = got.public()["systemMessages"]
    assert any("ОТКАЗ" in m for m in msgs)


def test_inject_fault_command():
    store = SessionStore()
    sess = store.create(user_id="u1", fault_type="pumpTrip")
    result = store.apply_command(sess.id, "inject-fault", {"faultType": "pumpTrip"})
    assert result["ok"] is True
    got = store.get(sess.id)
    assert got is not None
    assert got.fault_triggered is True
    assert got.process.get("pumpN1") == "tripped"


def test_restore_snapshot_replaces_server_state_and_pause():
    store = SessionStore()
    sess = store.create(user_id="u1", exercise_id="startup")
    snapshot = create_initial_process()
    snapshot["simTimeSec"] = 42
    snapshot["valveL1"] = 75

    result = store.apply_command(
        sess.id,
        "restore-snapshot",
        {"process": snapshot, "paused": False, "faultTriggered": True},
    )

    assert result["ok"] is True
    got = store.get(sess.id)
    assert got is not None
    assert got.sim_time == 42
    assert got.process["simTimeSec"] == 42
    assert got.process["valveL1"] == 75
    assert got.process["running"] is True
    assert got.paused is False
    assert got.fault_triggered is True


def test_session_checkpoint_roundtrip_restores_progress():
    first = SessionStore()
    sess = first.create(user_id="u1", exercise_id="startup", seed=42)
    first.tick_all(2.0)
    first.apply_command(sess.id, "pause")
    checkpoint = sess.checkpoint()

    restored_store = SessionStore()
    restored = restored_store.restore(checkpoint)

    assert restored.id == sess.id
    assert restored.user_id == "u1"
    assert restored.exercise_id == "startup"
    assert restored.seed == 42
    assert restored.paused is True
    assert restored.sim_time >= 2.0
    assert restored.process["simTimeSec"] == restored.sim_time


def test_session_is_auto_paused_after_heartbeat_timeout():
    store = SessionStore()
    sess = store.create(user_id="u1")
    sess.last_seen_at = time.time() - 31

    paused = store.pause_stale(30)

    assert paused == [sess]
    assert sess.paused is True
    assert store.pause_stale(30) == []


def test_durable_checkpoint_preserves_client_state(monkeypatch):
    redis = _FakeRedis()
    monkeypatch.setattr(checkpoint_store, "get_redis", lambda: redis)
    store = SessionStore()
    sess = store.create(user_id="u1", exercise_id="startup")

    checkpoint_store.save_session(
        sess.checkpoint(),
        client_state={"trainingMode": "full", "hintsUsed": 2},
    )
    store.tick_all(1)
    checkpoint_store.save_session(sess.checkpoint())

    active = checkpoint_store.get_active("u1")
    assert active is not None
    assert active["sessionId"] == sess.id
    assert active["session"]["simTimeSec"] >= 1
    assert active["clientState"]["hintsUsed"] == 2

    checkpoint_store.delete_session(sess.id, "u1")
    assert checkpoint_store.get_active("u1") is None


def test_audit_hmac_chain(monkeypatch):
    monkeypatch.setenv("KTK_AUDIT_HMAC_SECRET", "test-audit-secret")
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


def test_bootstrap_admin_credentials_are_required(monkeypatch):
    monkeypatch.delenv("KTK_ADMIN_LOGIN", raising=False)
    monkeypatch.delenv("KTK_ADMIN_PASSWORD", raising=False)
    try:
        _bootstrap_admin_credentials()
    except RuntimeError as exc:
        assert "KTK_ADMIN_LOGIN" in str(exc)
    else:
        raise AssertionError("bootstrap credentials must be required")


def test_bootstrap_admin_password_is_hashed(monkeypatch):
    monkeypatch.setenv("KTK_ADMIN_LOGIN", "First_Admin")
    monkeypatch.setenv("KTK_ADMIN_PASSWORD", "test-only-password")
    login, _, password = _bootstrap_admin_credentials()
    encoded = hash_password(password)
    assert login == "first_admin"
    assert password not in encoded
    assert verify_password(password, encoded)


def test_demo_accounts_are_disabled_by_default(monkeypatch):
    monkeypatch.delenv("KTK_DEMO_ACCOUNTS_ENABLED", raising=False)
    assert _demo_account_specs() == []


def test_demo_account_specs_are_loaded_from_environment(monkeypatch):
    monkeypatch.setenv("KTK_DEMO_ACCOUNTS_ENABLED", "true")
    monkeypatch.setenv("KTK_ADMIN_LOGIN", "admin")
    monkeypatch.setenv("KTK_ADMIN_NAME", "Демо-администратор")
    monkeypatch.setenv("KTK_ADMIN_PASSWORD", "admin")
    monkeypatch.setenv("KTK_DEMO_INSTRUCTOR_LOGIN", "instructor")
    monkeypatch.setenv("KTK_DEMO_INSTRUCTOR_NAME", "Демо-инструктор")
    monkeypatch.setenv("KTK_DEMO_INSTRUCTOR_PASSWORD", "instructor")
    monkeypatch.setenv("KTK_DEMO_TRAINEE_LOGIN", "trainee")
    monkeypatch.setenv("KTK_DEMO_TRAINEE_NAME", "Демо-обучаемый")
    monkeypatch.setenv("KTK_DEMO_TRAINEE_PASSWORD", "trainee")

    assert _demo_accounts_enabled() is True
    assert _demo_account_specs() == [
        ("admin", "admin", "Демо-администратор", "admin"),
        ("instructor", "instructor", "Демо-инструктор", "instructor"),
        ("trainee", "trainee", "Демо-обучаемый", "trainee"),
    ]


def test_multiple_roles_are_normalized_and_authorized():
    roles = normalize_roles(["trainee", "instructor", "trainee"])
    assert roles == ["trainee", "instructor"]
    assert primary_role(roles) == "instructor"
    user = {"id": "u1", "role": "instructor", "roles": roles}
    assert is_instructor(user)
    assert not is_admin(user)
    require_roles(user, "trainee")
    require_roles(user, "instructor")


def test_gateway_routes_auth_and_users_to_auth_service():
    handler = gateway_app.Handler.__new__(gateway_app.Handler)
    calls = []
    handler.proxy = lambda base, path: calls.append((base, path))

    handler.path = "/api/auth/me"
    handler.do_GET()
    handler.path = "/api/users?role=trainee"
    handler.do_GET()

    assert calls == [
        (gateway_app.AUTH_URL, "/auth/me"),
        (gateway_app.AUTH_URL, "/users?role=trainee"),
    ]


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
