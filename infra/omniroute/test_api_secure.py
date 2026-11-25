"""Faz uma única chamada OpenAI-compatible sem salvar ou exibir a chave."""

from getpass import getpass
import os
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, ProxyHandler, build_opener


DEFAULT_BASE_URL = "http://127.0.0.1:20128"
DEFAULT_MODEL = "nvidia/nvidia/nemotron-3.5-lightning-30b-a3b"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


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
    secret_name = next((name for name in os.environ if name.lower() in {"omnirouteclientkey", "omniroute_client_key"}), None)
    if secret_name is not None:
        api_key = os.environ.pop(secret_name).strip()
    else:
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
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=60) as response:
            result = json.loads(response.read(65537))
    except HTTPError as exc:
        print(f"A API recusou a chamada (HTTP {exc.code}). A resposta não foi exibida para evitar expor dados.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, ValueError) as exc:
        print(f"Não foi possível concluir o teste ({type(exc).__name__}).", file=sys.stderr)
        return 1

    choices = result.get("choices", []) if isinstance(result, dict) else []
    choice = choices[0] if isinstance(choices, list) and choices else None
    message = choice.get("message") if isinstance(choice, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        content = "".join(part["text"] for part in content if isinstance(part, dict) and isinstance(part.get("text"), str))
    if not isinstance(content, str) or content.strip() != "TESTE_OK":
        print("O modelo não confirmou TESTE_OK; a resposta foi omitida.", file=sys.stderr)
        return 1
    print("TESTE_OK: o modelo respondeu ao teste sintético.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
