import http from "node:http";
import { readFile } from "node:fs/promises";
import { marketResponse } from "../worker/index.js";
const types = {
  html: "text/html",
  css: "text/css",
  mjs: "text/javascript",
  json: "application/json",
  png: "image/png",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/market") {
        const data = await marketResponse();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }
      const pathname = ["/", "/index.html"].includes(url.pathname) ? "/bi.html" : url.pathname;
      if (!/^\/[\w.-]+$/.test(pathname)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = await readFile(
        new URL("../web" + pathname, import.meta.url),
      );
      res.writeHead(200, {
        "content-type": types[pathname.split(".").at(-1)] ?? "text/plain",
      });
      res.end(file);
    } catch {
      res.writeHead(404);
      res.end("Não encontrado");
    }
  })
  .listen(
    Number(process.argv[process.argv.indexOf("--port") + 1]) ||
      Number(process.env.PORT) ||
      3000,
    "0.0.0.0",
  );
