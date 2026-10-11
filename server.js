import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const path = resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
      if (path !== root && !path.startsWith(root + sep)) throw Error();
      const data = await readFile(
        path === root
          ? resolve(root, "index.html")
          : path.endsWith(sep)
            ? path + "index.html"
            : path,
      );
      res.writeHead(200, {
        "Content-Type":
          types[extname(path)] ||
          (path === root || path.endsWith(sep)
            ? types[".html"]
            : "application/octet-stream"),
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT) || 5173, "0.0.0.0", () =>
    console.log("DiagramTake → http://localhost:" + (process.env.PORT || 5173)),
  );
