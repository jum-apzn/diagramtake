// Optional media-generation tool. The web application needs none of these tools.
// CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas/index.js node scripts/render-demo.mjs
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
const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = require(
  process.env.CANVAS_MODULE || "@napi-rs/canvas",
);
if (process.env.KOREAN_FONT)
  GlobalFonts.registerFromPath(process.env.KOREAN_FONT, "system-ui");
const project = demoProject(),
  graph = layoutDiagram(parseDiagram(project.source)),
  canvas = createCanvas(WIDTH, HEIGHT),
  fps = 30;
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../examples/payment-retry.json", import.meta.url),
  JSON.stringify(project, null, 2) + "\n",
);
renderFrame(canvas, project, graph, 10);
await writeFile(
  new URL("../docs/story-frame.png", import.meta.url),
  canvas.toBuffer("image/png"),
);
const output = new URL("../docs/payment-retry.mp4", import.meta.url).pathname;
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
