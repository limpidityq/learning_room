const json = (data, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});
const token = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

async function api(request, db, path) {
  const now = Date.now();
  if (path === "/api/room" && request.method === "POST") {
    const room = crypto.randomUUID();
    const owner = token();
    const guest = token();
    await db.batch([
      db.prepare("INSERT INTO seats (room,slot,token,nickname,seen) VALUES (?,1,?,?,?)").bind(room, owner, "我", now),
      db.prepare("INSERT INTO seats (room,slot,token) VALUES (?,2,?)").bind(room, guest)
    ]);
    return json({ token: owner }, 201);
  }
  if (path !== "/api/seat" || request.method !== "POST") return json({ error: "找不到此操作。" }, 404);
  const key = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return json({ error: "座位链接无效。" }, 401);
  const self = await db.prepare("SELECT room, slot FROM seats WHERE token = ?").bind(key).first();
  if (!self) return json({ error: "座位链接无效。" }, 401);
  const raw = await request.text();
  if (raw.length > 2000) return json({ error: "输入太长。" }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: "请求格式错误。" }, 400); }
  if (!data || typeof data !== "object") return json({ error: "请求格式错误。" }, 400);
  const action = data.action;
  if (action === "join") {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name || name.length > 20) return json({ error: "请输入 1 至 20 字的昵称。" }, 400);
    await db.prepare("UPDATE seats SET nickname=?, seen=? WHERE token=? AND nickname=''").bind(name, now, key).run();
  } else if (action === "task") {
    if (typeof data.task !== "string" || data.task.trim().length > 80) return json({ error: "任务最多 80 字。" }, 400);
    await db.prepare("UPDATE seats SET task=?, seen=? WHERE token=? AND nickname<>''").bind(data.task.trim(), now, key).run();
  } else if (action === "start") {
    await db.prepare("UPDATE seats SET started=COALESCE(started,?), seen=? WHERE token=? AND nickname<>''").bind(now, now, key).run();
  } else if (action === "pause") {
    await db.prepare("UPDATE seats SET elapsed=elapsed+MAX(0,?-COALESCE(started,?)), started=NULL, seen=? WHERE token=? AND nickname<>''").bind(now, now, now, key).run();
  } else if (action === "finish") {
    await db.prepare("UPDATE seats SET total=total+elapsed+MAX(0,?-COALESCE(started,?)), elapsed=0, started=NULL, seen=? WHERE token=? AND nickname<>''").bind(now, now, now, key).run();
  } else if (action === undefined) {
    // Keep guest seats empty until their recipient chooses a name.
    await db.prepare("UPDATE seats SET seen=? WHERE token=? AND nickname<>''").bind(now, key).run();
  } else {
    return json({ error: "找不到此操作。" }, 400);
  }
  const { results } = await db.prepare("SELECT * FROM seats WHERE room=? ORDER BY slot").bind(self.room).all();
  return json({
    now, slot: self.slot,
    invite: self.slot === 1 ? results[1].token : undefined,
    seats: results.map(({ slot, nickname, task, started, elapsed, total, seen }) => ({
      slot, nickname, task, started, elapsed, total, online: Boolean(seen && now - seen < 45000)
    }))
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      try { return await api(request, env.DB, pathname); }
      catch (error) {
        console.error("Study room request failed:", error.name);
        return json({ error: "暂时连不上自习室，请稍后重试。" }, 503);
      }
    }
    if (pathname === "/forest.jpg") return new Response(Uint8Array.from(atob(art), c => c.charCodeAt(0)), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" }
    });
    if (pathname !== "/") return new Response("Not found", { status: 404 });
    return new Response(html, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    } });
  }
};
