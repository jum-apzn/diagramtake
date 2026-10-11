import { COLORS, sceneAt, totalDuration } from "./model.js";
export const WIDTH = 1280,
  HEIGHT = 720;
const ease = (x) => x * x * (3 - 2 * x);
const mix = (a, b, t) => a + (b - a) * t;
function box(ctx, x, y, w, h, r = 16) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function cameraFor(scene, graph) {
  const focus = scene.camera === "focus" && scene.nodes.length > 0;
  const selected = graph.nodes.filter((n) => scene.nodes.includes(n.id));
  const ns = focus && selected.length ? selected : graph.nodes;
  const left = Math.min(...ns.map((n) => n.x - 100)),
    right = Math.max(...ns.map((n) => n.x + 100)),
    top = Math.min(...ns.map((n) => n.y - 60)),
    bottom = Math.max(...ns.map((n) => n.y + 60));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    z: Math.min(
      focus ? 1.7 : 1,
      (focus ? 1000 : 1180) / (right - left),
      340 / (bottom - top),
    ),
  };
}
export function frameState(project, graph, time) {
  const current = sceneAt(project, time),
    prev = project.scenes[Math.max(0, current.index - 1)],
    a = cameraFor(prev, graph),
    b = cameraFor(current.scene, graph),
    blend = ease(Math.min(1, (time - current.start) / 0.8));
  return {
    ...current,
    camera: {
      x: mix(a.x, b.x, blend),
      y: mix(a.y, b.y, blend),
      z: mix(a.z, b.z, blend),
    },
  };
}
export function edgeCurve(edge, graph) {
  const a = graph.nodes.find((n) => n.id === edge.from),
    b = graph.nodes.find((n) => n.id === edge.to),
    vertical = ["TD", "TB", "BT"].includes(graph.direction),
    back = graph.edges.some((e) => e.from === edge.to && e.to === edge.from);
  if (a.id === b.id)
    return [
      { x: a.x, y: a.y - 38 },
      { x: a.x + 150, y: a.y - 145 },
      { x: a.x - 150, y: a.y - 145 },
      { x: a.x, y: a.y - 38 },
    ];
  if (vertical) {
    const sign = b.y >= a.y ? 1 : -1;
    return [
      { x: a.x, y: a.y + 38 * sign },
      { x: a.x + (back ? 65 : 0), y: (a.y + b.y) / 2 },
      { x: b.x + (back ? 65 : 0), y: (a.y + b.y) / 2 },
      { x: b.x, y: b.y - 38 * sign },
    ];
  }
  const sign = b.x >= a.x ? 1 : -1,
    loop = back ? (sign > 0 ? -75 : 90) : 0;
  return [
    { x: a.x + 87 * sign, y: a.y },
    { x: (a.x + b.x) / 2, y: a.y + loop },
    { x: (a.x + b.x) / 2, y: b.y + loop },
    { x: b.x - 87 * sign, y: b.y },
  ];
}
export function pointOnCurve(p, t) {
  const u = 1 - t;
  return {
    x:
      u * u * u * p[0].x +
      3 * u * u * t * p[1].x +
      3 * u * t * t * p[2].x +
      t * t * t * p[3].x,
    y:
      u * u * u * p[0].y +
      3 * u * u * t * p[1].y +
      3 * u * t * t * p[2].y +
      t * t * t * p[3].y,
  };
}
function drawPath(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  ctx.bezierCurveTo(p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
}
function wrap(ctx, text, width, maxLines = 3) {
  const chars = [...text],
    lines = [];
  let line = "";
  for (const char of chars) {
    if (char === "\n" || ctx.measureText(line + char).width > width) {
      lines.push(line);
      line = char === "\n" ? "" : char;
    } else line += char;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    while (ctx.measureText(lines[maxLines - 1] + "…").width > width)
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    lines[maxLines - 1] += "…";
  }
  return lines;
}
export function renderFrame(
  canvas,
  project,
  graph,
  time,
  { editing = false } = {},
) {
  const ctx = canvas.getContext("2d");
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  const state = frameState(project, graph, time),
    s = state.scene,
    accent = COLORS[s.color] || COLORS.lime;
  ctx.fillStyle = "#11161c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const gradient = ctx.createRadialGradient(900, 180, 0, 800, 200, 700);
  gradient.addColorStop(0, "#202b2a");
  gradient.addColorStop(1, "#11161c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#2b353b";
  for (let x = 24; x < WIDTH; x += 26)
    for (let y = 24; y < 520; y += 26) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.textBaseline = "middle";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillStyle = "#8c999f";
  ctx.fillText("DIAGRAMTAKE  /  VISUAL STORY", 54, 48);
  ctx.textAlign = "right";
  ctx.fillText(
    `${String(state.index + 1).padStart(2, "0")} / ${String(project.scenes.length).padStart(2, "0")}`,
    1226,
    48,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = "#f1f4f0";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(project.title.slice(0, 65), 54, 99);
  const c = state.camera;
  ctx.save();
  ctx.beginPath();
  ctx.rect(20, 125, 1240, 380);
  ctx.clip();
  ctx.translate(640, 320);
  ctx.scale(c.z, c.z);
  ctx.translate(-c.x, -c.y);
  for (const edge of graph.edges) {
    const p = edgeCurve(edge, graph),
      active = s.edges.includes(edge.id);
    ctx.strokeStyle = active ? accent : "#414b54";
    ctx.lineWidth = active ? 3.5 : 2;
    drawPath(ctx, p);
    ctx.stroke();
    const tip = p[3],
      near = pointOnCurve(p, 0.98),
      angle = Math.atan2(tip.y - near.y, tip.x - near.x);
    ctx.fillStyle = active ? accent : "#59636c";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - 11 * Math.cos(angle - 0.45),
      tip.y - 11 * Math.sin(angle - 0.45),
    );
    ctx.lineTo(
      tip.x - 11 * Math.cos(angle + 0.45),
      tip.y - 11 * Math.sin(angle + 0.45),
    );
    ctx.closePath();
    ctx.fill();
    if (edge.label) {
      const mid = pointOnCurve(p, 0.5);
      ctx.font = "500 12px system-ui, sans-serif";
      const width = ctx.measureText(edge.label).width;
      ctx.fillStyle = "#151c22";
      box(ctx, mid.x - width / 2 - 8, mid.y - 27, width + 16, 22, 7);
      ctx.fill();
      ctx.fillStyle = active ? accent : "#8e9aa4";
      ctx.textAlign = "center";
      ctx.fillText(edge.label, mid.x, mid.y - 16);
    }
    if (active) {
      for (let i = 0; i < 2; i++) {
        const pos = pointOnCurve(
          p,
          ((time - state.start) * 0.52 + i * 0.5) % 1,
        );
        ctx.shadowColor = accent;
        ctx.shadowBlur = 15;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
  for (const node of graph.nodes) {
    const active = s.nodes.includes(node.id);
    ctx.fillStyle = active ? "#252f31" : "#1b222b";
    ctx.strokeStyle = active ? accent : "#46515d";
    ctx.lineWidth = active ? 2 : 1;
    ctx.shadowColor = active ? accent + "22" : "transparent";
    ctx.shadowBlur = active ? 22 : 0;
    box(ctx, node.x - node.w / 2, node.y - node.h / 2, node.w, node.h, 17);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.fillStyle = active ? "#f3f8eb" : "#98a4af";
    ctx.font = "600 17px system-ui, sans-serif";
    const lines = wrap(ctx, node.label, node.w - 24, 2);
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        node.x,
        node.y - 4 + (i - (lines.length - 1) / 2) * 21,
      ),
    );
    ctx.fillStyle = active ? accent : "#697783";
    ctx.font = "10px ui-monospace,monospace";
    ctx.fillText(node.id.toUpperCase(), node.x, node.y + 23);
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  box(ctx, 54, 539, 38, 4, 2);
  ctx.fill();
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText(s.title, 106, 541);
  ctx.fillStyle = "#f3f6f0";
  ctx.font = "500 25px system-ui,sans-serif";
  const lines = wrap(ctx, s.narration, 1150, 3);
  lines.forEach((line, i) => ctx.fillText(line, 54, 582 + i * 35));
  ctx.fillStyle = "#29353d";
  ctx.fillRect(54, 685, 1172, 3);
  ctx.fillStyle = accent;
  ctx.fillRect(54, 685, 1172 * Math.min(1, time / totalDuration(project)), 3);
  return state;
}
export function hitNode(x, y, state, graph) {
  const c = state.camera;
  const gx = (x - 640) / c.z + c.x,
    gy = (y - 320) / c.z + c.y;
  return graph.nodes.find(
    (n) => Math.abs(n.x - gx) <= n.w / 2 && Math.abs(n.y - gy) <= n.h / 2,
  );
}
