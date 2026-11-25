"""Audit first-party navigation and collect visual evidence on the local preview."""

import json
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".agent-state" / "visual"
IS_ROUTEPLAN = (ROOT / "planner-ui").is_dir()
CANDIDATE = """@media (max-width: 600px) {
  main button:not(:disabled), main select:not(:disabled) { min-height: 36px; }
}"""
PAGES = ["/preview.html"] if IS_ROUTEPLAN else ["/", "/editorial.html", "/analytics.html", "/data-explorer.html"]


@contextmanager
def preview():
    if IS_ROUTEPLAN:
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["node", "scripts/build-preview.mjs", f"{directory}/preview.html"], cwd=ROOT, check=True, timeout=60)
            handler = partial(SimpleHTTPRequestHandler, directory=directory)
            with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    yield f"http://127.0.0.1:{server.server_port}"
                finally:
                    server.shutdown()
        return

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    command = ["node", "scripts/render-server.mjs"]
    env = {"PATH": os.environ["PATH"], "PORT": str(port), "HOST": "127.0.0.1"}
    with subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.DEVNULL) as server:
        try:
            for _ in range(50):
                try:
                    with urlopen(base + "/healthz", timeout=1) as response:
                        if response.status == 200:
                            break
                except URLError:
                    if server.poll() is not None:
                        raise RuntimeError("Servidor de prévia saiu antes de iniciar")
                    time.sleep(.1)
            else:
                raise TimeoutError("Servidor de prévia indisponível")
            yield base
        finally:
            if server.poll() is None:
                server.terminate()
                server.wait(timeout=10)


def audit(browser, base):
    errors = set()
    links = set()
    observations = []
    for width in (390, 1440):
        context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce", service_workers="block")
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
        page = context.new_page()
        page.on("response", lambda res: errors.add(f"HTTP {res.status} {urlsplit(res.url).path}")
                if res.url.startswith(base + "/") and res.status >= 400 else None)
        for path in PAGES:
            page.goto(base + path, wait_until="domcontentloaded", timeout=10000)
            if IS_ROUTEPLAN:
                page.locator(".route-card").first.wait_for(timeout=10000)
            else:
                page.get_by_role("heading", level=1).first.wait_for(timeout=10000)
            if IS_ROUTEPLAN:
                expect(page.get_by_role("link", name="Ver código no GitHub")).to_have_attribute("href", "https://github.com/Erivan011/RoutePlan")
            elif path == "/" and width == 390:
                menu = page.get_by_role("button", name="Módulos e simulação")
                expect(menu).to_have_attribute("aria-expanded", "false")
                menu.click()
                expect(page.get_by_role("slider", name="Neutralização FX hipotética")).to_be_visible()
                page.get_by_role("button", name="Recolher módulos e simulação").click()
            elif path == "/editorial.html":
                preset = page.get_by_role("button", name="+20%", exact=True)
                preset.click()
                expect(preset).to_have_attribute("aria-pressed", "true")
                expect(page.get_by_label("Alta do dólar em porcentagem")).to_have_value("20")
            stats = page.evaluate("""() => ({
                horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
                firstHeadingTop: Math.round((document.querySelector('main h1') ?? document.querySelector('h1')).getBoundingClientRect().top),
                smallControls: [...document.querySelectorAll('main button, main select, main summary')].filter(el => {
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.height < 24 && !el.disabled;
                }).length,
                links: [...document.links].map(link => link.href).filter(url => url.startsWith(location.origin + '/'))
            })""")
            links.update(urlsplit(url).path for url in stats.pop("links"))
            observations.append(dict(page=path, width=width, **stats))
            name = re.sub(r"[^a-z0-9]+", "-", path.strip("/") or "inicio")
            page.screenshot(path=OUTPUT / f"{name}-{width}.png", animations="disabled", timeout=10000)
            if width == 390:
                style = page.add_style_tag(content=CANDIDATE)
                after = page.evaluate("document.documentElement.scrollWidth - innerWidth")
                if after <= stats["horizontalOverflow"]:
                    page.screenshot(path=OUTPUT / f"{name}-{width}-proposta.png", animations="disabled", timeout=10000)
                    observations[-1]["designCandidate"] = True
                style.evaluate("(element) => element.remove()")
        context.close()
    context = browser.new_context(base_url=base)
    try:
        for path in sorted(links):
            response = context.request.get(path, timeout=5000, max_redirects=0)
            if response.status >= 400:
                errors.add(f"Link HTTP {response.status} {path}")
    finally:
        context.close()
    return observations, sorted(errors)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    executable = os.environ.get("AGENT_CHROMIUM")
    with preview() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=executable)
        observations, errors = audit(browser, base)
    report_path = OUTPUT / "observations.json"
    prior = json.loads(report_path.read_text()).get("pages", []) if report_path.exists() else []
    (OUTPUT / "observations.json").write_text(json.dumps({"pages": observations, "broken": errors}, indent=2) + "\n")
    lines = ["## Agentes de navegação e design", "", f"Links e recursos com erro HTTP: {len(errors)}."]
    lines.extend(f"- {error}" for error in errors)
    if any(item.get("designCandidate") for item in observations):
        (OUTPUT / "design-candidate.css").write_text(CANDIDATE + "\n", encoding="utf-8")
        lines.append("- Proposta aplicada na prévia móvel: aumentar as áreas de toque. O artefato contém CSS e capturas antes/depois, sem aumento da rolagem horizontal.")
    for item in observations:
        page, width = item["page"], item["width"]
        previous = next((row for row in prior if row["page"] == page and row["width"] == width), None)
        if item["horizontalOverflow"] > 2:
            lines.append(f"- {page} a {width}px: corrigir {item['horizontalOverflow']}px de rolagem horizontal da página.")
        if width == 390 and item["smallControls"]:
            lines.append(f"- {page} a {width}px: revisar {item['smallControls']} controles visíveis com menos de 24px de altura.")
        if item["firstHeadingTop"] > 320:
            lines.append(f"- {page} a {width}px: avaliar o espaço anterior ao título, que começa em {item['firstHeadingTop']}px.")
        if previous and previous["smallControls"] != item["smallControls"]:
            lines.append(f"- {page} a {width}px: controles pequenos passaram de {previous['smallControls']} para {item['smallControls']}.")
    if len(lines) == 3:
        lines.append("- Próximo experimento: comparar as capturas móvel e desktop e testar se o visitante encontra a ação principal sem procurar no menu.")
    report = "\n".join(lines) + "\n"
    (OUTPUT / "report.md").write_text(report, encoding="utf-8")
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as handle:
            handle.write(report)
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
