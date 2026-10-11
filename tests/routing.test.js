import test from "node:test";
import assert from "node:assert/strict";
import { layoutDiagram, parseDiagram, sampleSource } from "../src/model.js";
import { routeEdges, pointOnRoute, tangentAtEnd } from "../src/routing.js";

const segments = (route) =>
  route.points.slice(1).map((p, i) => [route.points[i], p]);
const box = (n) => ({
  left: n.x - n.w / 2,
  right: n.x + n.w / 2,
  top: n.y - n.h / 2,
  bottom: n.y + n.h / 2,
});
function crossesNode(a, b, node) {
  const r = box(node);
  return a.x === b.x
    ? a.x > r.left &&
        a.x < r.right &&
        Math.max(a.y, b.y) > r.top &&
        Math.min(a.y, b.y) < r.bottom
    : a.y > r.top &&
        a.y < r.bottom &&
        Math.max(a.x, b.x) > r.left &&
        Math.min(a.x, b.x) < r.right;
}
function sharedLine(a, b, c, d) {
  if (a.x === b.x && c.x === d.x && a.x === c.x)
    return (
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) >
      0.001
    );
  if (a.y === b.y && c.y === d.y && a.y === c.y)
    return (
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) >
      0.001
    );
  return false;
}
function verifyGeometry(graph, routes) {
  assert.equal(routes.size, graph.edges.length);
  for (const edge of graph.edges) {
    const route = routes.get(edge.id);
    assert.ok(route.points.length >= 2);
    assert.ok(Number.isFinite(route.length) && route.length > 0);
    assert.ok(Number.isFinite(route.label.x) && Number.isFinite(route.label.y));
    for (const [a, b] of segments(route)) {
      assert.ok(a.x === b.x || a.y === b.y, `Non-orthogonal ${edge.id}`);
      assert.ok(a.x !== b.x || a.y !== b.y, `Zero-length ${edge.id}`);
      for (const node of graph.nodes)
        assert.equal(
          crossesNode(a, b, node),
          false,
          `${edge.id} crosses ${node.id}`,
        );
    }
    const target = graph.nodes.find((n) => n.id === edge.to),
      tip = route.points.at(-1),
      tangent = tangentAtEnd(route);
    assert.ok(
      (target.x - tip.x) * tangent.x + (target.y - tip.y) * tangent.y > 0,
      `Arrow points away from ${edge.to}`,
    );
    assert.ok(
      Math.abs(tip.x - target.x) > target.w / 2 ||
        Math.abs(tip.y - target.y) > target.h / 2,
      "Arrow tip must remain outside card",
    );
  }
}
const node = (id, x, y, w = 174, h = 76) => ({ id, x, y, w, h, label: id });

test("sample routes split branches and keep bank/retry in separate lanes", () => {
  const graph = layoutDiagram(parseDiagram(sampleSource));
  const routes = routeEdges(graph);
  verifyGeometry(graph, routes);
  assert.notDeepEqual(routes.get("e2").points[0], routes.get("e4").points[0]);
  for (const [a, b] of segments(routes.get("e2")))
    for (const [c, d] of segments(routes.get("e3")))
      assert.equal(sharedLine(a, b, c, d), false);
  const retry = graph.nodes.find((n) => n.id === "retry");
  assert.ok(
    Math.min(...routes.get("e3").points.map((p) => p.y)) <
      retry.y - retry.h / 2,
  );
  assert.deepEqual(
    [...routeEdges(graph)],
    [...routes],
    "Routing must be repeatable",
  );
});

for (const direction of ["LR", "RL", "TD", "TB", "BT"]) {
  test(`node avoidance and visible arrowheads in ${direction}`, () => {
    const graph = layoutDiagram(
      parseDiagram(
        sampleSource.replace("flowchart LR", `flowchart ${direction}`),
      ),
    );
    verifyGeometry(graph, routeEdges(graph));
  });
}

test("parallel edges receive separate source and target ports", () => {
  const graph = {
    direction: "LR",
    nodes: [node("a", 0, 0), node("b", 330, 0)],
    edges: [0, 1, 2].map((i) => ({
      id: `e${i}`,
      from: "a",
      to: "b",
      label: `path ${i}`,
    })),
  };
  const routes = routeEdges(graph);
  verifyGeometry(graph, routes);
  assert.equal(
    new Set([...routes.values()].map((r) => JSON.stringify(r.points[0]))).size,
    3,
  );
  assert.equal(
    new Set([...routes.values()].map((r) => JSON.stringify(r.points.at(-1))))
      .size,
    3,
  );
  const labelRects = [...routes.values()].map((r) => ({
    left: r.label.x - 30,
    right: r.label.x + 30,
    top: r.label.y - 11,
    bottom: r.label.y + 11,
  }));
  for (let i = 0; i < labelRects.length; i++)
    for (let j = i + 1; j < labelRects.length; j++) {
      const a = labelRects[i],
        b = labelRects[j];
      assert.equal(
        a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top,
        false,
      );
    }
});

test("self-loop exits and enters different faces without crossing its card", () => {
  const graph = {
    direction: "LR",
    nodes: [node("a", 0, 0)],
    edges: [{ id: "loop", from: "a", to: "a", label: "retry" }],
  };
  const routes = routeEdges(graph);
  verifyGeometry(graph, routes);
  assert.notDeepEqual(
    routes.get("loop").points[0],
    routes.get("loop").points.at(-1),
  );
});

test("routes around an intermediate card rather than through it", () => {
  const graph = {
    direction: "LR",
    nodes: [node("a", 0, 0), node("b", 600, 0), node("obstacle", 300, 0)],
    edges: [{ id: "edge", from: "a", to: "b", label: "skip" }],
  };
  const routes = routeEdges(graph);
  verifyGeometry(graph, routes);
  assert.ok(routes.get("edge").points.length > 2);
});

test("tight rank spacing leaves distinct ports and clean turns", () => {
  const graph = {
    direction: "LR",
    nodes: [node("a", 0, 0), node("b", 230, -65), node("c", 230, 65)],
    edges: [
      { id: "up", from: "a", to: "b" },
      { id: "down", from: "a", to: "c" },
      { id: "return", from: "b", to: "a" },
    ],
  };
  verifyGeometry(graph, routeEdges(graph));
});

test("routing does not mutate graph objects", () => {
  const graph = layoutDiagram(parseDiagram(sampleSource));
  const original = structuredClone(graph);
  routeEdges(graph);
  assert.deepEqual(graph, original);
});

test("positions use distance along route and clamp to endpoints", () => {
  const route = {
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
    ],
  };
  assert.deepEqual(pointOnRoute(route, 0.5), { x: 20, y: 0 });
  assert.deepEqual(pointOnRoute(route, 0.875), { x: 30, y: 5 });
  assert.deepEqual(pointOnRoute(route, -1), { x: 0, y: 0 });
  assert.deepEqual(pointOnRoute(route, 2), { x: 30, y: 10 });
  assert.deepEqual(tangentAtEnd(route), { x: 0, y: 1 });
  assert.deepEqual(pointOnRoute({ points: [] }, 0.5), { x: 0, y: 0 });
});
