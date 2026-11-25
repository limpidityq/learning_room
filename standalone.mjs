import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "./dist/server/index.js";

export function openDatabase(filename) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA journal_mode=WAL");
  // A single process owns this file. Keep it on persistent storage.
  if (!sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'seats'").get()) {
    sqlite.exec(readFileSync(new URL("./drizzle/0000_room.sql", import.meta.url), "utf8"));
  }
  const runBatch = statements => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => statement.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  return {
    prepare(query) {
      const statement = sqlite.prepare(query);
      return { bind: (...args) => ({
        first: () => statement.get(...args),
        run: () => statement.run(...args),
        all: () => ({ results: statement.all(...args) })
      }) };
    },
    batch: runBatch
  };
}

export async function handleRequest(request, db, pagesOrigin) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const isApi = url.pathname.startsWith("/api/");
  const isPages = isApi && Boolean(pagesOrigin) && origin === pagesOrigin;
  if (isApi && origin && origin !== url.origin && !isPages) {
    return new Response(null, { status: 403 });
  }
  const cors = {
    "Access-Control-Allow-Origin": pagesOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin"
  };
  if (isPages && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const response = await worker.fetch(request, { DB: db });
  if (!isPages) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

if (import.meta.main) {
  const origin = process.env.ROOM_SERVER_ORIGIN;
  const pagesOrigin = process.env.ROOM_PAGES_ORIGIN;
  if (!origin || new URL(origin).origin !== origin) throw new Error("Set ROOM_SERVER_ORIGIN to the site's public origin.");
  if (pagesOrigin && new URL(pagesOrigin).origin !== pagesOrigin) throw new Error("Set ROOM_PAGES_ORIGIN to the Pages origin, without its repository path.");
  const db = openDatabase(process.env.ROOM_DATABASE_PATH || "room.sqlite");
  createServer(async (incoming, outgoing) => {
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 4096) {
          outgoing.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = size ? Buffer.concat(chunks) : undefined;
      const path = new URL(incoming.url, origin);
      if (path.origin !== origin) {
        outgoing.writeHead(400).end();
        return;
      }
      const request = new Request(path, { method: incoming.method, headers: incoming.headers, body });
      const response = await handleRequest(request, db, pagesOrigin);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end();
    }
  }).listen(Number(process.env.PORT || 8080), process.env.BIND_HOST || "127.0.0.1");
}
