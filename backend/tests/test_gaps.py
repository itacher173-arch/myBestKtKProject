"""Unit-тесты без Postgres/Redis (чистая логика)."""

from __future__ import annotations

from backend.gateway import app as gateway_app
from backend.scenarios.schema import validate_scenario_dict
from backend.simulator.paz import interlock_reason
from backend.simulator.process_model import create_initial_process, tick_process
from backend.simulator.session import SessionStore
from backend.storage import auth as auth_module
from backend.storage.access import is_admin, is_instructor, require_roles
from backend.storage.audit_chain import hash_entry, verify_chain
from backend.storage.auth import (
    _bootstrap_admin_credentials,
    _demo_account_specs,
    hash_password,
    normalize_roles,
    primary_role,
    verify_password,
)


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


def test_demo_accounts_cover_all_roles(monkeypatch):
    monkeypatch.setenv("KTK_DEMO_ACCOUNTS_ENABLED", "true")
    monkeypatch.setenv("KTK_ADMIN_LOGIN", "admin")
    monkeypatch.setenv("KTK_ADMIN_NAME", "Демо-администратор")
    monkeypatch.setenv("KTK_ADMIN_PASSWORD", "admin")
    specs = _demo_account_specs()
    assert [item["login"] for item in specs] == ["admin", "instructor", "trainee"]
    assert [item["role"] for item in specs] == ["admin", "instructor", "trainee"]
    assert [item["password"] for item in specs] == ["admin", "instructor", "trainee"]


def test_demo_accounts_are_upserted_idempotently(monkeypatch):
    class Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class Connection:
        def __init__(self):
            self.users = {
                "instructor": {
                    "id": "existing-instructor",
                    "login": "instructor",
                    "full_name": "Старое имя",
                    "password_hash": "old",
                    "role": "trainee",
                    "roles": ["trainee"],
                }
            }
            self.commits = 0

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, query, params):
            normalized = " ".join(query.split())
            if normalized.startswith("SELECT id FROM users"):
                row = self.users.get(params[0].lower())
                return Result({"id": row["id"]} if row else None)
            if normalized.startswith("UPDATE users"):
                full_name, password_hash, role, roles, user_id = params
                user = next(item for item in self.users.values() if item["id"] == user_id)
                user.update(
                    full_name=full_name,
                    password_hash=password_hash,
                    role=role,
                    roles=roles,
                )
                return Result()
            if normalized.startswith("INSERT INTO users"):
                user_id, login, full_name, password_hash, role, roles = params
                self.users[login] = {
                    "id": user_id,
                    "login": login,
                    "full_name": full_name,
                    "password_hash": password_hash,
                    "role": role,
                    "roles": roles,
                }
                return Result()
            raise AssertionError(f"Неожиданный SQL: {normalized}")

        def commit(self):
            self.commits += 1

    connection = Connection()
    monkeypatch.setenv("KTK_DEMO_ACCOUNTS_ENABLED", "true")
    monkeypatch.setenv("KTK_ADMIN_LOGIN", "admin")
    monkeypatch.setenv("KTK_ADMIN_NAME", "Демо-администратор")
    monkeypatch.setenv("KTK_ADMIN_PASSWORD", "admin")
    monkeypatch.setattr(auth_module, "connect", lambda: connection)
    monkeypatch.setattr(auth_module, "hash_password", lambda value: f"hash:{value}")

    auth_module.ensure_demo_accounts()
    auth_module.ensure_demo_accounts()

    assert set(connection.users) == {"admin", "instructor", "trainee"}
    assert connection.users["admin"]["role"] == "admin"
    assert connection.users["instructor"]["role"] == "instructor"
    assert connection.users["trainee"]["role"] == "trainee"
    assert connection.users["instructor"]["password_hash"] == "hash:instructor"
    assert connection.commits == 2


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
