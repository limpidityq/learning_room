import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const value = process.env.ROOM_API_ORIGIN;
const endpoint = value && new URL(value);
if (!endpoint || endpoint.protocol !== "https:" ||
    ![endpoint.origin, endpoint.origin + "/"].includes(value)) {
  throw new Error("ROOM_API_ORIGIN must be the HTTPS origin of the deployed room API.");
}

const html = await readFile("index.html", "utf8");
await mkdir("dist/pages", { recursive: true });
await copyFile("forest.jpg", "dist/pages/forest.jpg");
await writeFile("dist/pages/index.html", html.replace(
  '<meta name="room-api" content="">',
  '<meta name="room-api" content="' + endpoint.origin + '">'
));
