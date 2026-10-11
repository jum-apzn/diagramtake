export const COLORS = {
  lime: "#c6fa76",
  violet: "#ae9bff",
  rose: "#ff8f9c",
  blue: "#87cbff",
};
export const sampleSource = `flowchart LR
  user[고객 · Client] -->|결제 요청| api[결제 API]
  api -->|승인 요청| bank[카드사 · Bank]
  bank -->|일시적 오류| retry[재시도 큐]
  retry -->|다시 시도| bank
  bank -->|승인 완료| receipt[결제 완료]`;
export function parseDiagram(source) {
  if (typeof source !== "string" || source.length > 16000)
    throw Error("Diagram source must be under 16,000 characters.");
  const nodes = new Map(),
    edges = [];
  let direction = "LR";
  const add = (token) => {
    const m = token
      .trim()
      .match(
        /^([A-Za-z_][\w-]*)(?:\[([^\]\n]+)\]|\(([^)\n]+)\)|\{([^}\n]+)\})?$/,
      );
    if (!m) throw Error(`지원하지 않는 노드: ${token}. 예: api[결제 API]`);
    const id = m[1],
      label = m[2] || m[3] || m[4];
    if (label || !nodes.has(id)) nodes.set(id, { id, label: label || id });
    return id;
  };
  for (const raw of source.split(/[\n;]/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    if (/^(flowchart|graph)\s+(LR|RL|TD|TB|BT)$/.test(line)) {
      direction = line.split(/\s+/)[1];
      continue;
    }
    if (/^(flowchart|graph)\b/.test(line))
      throw Error("Use flowchart LR or flowchart TD.");
    const parts = line.split(/\s*-->\s*(?:\|([^|]*)\|\s*)?/);
    if (parts.length === 1) {
      add(line);
      continue;
    }
    let from = add(parts[0]);
    for (let i = 1; i < parts.length; i += 2) {
      const label = parts[i] || "",
        to = add(parts[i + 1]);
      edges.push({ id: `e${edges.length}`, from, to, label });
      from = to;
    }
  }
  if (!nodes.size) throw Error("노드를 하나 이상 추가해 주세요.");
  if (nodes.size > 24 || edges.length > 48)
    throw Error("한 장면에는 노드 24개, 연결 48개까지 사용할 수 있어요.");
  return { nodes: [...nodes.values()], edges, direction };
}
export function layoutDiagram(graph) {
  const rank = new Map(),
    visiting = new Set();
  const walk = (id, depth) => {
    if (visiting.has(id)) return;
    rank.set(id, Math.max(rank.get(id) || 0, depth));
    visiting.add(id);
    for (const e of graph.edges.filter((e) => e.from === id)) {
      if (!visiting.has(e.to) && depth < graph.nodes.length)
        walk(e.to, depth + 1);
    }
    visiting.delete(id);
  };
  const roots = graph.nodes.filter(
    (n) => !graph.edges.some((e) => e.to === n.id),
  );
  for (const n of roots.length ? roots : [graph.nodes[0]]) walk(n.id, 0);
  for (const n of graph.nodes) if (!rank.has(n.id)) rank.set(n.id, 0);
  const levels = new Map();
  for (const n of graph.nodes) {
    const r = rank.get(n.id);
    if (!levels.has(r)) levels.set(r, []);
    levels.get(r).push(n);
  }
  const max = Math.max(...rank.values()),
    vertical = ["TD", "TB", "BT"].includes(graph.direction),
    reverse = ["RL", "BT"].includes(graph.direction);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      let r = rank.get(n.id);
      if (reverse) r = max - r;
      const peers = levels.get(rank.get(n.id)),
        j = peers.findIndex((p) => p.id === n.id);
      return {
        ...n,
        x: vertical
          ? 640 + (j - (peers.length - 1) / 2) * 215
          : 640 + (r - max / 2) * Math.max(230, 920 / Math.max(1, max)),
        y: vertical
          ? 320 + (r - max / 2) * Math.max(130, 270 / Math.max(1, max))
          : 320 + (j - (peers.length - 1) / 2) * 130,
        w: 174,
        h: 76,
      };
    }),
  };
}
export function makeScene(part = {}) {
  return {
    id:
      globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    title: "새 장면",
    narration: "이 장면에서 일어나는 일을 설명해 주세요.",
    duration: 3,
    color: "lime",
    nodes: [],
    edges: [],
    camera: "wide",
    ...part,
  };
}
export function demoProject() {
  return {
    version: 1,
    title: "결제는 어떻게 회복할까?",
    source: sampleSource,
    scenes: [
      makeScene({
        title: "한 번의 클릭",
        narration: "고객이 결제 버튼을 누르면, 요청이 결제 API로 전달됩니다.",
        duration: 4,
        nodes: ["user", "api"],
        edges: ["e0"],
      }),
      makeScene({
        title: "승인을 기다리는 순간",
        narration: "결제 API가 카드사에 승인을 요청합니다.",
        duration: 3.5,
        nodes: ["api", "bank"],
        edges: ["e1"],
        camera: "focus",
        color: "violet",
      }),
      makeScene({
        title: "실패는 끝이 아니다",
        narration:
          "일시적 오류가 발생해도 요청을 잃지 않습니다. 재시도 큐에 보관하죠.",
        duration: 4.5,
        nodes: ["bank", "retry"],
        edges: ["e2"],
        camera: "focus",
        color: "rose",
      }),
      makeScene({
        title: "다시, 안전하게",
        narration: "잠시 후 큐가 카드사로 요청을 다시 전달합니다.",
        duration: 3.5,
        nodes: ["retry", "bank"],
        edges: ["e3"],
        camera: "focus",
        color: "blue",
      }),
      makeScene({
        title: "그리고 결제 완료",
        narration:
          "승인이 돌아오면 결제가 완료됩니다. 실패를 견디는 흐름입니다.",
        duration: 4,
        nodes: ["bank", "receipt"],
        edges: ["e4"],
        color: "lime",
      }),
    ],
  };
}
export const totalDuration = (p) =>
  p.scenes.reduce((a, s) => a + s.duration, 0);
