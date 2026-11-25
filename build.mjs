import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
const [worker, html, art] = await Promise.all([
  readFile("worker.mjs", "utf8"),
  readFile("index.html", "utf8"),
  readFile("forest.jpg")
]);
await mkdir("dist/server", { recursive: true });
try {
  await readFile(".openai/hosting.json");
  await mkdir("dist/.openai", { recursive: true });
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await writeFile("dist/server/index.js",
  "const html = " + JSON.stringify(html) + ";\nconst art = " + JSON.stringify(art.toString("base64")) + ";\n" + worker);
