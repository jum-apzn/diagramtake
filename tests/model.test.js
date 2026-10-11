import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDiagram,
  layoutDiagram,
  demoProject,
  validateProject,
  sceneAt,
  totalDuration,
  makeScene,
} from "../src/model.js";
import { frameState, edgeCurve, pointOnCurve, hitNode } from "../src/render.js";
test("payment story parses Korean labels and cycle without losing nodes", () => {
  const p = demoProject(),
    g = parseDiagram(p.source);
  assert.equal(g.nodes.length, 5);
  assert.equal(g.edges.length, 5);
  assert.equal(g.edges[2].label, "일시적 오류");
  assert.equal(g.edges[3].to, "bank");
  assert.equal(g.nodes.find((n) => n.id === "api").label, "결제 API");
});
test("chained arrows and labels are preserved", () => {
  const g = parseDiagram("flowchart LR\na[One] -->|hello| b[Two] --> c[Three]");
  assert.equal(g.nodes.length, 3);
  assert.deepEqual(
    g.edges.map((e) => e.label),
    ["hello", ""],
  );
});
test("standalone nodes, braces and vertical layout", () => {
  const g = layoutDiagram(
    parseDiagram("flowchart TD\na{Check} --> b(Done)\nc[Alone]"),
  );
  assert.equal(g.nodes.length, 3);
  assert.ok(
    g.nodes.find((n) => n.id === "b").y > g.nodes.find((n) => n.id === "a").y,
  );
});
test("unsupported syntax fails loudly", () => {
  for (const source of [
    "sequenceDiagram\nA->>B:Hi",
    "flowchart LR\na -.-> b",
    "flowchart LR\nsubgraph hi",
    "flowchart LR\na[broken",
    "flowchart ZZ\na --> b",
  ])
    assert.throws(() => parseDiagram(source));
});
test("invalid or excessive diagrams fail", () => {
  assert.throws(() => parseDiagram(""));
  assert.throws(() => parseDiagram("x".repeat(16001)));
  assert.throws(() =>
    parseDiagram(Array.from({ length: 25 }, (_, i) => "n" + i).join("\n")),
  );
});
test("layout finite including cycles and self loops", () => {
  for (const source of [
    "flowchart LR\na --> b\nb --> a",
    "flowchart TD\na --> a",
    demoProject().source,
  ]) {
    const g = layoutDiagram(parseDiagram(source));
    assert.ok(
      g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    );
    g.edges.forEach((e) =>
      assert.ok(
        edgeCurve(e, g).every(
          (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
        ),
      ),
    );
  }
});
test("project JSON roundtrips semantic data", () => {
  const p = demoProject(),
    next = validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(next.title, p.title);
  assert.deepEqual(
    next.scenes.map((s) => s.narration),
    p.scenes.map((s) => s.narration),
  );
  assert.equal(totalDuration(next), 19.5);
});
test("import rejects bad durations, missing targets, schema and unbounded content", () => {
  const p = demoProject();
  for (const value of [NaN, 0, 61, "3"]) {
    const bad = structuredClone(p);
    bad.scenes[0].duration = value;
    assert.throws(() => validateProject(bad));
  }
  const bad = structuredClone(p);
  bad.scenes[0].nodes = ["not-real"];
  assert.throws(() => validateProject(bad));
  assert.throws(() => validateProject({ ...p, version: 2 }));
  assert.throws(() => validateProject({ ...p, scenes: [] }));
  assert.throws(() => validateProject({ ...p, title: "a".repeat(161) }));
});
test("exact boundary picks next scene and end is clamped", () => {
  const p = demoProject();
  assert.equal(sceneAt(p, 4).index, 1);
  assert.equal(sceneAt(p, 19.5).index, 4);
  assert.equal(sceneAt(p, 999).progress, 1);
});
test("focus camera interpolates continuously", () => {
  const p = demoProject(),
    g = layoutDiagram(parseDiagram(p.source));
  const a = frameState(p, g, 3.999).camera,
    b = frameState(p, g, 4).camera;
  assert.deepEqual(a, b);
  assert.ok(frameState(p, g, 5).camera.z > 1);
});
test("node hit testing reverses camera transformation", () => {
  const p = demoProject(),
    g = layoutDiagram(parseDiagram(p.source)),
    state = frameState(p, g, 10),
    n = g.nodes.find((n) => n.id === "bank"),
    c = state.camera;
  const hit = hitNode(
    (n.x - c.x) * c.z + 640,
    (n.y - c.y) * c.z + 320,
    state,
    g,
  );
  assert.equal(hit.id, "bank");
  assert.equal(hitNode(-999, -999, state, g), undefined);
});
test("curve interpolation endpoints are exact", () => {
  const p = [
    { x: 0, y: 0 },
    { x: 1, y: 4 },
    { x: 4, y: 1 },
    { x: 5, y: 5 },
  ];
  assert.deepEqual(pointOnCurve(p, 0), p[0]);
  assert.deepEqual(pointOnCurve(p, 1), p[3]);
  assert.equal(makeScene().duration, 3);
});
