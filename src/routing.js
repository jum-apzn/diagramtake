/** Deterministic, obstacle-aware orthogonal connectors in diagram coordinates. */
const GAP = 9;
const CLEARANCE = 5;
const STUB = 18;
const EPS = 0.001;
const NORMAL = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const same = (a, b) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const rectangle = (node, pad = 0) => ({
  left: node.x - (node.w || 174) / 2 - pad,
  right: node.x + (node.w || 174) / 2 + pad,
  top: node.y - (node.h || 76) / 2 - pad,
  bottom: node.y + (node.h || 76) / 2 + pad,
});
const segments = (points) => points.slice(1).map((b, i) => [points[i], b]);
const pathLength = (points) =>
  segments(points).reduce((sum, [a, b]) => sum + distance(a, b), 0);
const intersectsRect = (a, b, r) =>
  a.x === b.x
    ? a.x > r.left + EPS &&
      a.x < r.right - EPS &&
      Math.max(a.y, b.y) > r.top + EPS &&
      Math.min(a.y, b.y) < r.bottom - EPS
    : a.y > r.top + EPS &&
      a.y < r.bottom - EPS &&
      Math.max(a.x, b.x) > r.left + EPS &&
      Math.min(a.x, b.x) < r.right - EPS;
const rectsOverlap = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function simplify(points) {
  const result = [];
  for (const p of points) {
    if (result.length && same(result.at(-1), p)) continue;
    const a = result.at(-2),
      b = result.at(-1);
    if (
      a &&
      ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0))
    )
      result.pop();
    result.push({ x: p.x, y: p.y });
  }
  return result;
}
function overlapCost(a, b, c, d) {
  const horizontal = a.y === b.y,
    otherHorizontal = c.y === d.y;
  if (horizontal === otherHorizontal) {
    const gap = Math.abs(horizontal ? a.y - c.y : a.x - c.x);
    if (gap >= 14) return 0;
    const lo = Math.max(
      Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
      Math.min(horizontal ? c.x : c.y, horizontal ? d.x : d.y),
    );
    const hi = Math.min(
      Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y),
      Math.max(horizontal ? c.x : c.y, horizontal ? d.x : d.y),
    );
    return Math.max(0, hi - lo) * (gap < EPS ? 12 : 3 * (1 - gap / 14));
  }
  const h1 = horizontal ? a : c,
    h2 = horizontal ? b : d;
  const v1 = horizontal ? c : a,
    v2 = horizontal ? d : b;
  return v1.x > Math.min(h1.x, h2.x) + EPS &&
    v1.x < Math.max(h1.x, h2.x) - EPS &&
    h1.y > Math.min(v1.y, v2.y) + EPS &&
    h1.y < Math.max(v1.y, v2.y) - EPS
    ? 75
    : 0;
}
function port(node, side, offset) {
  const n = NORMAL[side];
  return {
    x: node.x + n.x * ((node.w || 174) / 2 + GAP) + (n.x ? 0 : offset),
    y: node.y + n.y * ((node.h || 76) / 2 + GAP) + (n.y ? 0 : offset),
  };
}
function assignPorts(graph, nodeById, vertical, reverse) {
  const groups = new Map();
  const records = graph.edges
    .map((edge, index) => {
      const from = nodeById.get(edge.from),
        to = nodeById.get(edge.to);
      if (!from || !to) return null;
      const delta =
        (vertical ? to.y - from.y : to.x - from.x) * (reverse ? -1 : 1);
      const back = delta <= 0;
      let startSide, endSide;
      if (from.id === to.id) {
        startSide = "top";
        endSide = "right";
      } else if (back) {
        startSide = endSide = vertical ? "left" : "top";
      } else {
        startSide = vertical
          ? reverse
            ? "top"
            : "bottom"
          : reverse
            ? "left"
            : "right";
        endSide = vertical
          ? reverse
            ? "bottom"
            : "top"
          : reverse
            ? "right"
            : "left";
      }
      const record = { edge, index, from, to, back, startSide, endSide };
      for (const [key, node, side, other] of [
        ["start", from, startSide, to],
        ["end", to, endSide, from],
      ]) {
        const groupKey = `${node.id}:${side}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups
          .get(groupKey)
          .push({
            record,
            key,
            node,
            side,
            coordinate: side === "left" || side === "right" ? other.y : other.x,
          });
      }
      return record;
    })
    .filter(Boolean);
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.coordinate - b.coordinate ||
        a.record.index - b.record.index ||
        a.key.localeCompare(b.key),
    );
    const dimension =
      group[0].side === "left" || group[0].side === "right"
        ? group[0].node.h || 76
        : group[0].node.w || 174;
    const spacing = Math.min(
      22,
      (dimension - 34) / Math.max(1, group.length - 1),
    );
    group.forEach(({ record, key, node, side }, i) => {
      record[key] = port(node, side, (i - (group.length - 1) / 2) * spacing);
    });
  }
  return records;
}
function pathScore(points, obstacles, occupied) {
  let score = pathLength(points) + Math.max(0, points.length - 2) * 18;
  const ss = segments(points);
  for (let i = 0; i < ss.length; i++) {
    const [a, b] = ss[i];
    if (obstacles.some((r) => intersectsRect(a, b, r))) return Infinity;
    for (const [c, d] of occupied) score += overlapCost(a, b, c, d);
    // A route must not double back over itself, even in a narrow gap.
    for (let j = 0; j < i; j++)
      if (
        overlapCost(a, b, ...ss[j]) > 0 &&
        ((a.x === b.x && ss[j][0].x === ss[j][1].x && a.x === ss[j][0].x) ||
          (a.y === b.y && ss[j][0].y === ss[j][1].y && a.y === ss[j][0].y))
      )
        return Infinity;
  }
  return score;
}
/** Small rectilinear visibility grid, used only when simple channels are blocked. */
function gridPath(start, end, obstacles, occupied) {
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.left - 14, r.right + 14]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.top - 14, r.bottom + 14]),
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    height = ys.length;
  const index = (x, y) => y * width + x;
  const point = (id) => ({ x: xs[id % width], y: ys[Math.floor(id / width)] });
  const s = index(xs.indexOf(start.x), ys.indexOf(start.y));
  const target = index(xs.indexOf(end.x), ys.indexOf(end.y));
  const best = new Map([[s * 3, 0]]),
    previous = new Map(),
    heap = [];
  const push = (entry) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].cost <= entry.cost) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost)
          child++;
        if (heap[child].cost >= last.cost) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  push({ state: s * 3, cost: 0 });
  while (heap.length) {
    const current = pop();
    if (current.cost !== best.get(current.state)) continue;
    const id = Math.floor(current.state / 3),
      direction = current.state % 3;
    if (id === target) {
      const path = [];
      for (
        let state = current.state;
        state !== undefined;
        state = previous.get(state)
      )
        path.push(point(Math.floor(state / 3)));
      return simplify(path.reverse());
    }
    const x = id % width,
      y = Math.floor(id / width),
      a = point(id);
    for (const [nx, ny, nextDirection] of [
      [x - 1, y, 1],
      [x + 1, y, 1],
      [x, y - 1, 2],
      [x, y + 1, 2],
    ]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nextId = index(nx, ny),
        b = point(nextId);
      if (obstacles.some((r) => intersectsRect(a, b, r))) continue;
      const nextState = nextId * 3 + nextDirection;
      const cost =
        current.cost +
        distance(a, b) +
        (direction && direction !== nextDirection ? 18 : 0) +
        occupied.reduce((sum, [c, d]) => sum + overlapCost(a, b, c, d), 0);
      if (cost >= (best.get(nextState) ?? Infinity)) continue;
      best.set(nextState, cost);
      previous.set(nextState, current.state);
      push({ state: nextState, cost });
    }
  }
  return null;
}
function makeRoute(record, nodes, obstacles, occupied, vertical, laneIndex) {
  const { start: s, end: t, startSide, endSide, from, to, back } = record;
  const a = {
    x: s.x + NORMAL[startSide].x * STUB,
    y: s.y + NORMAL[startSide].y * STUB,
  };
  const b = {
    x: t.x + NORMAL[endSide].x * STUB,
    y: t.y + NORMAL[endSide].y * STUB,
  };
  const ra = rectangle(from),
    rb = rectangle(to);
  const preferred = vertical
    ? Math.min(ra.left, rb.left) - 44 - laneIndex * 28
    : Math.min(ra.top, rb.top) - 44 - laneIndex * 28;
  const xChannels = [
    ...new Set([
      (a.x + b.x) / 2,
      a.x,
      b.x,
      ...(back && vertical ? [preferred] : []),
      ...nodes.flatMap((n) => {
        const r = rectangle(n);
        return [r.left - 28, r.right + 28];
      }),
    ]),
  ];
  const yChannels = [
    ...new Set([
      (a.y + b.y) / 2,
      a.y,
      b.y,
      ...(back && !vertical ? [preferred] : []),
      ...nodes.flatMap((n) => {
        const r = rectangle(n);
        return [r.top - 32, r.bottom + 32];
      }),
    ]),
  ];
  const candidates = [];
  // Unbent connectors need no stubs and retain the full gap between close cards.
  const ns = NORMAL[startSide],
    nt = NORMAL[endSide];
  if (
    (s.x === t.x || s.y === t.y) &&
    (t.x - s.x) * ns.x + (t.y - s.y) * ns.y > 0 &&
    (s.x - t.x) * nt.x + (s.y - t.y) * nt.y > 0
  )
    candidates.push([s, t]);
  if (back && from.id !== to.id) {
    if (vertical)
      candidates.push([
        s,
        a,
        { x: preferred, y: a.y },
        { x: preferred, y: b.y },
        b,
        t,
      ]);
    else
      candidates.push([
        s,
        a,
        { x: a.x, y: preferred },
        { x: b.x, y: preferred },
        b,
        t,
      ]);
  }
  for (const x of xChannels)
    candidates.push([s, a, { x, y: a.y }, { x, y: b.y }, b, t]);
  for (const y of yChannels)
    candidates.push([s, a, { x: a.x, y }, { x: b.x, y }, b, t]);
  // Four bends cover a self-loop and routes with differently-oriented ports.
  candidates.push(
    [s, a, { x: b.x, y: a.y }, b, t],
    [s, a, { x: a.x, y: b.y }, b, t],
  );
  let points = null,
    score = Infinity;
  for (const candidate of candidates) {
    const simple = simplify(candidate),
      value = pathScore(simple, obstacles, occupied);
    if (value < score) {
      points = simple;
      score = value;
    }
  }
  if (!points) {
    const middle = gridPath(a, b, obstacles, occupied);
    if (middle) points = simplify([s, ...middle, t]);
  }
  // Overlapping cards can make a clean route impossible; still return finite geometry.
  if (!points) points = simplify([s, a, { x: a.x, y: b.y }, b, t]);
  return {
    points,
    length: pathLength(points),
    label: pointOnRoute({ points }, 0.5),
  };
}
function labelWidth(text) {
  return Math.min(
    250,
    Math.max(
      32,
      [...text].reduce(
        (width, c) => width + (c.charCodeAt(0) < 256 ? 6.5 : 12),
        0,
      ) + 20,
    ),
  );
}
function placeLabel(route, text, nodes, labels, allSegments) {
  const width = labelWidth(text),
    height = 24;
  const candidates = [];
  for (const [a, b] of segments(route.points)) {
    const horizontal = a.y === b.y,
      length = distance(a, b);
    for (const fraction of [0.5, 0.3, 0.7, 0.15, 0.85, 0, 1]) {
      const x = a.x + (b.x - a.x) * fraction,
        y = a.y + (b.y - a.y) * fraction;
      for (const offset of [20, 36, 52, 68, 84])
        for (const side of [-1, 1])
          candidates.push({
            x: x + (horizontal ? 0 : side * (width / 2 + offset - 9)),
            y: y + (horizontal ? side * offset : 0),
            preference:
              (horizontal ? 0 : 18) +
              (offset - 20) * 1.5 +
              Math.max(0, (horizontal ? width : height) - length) * 2 +
              Math.abs(fraction - 0.5) * 30 +
              (side === 1 ? 3 : 0),
          });
    }
  }
  let best,
    bestScore = Infinity;
  for (const c of candidates) {
    const r = {
      left: c.x - width / 2,
      right: c.x + width / 2,
      top: c.y - height / 2,
      bottom: c.y + height / 2,
    };
    let score = c.preference;
    score +=
      nodes.filter((n) => rectsOverlap(r, rectangle(n, 6))).length * 100000;
    score += labels.filter((other) => rectsOverlap(r, other)).length * 50000;
    score +=
      allSegments.filter(([a, b]) => intersectsRect(a, b, r)).length * 1500;
    if (score < bestScore) {
      bestScore = score;
      best = { x: c.x, y: c.y, rect: r };
    }
  }
  if (!best) return route.label;
  labels.push(best.rect);
  return { x: best.x, y: best.y };
}
/** Returns a stable Map keyed by edge id; label is the center of the label pill. */
export function routeEdges(graph) {
  const nodes = graph.nodes || [],
    nodeById = new Map(nodes.map((n) => [n.id, n]));
  const vertical = ["TD", "TB", "BT"].includes(graph.direction),
    reverse = ["RL", "BT"].includes(graph.direction);
  const records = assignPorts(graph, nodeById, vertical, reverse);
  const obstacles = nodes.map((n) => rectangle(n, CLEARANCE)),
    occupied = [],
    routes = new Map();
  let returnLane = 0;
  // Forward connections establish the short, clear reading path before loopbacks.
  for (const record of [...records].sort(
    (a, b) => Number(a.back) - Number(b.back) || a.index - b.index,
  )) {
    const route = makeRoute(
      record,
      nodes,
      obstacles,
      occupied,
      vertical,
      record.back ? returnLane++ : 0,
    );
    routes.set(record.edge.id, route);
    occupied.push(...segments(route.points));
  }
  const labels = [];
  for (const record of records) {
    const route = routes.get(record.edge.id);
    if (record.edge.label)
      route.label = placeLabel(
        route,
        record.edge.label,
        nodes,
        labels,
        occupied,
      );
  }
  return new Map(records.map(({ edge }) => [edge.id, routes.get(edge.id)]));
}
/** Constant-speed position along a polyline, independent of segment lengths. */
export function pointOnRoute(route, t) {
  const points = Array.isArray(route) ? route : route?.points || [];
  if (!points.length) return { x: 0, y: 0 };
  const total = pathLength(points);
  let remaining = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = distance(a, b);
    if (remaining <= length && length > 0) {
      const fraction = remaining / length;
      return {
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
      };
    }
    remaining -= length;
  }
  return { ...points.at(-1) };
}
/** Unit tangent at the arrow tip, suitable for atan2(tangent.y, tangent.x). */
export function tangentAtEnd(route) {
  const points = Array.isArray(route) ? route : route?.points || [];
  for (let i = points.length - 1; i > 0; i--) {
    const length = distance(points[i - 1], points[i]);
    if (length)
      return {
        x: (points[i].x - points[i - 1].x) / length,
        y: (points[i].y - points[i - 1].y) / length,
      };
  }
  return { x: 1, y: 0 };
}
