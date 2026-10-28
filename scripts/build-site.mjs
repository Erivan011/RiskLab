import "./build-editorial.mjs";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};
for (const name of await readdir(path.join(root, "web"))) {
  const extension = path.extname(name);
  if (!types[extension]) continue;
  assets["/" + name] = {
    type: types[extension],
    body: await readFile(path.join(root, "web", name), extension === ".png" ? "base64" : "utf8"),
    ...(extension === ".png" ? { encoding: "base64" } : {}),
  };
}
const server = await readFile(path.join(root, "worker/server.mjs"), "utf8");
await mkdir("worker", { recursive: true });
await writeFile(
  "worker/index.js",
  "const ASSETS = " + JSON.stringify(assets) + ";\n" + server,
);
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/index.js", await readFile("worker/index.js"));
await writeFile(
  "dist/.openai/hosting.json",
  await readFile(".openai/hosting.json"),
);
console.log(
  "Built ESM Worker with " +
    Object.keys(assets).length +
    " versioned assets and market API.",
);
