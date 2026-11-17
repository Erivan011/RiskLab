"""Cria uma regra de esforço none para uma chave e verifica a rota local."""

from http.cookiejar import CookieJar
from getpass import getpass
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener


BASE_URL = "http://127.0.0.1:20128"
API_KEY_NAME = "risklab-nemotron-test"
RULE_NAME = "RiskLab Nemotron - sem raciocinio"
MODEL_ID = "nvidia/nvidia/nemotron-3.5-lightning-30b-a3b"


def request_json(opener, method, path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(BASE_URL + path, data=data, headers=headers, method=method)
    with opener.open(req, timeout=30) as response:
        raw = response.read()
        parsed = json.loads(raw.decode("utf-8")) if raw else {}
        return response.status, parsed


def api_error(status, body):
    # Não mostra respostas inteiras, cabeçalhos, cookies, senhas ou chaves.
    detail = body.get("error") if isinstance(body, dict) else None
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("code")
    if not isinstance(detail, str):
        detail = ""
    return f"Falha HTTP {status}" + (f": {detail[:180]}" if detail else ".")


def main():
    print("OmniRoute local: regra exclusiva para a chave RiskLab de teste.")
    password = getpass("Senha administrativa da OmniRoute (oculta): ")
    if not password:
        print("Senha vazia; nenhuma alteração feita.", file=sys.stderr)
        return 2

    opener = build_opener(ProxyHandler({}), HTTPCookieProcessor(CookieJar()))
    try:
        status, login = request_json(opener, "POST", "/api/auth/login", {"password": password})
    except HTTPError as exc:
        print(api_error(exc.code, {}), file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Não consegui acessar a OmniRoute local ({type(exc).__name__}).", file=sys.stderr)
        return 1
    finally:
        del password

    if status != 200 or login.get("success") is not True:
        if login.get("mfaRequired"):
            print("A conta exige MFA; o script parou sem alterar regras.", file=sys.stderr)
        else:
            print("Login administrativo não confirmado; nenhuma regra foi alterada.", file=sys.stderr)
        return 1

    try:
        _, key_data = request_json(opener, "GET", "/api/keys?limit=200")
        keys = key_data.get("keys", [])
        api_key = next((item for item in keys if item.get("name") == API_KEY_NAME), None)
        if not api_key or not api_key.get("id"):
            print(f"Não achei a chave '{API_KEY_NAME}'. Nenhuma regra foi criada.", file=sys.stderr)
            return 1

        rules_data_status, rules_data = request_json(
            opener, "GET", "/api/settings/reasoning-routing-rules"
        )
        del rules_data_status
        existing = next(
            (
                rule
                for rule in rules_data.get("rules", [])
                if rule.get("name") == RULE_NAME and rule.get("scope") == "apiKey"
            ),
            None,
        )
        rule = {
            "name": RULE_NAME,
            "description": "Forca reasoning_effort none somente para a chave RiskLab de teste.",
            "scope": "apiKey",
            "apiKeyId": api_key["id"],
            "sourceEffort": "any",
            "effortMode": "force",
            "targetEffort": "none",
            "targetKind": "keep",
            "budgetAction": "remove",
            "priority": 1000000,
            "enabled": True,
        }
        if existing and existing.get("id"):
            path = "/api/settings/reasoning-routing-rules/" + quote(str(existing["id"]), safe="")
            status, _ = request_json(opener, "PATCH", path, rule)
            print("Regra existente atualizada.")
        else:
            status, _ = request_json(
                opener, "POST", "/api/settings/reasoning-routing-rules", rule
            )
            print("Regra criada.")
        if status not in (200, 201):
            print(f"A API retornou status inesperado: {status}.", file=sys.stderr)
            return 1
    except HTTPError as exc:
        print(api_error(exc.code, {}), file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError, StopIteration) as exc:
        print(f"Não consegui criar/verificar a regra ({type(exc).__name__}).", file=sys.stderr)
        return 1

    inference_key = getpass("Chave da OmniRoute risklab-nemotron-test (oculta): ")
    if not inference_key:
        print("Regra salva. Teste de inferência não executado.")
        return 0

    payload = {
        "model": MODEL_ID,
        "messages": [{"role": "user", "content": "Responda APENAS: TESTE_OK"}],
        # Envia high de propósito: a regra deve substituí-lo por none.
        "reasoning_effort": "high",
        "max_tokens": 48,
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        BASE_URL + "/v1/chat/completions",
        data=data,
        headers={
            "Authorization": "Bearer " + inference_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    del inference_key
    try:
        with opener.open(req, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        print(api_error(exc.code, {}), file=sys.stderr)
        print("A regra ficou salva; a chamada de inferência falhou.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Regra salva, mas teste de inferência falhou ({type(exc).__name__}).", file=sys.stderr)
        return 1

    choices = result.get("choices") or []
    message = choices[0].get("message", {}) if choices else {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    reasoning_present = any(message.get(field) for field in ("reasoning", "reasoning_content", "thinking"))
    print("Resposta do modelo:")
    print(content if isinstance(content, str) else "(sem texto)")
    print("Campo de raciocínio retornado:", "sim" if reasoning_present else "não")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
