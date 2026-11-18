"""Faz uma única chamada OpenAI-compatible sem salvar ou exibir a chave."""

from getpass import getpass
import os
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, ProxyHandler, build_opener


DEFAULT_BASE_URL = "http://127.0.0.1:20128"
DEFAULT_MODEL = "nvidia/nvidia/nemotron-3.5-lightning-30b-a3b"


def validate_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    local = host in {"localhost", "127.0.0.1", "::1"}
    codespaces = host.endswith(".app.github.dev")
    if (parts.scheme != "https" and not (local and parts.scheme == "http")):
        raise ValueError("Use HTTPS; HTTP só é permitido para localhost.")
    if not (local or (parts.scheme == "https" and codespaces)):
        raise ValueError("Por segurança, o destino deve ser localhost ou um domínio app.github.dev.")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("Informe apenas a URL base, sem credenciais, parâmetros ou fragmentos.")
    if parts.path not in {"", "/"}:
        raise ValueError("Informe a origem do serviço, sem caminho adicional.")
    return value


def main() -> int:
    print("Teste único da OmniRoute. A chave será digitada sem aparecer e não será gravada em arquivo.")
    raw_url = input(f"URL base [{DEFAULT_BASE_URL}]: ").strip() or DEFAULT_BASE_URL
    try:
        base_url = validate_base_url(raw_url)
    except ValueError as exc:
        print(f"URL recusada: {exc}", file=sys.stderr)
        return 2

    model = input(f"ID do modelo [{DEFAULT_MODEL}]: ").strip() or DEFAULT_MODEL
    if not model or any(ord(char) < 32 for char in model):
        print("ID do modelo inválido.", file=sys.stderr)
        return 2
    api_key = os.environ.pop("OMNIROUTE_CLIENT_KEY", None)
    if api_key is None:
        api_key = getpass("Chave de cliente da OmniRoute (entrada oculta): ").strip()
    else:
        api_key = api_key.strip()
    if not api_key:
        print("Chave vazia; nenhuma requisição enviada.", file=sys.stderr)
        return 2

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Responda APENAS: TESTE_OK"}],
        "reasoning_effort": "none",
        "max_tokens": 32,
    }
    request = Request(
        base_url + "/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    del api_key
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        print(f"A API recusou a chamada (HTTP {exc.code}). A resposta não foi exibida para evitar expor dados.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Não foi possível concluir o teste ({type(exc).__name__}).", file=sys.stderr)
        return 1

    choices = result.get("choices") or []
    message = choices[0].get("message", {}) if choices else {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    print("Resposta do modelo:")
    print(content if isinstance(content, str) else "(a API retornou sem texto)")
    print("Teste concluído; chave não foi salva nem exibida pelo script.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
