// Optional theme showcase. Uses the exact editor/export renderer; no browser required.
import { writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import {
  demoProject,
  layoutDiagram,
  parseDiagram,
  totalDuration,
} from "../src/model.js";
import { renderFrame, WIDTH, HEIGHT } from "../src/render.js";
import { getTheme } from "../src/themes.js";
const require = createRequire(import.meta.url),
  { createCanvas, GlobalFonts } = require(
    process.env.CANVAS_MODULE || "@napi-rs/canvas",
  );
if (process.env.KOREAN_FONT)
  GlobalFonts.registerFromPath(process.env.KOREAN_FONT, "system-ui");
const dir = new URL("../docs/themes/", import.meta.url);
await mkdir(dir, { recursive: true });
const project = demoProject(),
  graph = layoutDiagram(parseDiagram(project.source)),
  canvas = createCanvas(WIDTH, HEIGHT),
  comparison = createCanvas(1920, 414),
  ctx = comparison.getContext("2d");
for (const [i, theme] of ["light", "dark", "paper"].entries()) {
  project.theme = theme;
  renderFrame(canvas, project, graph, 2.4);
  await writeFile(new URL(theme + ".png", dir), canvas.toBuffer("image/png"));
  const p = getTheme(theme);
  ctx.fillStyle = p.background;
  ctx.fillRect(i * 640, 0, 640, 414);
  ctx.fillStyle = p.title;
  ctx.font = "500 20px system-ui,sans-serif";
  ctx.fillText(p.name, i * 640 + 27, 36);
  ctx.drawImage(canvas, i * 640, 54, 640, 360);
}
await writeFile(
  new URL("themes-comparison.png", dir),
  comparison.toBuffer("image/png"),
);
project.theme = "dark";
for (const scene of project.scenes) scene.duration = 2.4;
await writeFile(
  new URL("../examples/dark-theme.json", import.meta.url),
  JSON.stringify(project, null, 2) + "\n",
);
const output = new URL("dark-story.mp4", dir).pathname,
  fps = 30;
const ff = spawn(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-crf",
    "21",
    "-movflags",
    "+faststart",
    output,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
for (let i = 0; i < Math.ceil(totalDuration(project) * fps); i++) {
  renderFrame(canvas, project, graph, i / fps);
  if (!ff.stdin.write(canvas.toBuffer("image/png")))
    await once(ff.stdin, "drain");
}
ff.stdin.end();
const [code] = await once(ff, "close");
if (code) throw Error("ffmpeg failed: " + code);
console.log(output);
