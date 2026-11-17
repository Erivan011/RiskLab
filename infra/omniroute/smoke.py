"""Verifica saúde e autenticação local sem chave nem inferência autorizada."""
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener

BASE = "http://127.0.0.1:20128"
opener = build_opener(ProxyHandler({}))


def main():
    for attempt in range(15):
        try:
            with opener.open(BASE + "/healthz", timeout=2) as response:
                if response.status == 200:
                    break
        except (HTTPError, URLError, TimeoutError):
            pass
        if attempt == 14:
            return "Falhou: serviço local não ficou saudável."
        time.sleep(1)
    body = json.dumps({"model": "test-invalid-no-provider", "messages": [
        {"role": "user", "content": "TESTE_FICTICIO"}], "max_tokens": 1}).encode()
    request = Request(BASE + "/v1/chat/completions", data=body,
                      headers={"Content-Type": "application/json"})
    try:
        with opener.open(request, timeout=5):
            return "Falhou: requisição sem chave foi aceita. Não cadastrar provedores."
    except HTTPError as error:
        if error.code not in (401, 403):
            return "Falhou: autenticação não comprovada; HTTP " + str(error.code)
    except (URLError, TimeoutError):
        return "Falhou: não foi possível verificar autenticação."
    print("OK: saúde local e recusa de chamada sem chave; inferência não testada.")
    return None


if __name__ == "__main__":
    error = main()
    if error:
        print(error, file=sys.stderr)
        sys.exit(1)
