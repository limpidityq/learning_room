# 动物自习岛 · 双人房

一间在线自习室有两个座位。创建房间后，把伙伴链接发给对方，即可查看彼此的在线状态、任务和专注时长。

## 部署

双人数据由 HTTPS 后端保存。可以用同一个后端直接提供网页，也可以用 GitHub Pages 提供前端。

- 后端使用 Node.js 24.2 或以上版本。先运行 `npm run build`，再以 `node standalone.mjs` 启动，并由反向代理提供 HTTPS。设置 `ROOM_SERVER_ORIGIN` 为后端的公开 HTTPS 来源、`ROOM_DATABASE_PATH` 为持久卷上的 SQLite 文件路径。
- 使用 GitHub Pages 时，将仓库的 Pages 来源设为 GitHub Actions，将 Actions 变量 `ROOM_API_ORIGIN` 设为后端的 HTTPS 来源，并在后端设置 `ROOM_PAGES_ORIGIN` 为 Pages 的来源（不含仓库路径）。工作流发布网页和静态素材。

座位链接相当于该座位的访问凭证，请只发给受邀伙伴。数据库文件和真实房间数据不应提交到 GitHub。