export function sceneAt(p, time) {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    if (time < start + s.duration || i === p.scenes.length - 1)
      return {
        scene: s,
        index: i,
        start,
        progress: Math.max(0, Math.min(1, (time - start) / s.duration)),
      };
    start += s.duration;
  }
  throw Error("No scenes");
}
export function validateProject(input) {
  if (
    !input ||
    input.version !== 1 ||
    typeof input.title !== "string" ||
    input.title.length > 160 ||
    !Array.isArray(input.scenes) ||
    !input.scenes.length ||
    input.scenes.length > 100
  )
    throw Error("올바른 DiagramTake v1 프로젝트가 아니에요.");
  const graph = parseDiagram(input.source),
    ids = new Set(graph.nodes.map((n) => n.id)),
    edges = new Set(graph.edges.map((e) => e.id));
  const scenes = input.scenes.map((s) => {
    if (
      !s ||
      typeof s.title !== "string" ||
      s.title.length > 160 ||
      typeof s.narration !== "string" ||
      s.narration.length > 2000 ||
      !Number.isFinite(s.duration) ||
      s.duration < 0.5 ||
      s.duration > 60 ||
      !Array.isArray(s.nodes) ||
      !Array.isArray(s.edges) ||
      s.nodes.some((n) => !ids.has(n)) ||
      s.edges.some((e) => !edges.has(e))
    )
      throw Error("장면의 길이 또는 대상이 올바르지 않아요.");
    return makeScene({
      title: s.title,
      narration: s.narration,
      duration: s.duration,
      nodes: [...new Set(s.nodes)],
      edges: [...new Set(s.edges)],
      color: COLORS[s.color] ? s.color : "lime",
      camera: s.camera === "focus" ? "focus" : "wide",
    });
  });
  return { version: 1, title: input.title, source: input.source, scenes };
}
