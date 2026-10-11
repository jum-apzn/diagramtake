import { COLORS, sceneAt, totalDuration } from "./model.js";
import { routeEdges, pointOnRoute } from "./routing.js";
export const WIDTH = 1280,
  HEIGHT = 720;
const ease = (x) => x * x * (3 - 2 * x),
  mix = (a, b, t) => a + (b - a) * t;
const routeCache = new WeakMap();
function routesFor(graph) {
  if (!routeCache.has(graph)) routeCache.set(graph, routeEdges(graph));
  return routeCache.get(graph);
}
function box(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function cameraFor(scene, graph) {
  const focus =
      (scene.camera === "focus" || scene.effect === "focus") &&
      scene.nodes.length > 0,
    ns = focus
      ? graph.nodes.filter((n) => scene.nodes.includes(n.id))
      : graph.nodes,
    routes = routesFor(graph),
    points = graph.edges
      .filter((e) => !focus || scene.edges.includes(e.id))
      .flatMap((e) => {
        const r = routes.get(e.id);
        return r
          ? [
              ...r.points,
              ...(e.label
                ? [
                    { x: r.label.x - 70, y: r.label.y - 14 },
                    { x: r.label.x + 70, y: r.label.y + 14 },
                  ]
                : []),
            ]
          : [];
      });
  const xs = [
      ...ns.flatMap((n) => [n.x - 105, n.x + 105]),
      ...points.map((p) => p.x),
    ],
    ys = [
      ...ns.flatMap((n) => [n.y - 65, n.y + 65]),
      ...points.map((p) => p.y - 22),
      ...points.map((p) => p.y + 22),
    ];
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    z: Math.min(
      focus ? 1.1 + 0.4 * (scene.intensity ?? 0.7) : 1,
      1120 / (right - left),
      340 / (bottom - top),
    ),
  };
}
export function frameState(project, graph, time) {
  const current = sceneAt(project, time),
    prev = project.scenes[Math.max(0, current.index - 1)],
    a = cameraFor(prev, graph),
    b = cameraFor(current.scene, graph),
    speed = current.scene.speed ?? 1,
    blend = ease(
      Math.min(
        1,
        Math.max(0, (time - current.start) / (0.85 / Math.sqrt(speed))),
      ),
    );
  return {
    ...current,
    camera: {
      x: mix(a.x, b.x, blend),
      y: mix(a.y, b.y, blend),
      z: mix(a.z, b.z, blend),
    },
  };
}
// Cubic helpers remain available for integrations using the original renderer API.
export function edgeCurve(edge, graph) {
  const a = graph.nodes.find((n) => n.id === edge.from),
    b = graph.nodes.find((n) => n.id === edge.to);
  return [
    { x: a.x, y: a.y },
    { x: (a.x + b.x) / 2, y: a.y },
    { x: (a.x + b.x) / 2, y: b.y },
    { x: b.x, y: b.y },
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
function wrap(ctx, text, width, maxLines = 3) {
  const lines = [];
  let line = "";
  for (const char of [...text]) {
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
function drawRoute(ctx, route, progress = 1) {
  const points = route.points;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  let remaining = route.length * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining < len) {
      const f = len ? remaining / len : 0;
      ctx.lineTo(mix(a.x, b.x, f), mix(a.y, b.y, f));
      break;
    }
    ctx.lineTo(b.x, b.y);
    remaining -= len;
  }
  ctx.stroke();
}
function arrow(ctx, route, color, progress = 1) {
  if (progress < 0.98) return;
  const p = route.points,
    tip = p[p.length - 1],
    prev = p[p.length - 2],
    angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(
    tip.x - 8 * Math.cos(angle - 0.48),
    tip.y - 8 * Math.sin(angle - 0.48),
  );
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(
    tip.x - 8 * Math.cos(angle + 0.48),
    tip.y - 8 * Math.sin(angle + 0.48),
  );
  ctx.stroke();
}
export function renderFrame(canvas, project, graph, time) {
  const ctx = canvas.getContext("2d");
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const state = frameState(project, graph, time),
    s = state.scene,
    accent = COLORS[s.color] || COLORS.violet,
    effect = s.effect || "flow",
    intensity = s.intensity ?? 0.7,
    speed = s.speed ?? 1,
    elapsed = Math.max(0, time - state.start),
    entry = ease(Math.min(1, (elapsed * speed) / 0.85)),
    routes = routesFor(graph);
  ctx.fillStyle = "#fbfcf9";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.font = "500 13px system-ui,sans-serif";
  ctx.fillStyle = "#7a856f";
  ctx.fillText("DiagramTake", 54, 45);
  ctx.textAlign = "right";
  ctx.fillText(
    `${String(state.index + 1).padStart(2, "0")}  /  ${String(project.scenes.length).padStart(2, "0")}`,
    1226,
    45,
  );
  ctx.textAlign = "left";
  ctx.font = "600 30px system-ui,sans-serif";
  ctx.fillStyle = "#354033";
  ctx.fillText(project.title, 54, 94, 1172);
  const c = state.camera;
  ctx.save();
  ctx.beginPath();
  ctx.rect(22, 137, 1236, 379);
  ctx.clip();
  ctx.translate(640, 323);
  ctx.scale(c.z, c.z);
  ctx.translate(-c.x, -c.y);
  for (const edge of graph.edges) {
    const route = routes.get(edge.id);
    if (!route) continue;
    const active = s.edges.includes(edge.id),
      color = active ? accent : "#99a78d",
      reveal =
        active && effect === "draw" ? Math.min(1, (elapsed * speed) / 1.6) : 1;
    ctx.globalAlpha = active && effect === "fade" ? 0.2 + 0.8 * entry : 1;
    ctx.strokeStyle = active ? accent : "#a2af97";
    ctx.lineWidth = active ? 2.1 + intensity * 0.7 : 1.5;
    drawRoute(ctx, route, reveal);
    arrow(ctx, route, color, reveal);
    ctx.globalAlpha = 1;
    if (active && effect === "flow") {
      const count = Math.max(1, Math.round(1 + intensity));
      for (let i = 0; i < count; i++) {
        const p = pointOnRoute(route, (elapsed * 0.32 * speed + i / count) % 1);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + intensity * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (active && effect === "pulse") {
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * speed * 3.5));
      ctx.globalAlpha = pulse * 0.22 * intensity;
      ctx.lineWidth = 6 + intensity * 3;
      ctx.strokeStyle = accent;
      drawRoute(ctx, route);
      ctx.globalAlpha = 1;
    }
  }
  // Draw labels after every connector so crossing lines never cover text.
  for (const edge of graph.edges) {
    const route = routes.get(edge.id);
    if (!route || !edge.label) continue;
    const active = s.edges.includes(edge.id),
      p = route.label;
    ctx.font = "500 12px system-ui,sans-serif";
    const label = wrap(ctx, edge.label, 145, 2),
      w = Math.min(
        159,
        Math.max(...label.map((l) => ctx.measureText(l).width)) + 14,
      ),
      h = label.length * 17 + 7;
    ctx.fillStyle = "#fbfcf9";
    box(ctx, p.x - w / 2, p.y - h / 2, w, h, 5);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = active ? accent : "#718062";
    label.forEach((line, i) =>
      ctx.fillText(line, p.x, p.y + (i - (label.length - 1) / 2) * 17),
    );
  }
  for (const node of graph.nodes) {
    const active = s.nodes.includes(node.id);
    const screenX = (node.x - c.x) * c.z + 640,
      screenY = (node.y - c.y) * c.z + 323;
    if (
      !active &&
      (screenX - (node.w * c.z) / 2 < 25 ||
        screenX + (node.w * c.z) / 2 > 1255 ||
        screenY - (node.h * c.z) / 2 < 140 ||
        screenY + (node.h * c.z) / 2 > 513)
    )
      continue;
    ctx.save();
    if (active && effect === "fade") {
      ctx.globalAlpha = 0.2 + 0.8 * entry;
      ctx.translate(0, (1 - entry) * 14 * intensity);
    }
    const x = node.x - node.w / 2,
      y = node.y - node.h / 2;
    ctx.fillStyle = active ? accent + "0d" : "#ffffff";
    ctx.strokeStyle = active ? accent : "#d9dfd2";
    ctx.lineWidth = active ? 1.5 : 1;
    box(ctx, x, y, node.w, node.h, 13);
    ctx.fill();
    ctx.stroke();
    if (active && effect === "pulse") {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * speed * 3.5);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.25 * pulse * intensity;
      ctx.lineWidth = 2;
      const pad = 3 + pulse * 4 * intensity;
      box(ctx, x - pad, y - pad, node.w + pad * 2, node.h + pad * 2, 16);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = active ? "#3e483b" : "#7b8772";
    ctx.font = "500 17px system-ui,sans-serif";
    const lines = wrap(ctx, node.label, node.w - 24, 2);
    lines.forEach((line, i) =>
      ctx.fillText(line, node.x, node.y + (i - (lines.length - 1) / 2) * 23),
    );
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = "#e2e7db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(54, 532);
  ctx.lineTo(1226, 532);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(59, 561, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.font = "500 14px system-ui,sans-serif";
  ctx.fillText(s.title, 74, 562, 1120);
  ctx.fillStyle = "#475340";
  ctx.font = "400 25px system-ui,sans-serif";
  const lines = wrap(ctx, s.narration, 1165, 3);
  lines.forEach((line, i) => ctx.fillText(line, 54, 601 + i * 31));
  ctx.fillStyle = "#e6eadf";
  ctx.fillRect(54, 695, 1172, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(54, 695, 1172 * Math.min(1, time / totalDuration(project)), 2);
  return state;
}
export function hitNode(x, y, state, graph) {
  const c = state.camera,
    gx = (x - 640) / c.z + c.x,
    gy = (y - 323) / c.z + c.y;
  return graph.nodes.find(
    (n) => Math.abs(n.x - gx) <= n.w / 2 && Math.abs(n.y - gy) <= n.h / 2,
  );
}
