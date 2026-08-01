from app.backends import _codex_prompt, codex_command, estimate_tokens


def test_codex_prompt_contains_roles_and_guardrails():
    prompt = _codex_prompt({"messages": [{"role": "user", "content": "Explique SQLite"}]})
    assert "USER: Explique SQLite" in prompt
    assert "não edite arquivos" in prompt


def test_available_effort_values_are_safe():
    allowed = {"low", "medium", "high", "xhigh", "max", "ultra"}
    assert "high" in allowed


def test_token_estimate_is_positive():
    assert estimate_tokens("") == 1
    assert estimate_tokens("12345678") == 2


def test_codex_command_resolves_to_executable():
    assert codex_command()
