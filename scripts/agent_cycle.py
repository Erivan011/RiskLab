"""Execute repository checks and keep a bounded history of verified outcomes."""

import argparse
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / ".agent-state" / "history.json"
RETENTION = 30


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run_check(check):
    check_id, label, command = check
    start = monotonic()
    # Give tests their normal runtime paths without passing API keys or GitHub tokens.
    allowed = {"PATH", "LANG", "LC_ALL", "VIRTUAL_ENV", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR"}
    env = {key: value for key, value in os.environ.items() if key in allowed}
    env["CI"] = "true"
    print(f"\n[{check_id}] {label}", flush=True)
    try:
        process = subprocess.run(command, cwd=ROOT, env=env, timeout=360, check=False)
        status = "passed" if process.returncode == 0 else "failed"
    except (OSError, subprocess.TimeoutExpired) as error:
        print(type(error).__name__, flush=True)
        status = "blocked"
    return {"id": check_id, "status": status, "seconds": round(monotonic() - start, 2)}


def read_history(path):
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("Histórico inválido")
    return raw[-RETENTION:]


def transitions(results, history):
    events = []
    for result in results:
        previous = [
            check["status"]
            for cycle in reversed(history)
            for check in cycle["checks"] if check["id"] == result["id"]
        ]
        status = result["status"]
        if status == "passed":
            trend = "recovered" if previous and previous[0] != status else "passing"
        elif previous and previous[0] == status:
            trend = "repeated"
        else:
            trend = "new"
        events.append({"id": result["id"], "status": status, "trend": trend})
    return events


def write_history(path, cycles):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        tmp = Path(handle.name)
        json.dump(cycles[-RETENTION:], handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    try:
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def infer(events, model):
    candidates = [event for event in events if event["status"] != "passed"] or events
    ids = [event["id"] for event in candidates]
    schema = {
        "type": "object",
        "properties": {"check": {"type": "string", "enum": ids}},
        "required": ["check"],
        "additionalProperties": False,
    }
    prompt = (
        "Choose one check for a maintainer to inspect. Prefer new failures, then repeated "
        "failures, then recently recovered checks. Return exactly one provided id as JSON "
        'with key "check". Evidence: ' + json.dumps(candidates, ensure_ascii=False)
    )
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": schema,
        "options": {"num_ctx": 2048, "num_predict": 32, "temperature": 0},
    }
    request = Request(
        "http://127.0.0.1:11434/api/generate",
        json.dumps(payload).encode(),
        {"Content-Type": "application/json"},
    )
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=90) as response:
        result = json.loads(response.read(65537))
    advice = json.loads(result["response"])
    if not isinstance(advice, dict) or set(advice) != {"check"} or advice["check"] not in ids:
        raise ValueError("Resposta sem evidência válida")
    selected = next(event for event in candidates if event["id"] == advice["check"])
    action = {
        "new": "Reproduzir a falha e conferir o primeiro erro no log da verificação.",
        "repeated": "Comparar os logs dos ciclos com falha e identificar o erro recorrente.",
        "recovered": "Repetir a verificação para confirmar que a recuperação se mantém.",
        "passing": "Acompanhar esta verificação no próximo ciclo.",
    }[selected["trend"]]
    return {"check": selected["id"], "action": action}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ollama-model", choices=["qwen2.5:0.5b"])
    args = parser.parse_args()
    project = json.loads((ROOT / "scripts" / "agent-checks.json").read_text(encoding="utf-8"))
    history = read_history(HISTORY)
    results = [run_check(check) for check in project["checks"]]
    events = transitions(results, history)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    cycle = {"at": datetime.now(timezone.utc).isoformat(), "commit": commit, "checks": results}
    write_history(HISTORY, [*history, cycle])
    rows = [f"# Agentes do {project['name']}", "", "| Verificação | Estado | Tendência |", "| --- | --- | --- |"]
    rows += [f"| {event['id']} | {event['status']} | {event['trend']} |" for event in events]
    summary = "\n".join(rows) + "\n"
    print(summary, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write(summary)
    if args.ollama_model:
        try:
            print(json.dumps(infer(events, args.ollama_model), ensure_ascii=False))
        except (OSError, ValueError, KeyError, TypeError) as error:
            print(f"Diagnóstico do modelo indisponível ({type(error).__name__}).")
            return 1
    return int(any(result["status"] != "passed" for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
