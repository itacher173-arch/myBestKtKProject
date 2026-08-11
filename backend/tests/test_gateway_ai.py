from backend.gateway import app as gateway_app


def test_ai_chat_uses_extended_proxy_timeout():
    handler = gateway_app.Handler.__new__(gateway_app.Handler)
    calls = []
    handler.path = "/api/ai/chat"
    handler.require_user = lambda: {"id": "user-1"}
    handler.proxy = lambda base, path, **kwargs: calls.append(
        (base, path, kwargs)
    )

    handler.do_POST()

    assert calls == [
        (
            gateway_app.AI_URL,
            "/chat",
            {"timeout": gateway_app.AI_PROXY_TIMEOUT},
        )
    ]
    assert gateway_app.AI_PROXY_TIMEOUT >= 90
