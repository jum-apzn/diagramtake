import {
  COLORS,
  demoProject,
  parseDiagram,
  layoutDiagram,
  makeScene,
  validateProject,
  totalDuration,
  sceneAt,
} from "./model.js";
import { renderFrame, hitNode, WIDTH, HEIGHT } from "./render.js";
import { exportPNG, exportWebM, downloadBlob } from "./export.js";
const $ = (s) => document.querySelector(s),
  canvas = $("#stage"),
  storageKey = "diagramtake.project.v1";
let project = demoProject(),
  selected = 0,
  time = 0,
  playing = false,
  lastTick = 0,
  frame = 0,
  saveTimer,
  toastTimer,
  graph,
  audioBuffer = null,
  audioContext = null,
  audioSource = null,
  audioName = "",
  exportController = null;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) project = validateProject(JSON.parse(saved));
} catch {}
graph = layoutDiagram(parseDiagram(project.source));
const undoStack = [],
  redoStack = [];
let checkpointAt = 0;
function checkpoint(force = false) {
  const now = performance.now();
  if (force || now - checkpointAt > 600 || !undoStack.length) {
    undoStack.push(JSON.stringify(project));
    if (undoStack.length > 60) undoStack.shift();
  }
  checkpointAt = now;
  redoStack.length = 0;
  updateHistory();
}
function updateHistory() {
  $("#undo").disabled = !undoStack.length;
  $("#redo").disabled = !redoStack.length;
}
function restoreHistory(from, to) {
  if (!from.length || exportController) return;
  pause();
  to.push(JSON.stringify(project));
  project = validateProject(JSON.parse(from.pop()));
  graph = layoutDiagram(parseDiagram(project.source));
  selected = Math.min(selected, project.scenes.length - 1);
  time = startOf(selected);
  save();
  renderUI();
  updateHistory();
  checkpointAt = 0;
}
$("#undo").onclick = () => restoreHistory(undoStack, redoStack);
$("#redo").onclick = () => restoreHistory(redoStack, undoStack);
const current = () => project.scenes[selected];
const startOf = (index) =>
  project.scenes.slice(0, index).reduce((sum, s) => sum + s.duration, 0);
const fmt = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function save() {
  clearTimeout(saveTimer);
  $("#save-status").textContent = "● Saving…";
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(project));
      $("#save-status").textContent = "● Saved locally";
    } catch {
      $("#save-status").textContent = "○ Download JSON to save";
    }
  }, 250);
}
function text(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = content;
  return el;
}
function draw() {
  renderFrame(canvas, project, graph, time);
  const total = totalDuration(project);
  $("#scrubber").max = total;
  $("#scrubber").value = time;
  $("#time-label").textContent = `${fmt(time)} / ${fmt(total)}`;
  $("#total-label").textContent = `${total.toFixed(1)} SECONDS`;
  $("#play").textContent = playing ? "Ⅱ" : "▶";
  $("#play").setAttribute("aria-label", playing ? "Pause story" : "Play story");
}
function stopAudio() {
  if (audioSource) {
    try {
      audioSource.stop();
    } catch {}
    audioSource.disconnect();
    audioSource = null;
  }
}
async function startAudio() {
  stopAudio();
  if (!audioBuffer || time >= audioBuffer.duration) return;
  try {
    audioContext ??= new AudioContext();
    await audioContext.resume();
    if (!playing) return;
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start(0, time);
  } catch {
    toast("오디오 재생을 시작하지 못했어요.");
  }
}
function pause() {
  playing = false;
  cancelAnimationFrame(frame);
  stopAudio();
  draw();
}
function selectScene(index) {
  if (exportController) return;
  pause();
  selected = Math.max(0, Math.min(project.scenes.length - 1, index));
  time = startOf(selected);
  renderUI();
}
function tick(now) {
  if (!playing) return;
  time = Math.min(totalDuration(project), time + (now - lastTick) / 1000);
  lastTick = now;
  const index = sceneAt(project, time).index;
  if (index !== selected) {
    selected = index;
    renderCards();
    renderInspector();
  }
  draw();
  if (time >= totalDuration(project)) {
    pause();
    return;
  }
  frame = requestAnimationFrame(tick);
}
function play() {
  if (exportController) return;
  if (playing) {
    pause();
    return;
  }
  if (time >= totalDuration(project)) time = 0;
  playing = true;
  lastTick = performance.now();
  startAudio();
  draw();
  frame = requestAnimationFrame(tick);
}
function change(fn, { cards = true, inspector = false } = {}) {
  if (exportController) return;
  pause();
  checkpoint();
  fn(current());
  time = Math.max(
    startOf(selected),
    Math.min(time, startOf(selected) + current().duration - 0.001),
  );
  save();
  if (cards) renderCards();
  if (inspector) renderInspector();
  draw();
}
function renderCards() {
  const list = $("#scene-list"),
    timeline = $("#timeline");
  list.replaceChildren();
  timeline.replaceChildren();
  project.scenes.forEach((s, i) => {
    const card = text(
      "button",
      "scene-card" + (i === selected ? " active" : ""),
      "",
    );
    card.style.setProperty("--card-color", COLORS[s.color]);
    card.setAttribute("aria-pressed", i === selected);
    const top = text("div", "card-top", "");
    top.append(
      text("span", "card-number", String(i + 1).padStart(2, "0")),
      text("span", "card-title", s.title || "Untitled"),
      text("span", "card-time", `${s.duration}s`),
    );
    const dots = text("div", "card-bottom", "");
    for (let n = 0; n < Math.min(8, s.nodes.length + s.edges.length); n++)
      dots.append(text("span", "card-dot", ""));
    card.append(top, text("div", "card-caption", s.narration), dots);
    card.onclick = () => selectScene(i);
    list.append(card);
    const block = text(
      "button",
      "timeline-block" + (i === selected ? " active" : ""),
      "",
    );
    block.style.flex = String(s.duration);
    block.append(
      text("span", "", String(i + 1).padStart(2, "0")),
      document.createTextNode(s.title),
    );
    block.title = `${s.title} · ${s.duration}s`;
    block.onclick = () => selectScene(i);
    timeline.append(block);
  });
  $("#scene-count").textContent = String(project.scenes.length).padStart(
    2,
    "0",
  );
}
function toggleTarget(kind, id) {
  change(
    (s) => {
      s[kind] = s[kind].includes(id)
        ? s[kind].filter((v) => v !== id)
        : [...s[kind], id];
    },
    { inspector: true },
  );
}
function renderInspector() {
  const s = current();
  $("#scene-title").value = s.title;
  $("#narration").value = s.narration;
  $("#duration").value = s.duration;
  $("#camera").value = s.camera;
  $("#effect").value = s.effect || "flow";
  $("#intensity").value = s.intensity ?? 0.7;
  $("#speed").value = s.speed ?? 1;
  $("#intensity-value").textContent =
    Math.round((s.intensity ?? 0.7) * 100) + "%";
  $("#speed-value").textContent = (s.speed ?? 1) + "×";
  $("#colors").replaceChildren();
  Object.entries(COLORS).forEach(([key, color]) => {
    const b = text("button", "swatch" + (s.color === key ? " active" : ""), "");
    b.style.background = color;
    b.setAttribute("aria-label", `${key} accent`);
    b.setAttribute("aria-pressed", s.color === key);
    b.onclick = () => change((s) => (s.color = key), { inspector: true });
    $("#colors").append(b);
  });
  $("#node-targets").replaceChildren();
  graph.nodes.forEach((n) => {
    const b = text(
      "button",
      "target-chip" + (s.nodes.includes(n.id) ? " active" : ""),
      n.label,
    );
    b.setAttribute("aria-pressed", s.nodes.includes(n.id));
    b.onclick = () => toggleTarget("nodes", n.id);
    $("#node-targets").append(b);
  });
  $("#edge-targets").replaceChildren();
  graph.edges.forEach((e) => {
    const b = text(
      "button",
      "edge-chip" + (s.edges.includes(e.id) ? " active" : ""),
      `${s.edges.includes(e.id) ? "●" : "○"} ${e.from} → ${e.to}${e.label ? " · " + e.label : ""}`,
    );
    b.setAttribute("aria-pressed", s.edges.includes(e.id));
    b.onclick = () => toggleTarget("edges", e.id);
    $("#edge-targets").append(b);
  });
  $("#delete-scene").disabled = project.scenes.length === 1;
  $("#move-up").disabled = selected === 0;
  $("#move-down").disabled = selected === project.scenes.length - 1;
  $("#add-scene").disabled = project.scenes.length >= 100;
  $("#duplicate").disabled = project.scenes.length >= 100;
}
function renderUI() {
  updateHistory();
  $("#project-title").value = project.title;
  renderCards();
  renderInspector();
  draw();
}
$("#project-title").addEventListener("input", (e) => {
  checkpoint();
  project.title = e.target.value;
  save();
  draw();
});
$("#scene-title").addEventListener("input", (e) =>
  change((s) => (s.title = e.target.value)),
);
$("#narration").addEventListener("input", (e) =>
  change((s) => (s.narration = e.target.value)),
);
$("#duration").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  change(
    (s) =>
      (s.duration = Number.isFinite(v) ? Math.max(0.5, Math.min(60, v)) : 3),
    { inspector: true },
  );
});
$("#preview-motion").onclick = () => {
  selectScene(selected);
  play();
};
$("#effect").onchange = (e) =>
  change((s) => (s.effect = e.target.value), { inspector: true });
$("#intensity").oninput = (e) => {
  const value = Number(e.target.value);
  change((s) => (s.intensity = value));
  $("#intensity-value").textContent = Math.round(value * 100) + "%";
};
$("#speed").oninput = (e) => {
  const value = Number(e.target.value);
  change((s) => (s.speed = value));
  $("#speed-value").textContent = value + "×";
};
$("#camera").onchange = (e) => change((s) => (s.camera = e.target.value));
$("#clear-targets").onclick = () =>
  change(
    (s) => {
      s.nodes = [];
      s.edges = [];
    },
    { inspector: true },
  );
$("#add-scene").onclick = () => {
  if (project.scenes.length >= 100) return;
  pause();
  checkpoint(true);
  project.scenes.splice(selected + 1, 0, makeScene());
  selected++;
  time = startOf(selected);
  save();
  renderUI();
};
$("#duplicate").onclick = () => {
  if (project.scenes.length >= 100) return;
  pause();
  checkpoint(true);
  project.scenes.splice(
    selected + 1,
    0,
    makeScene({
      ...current(),
      id: crypto.randomUUID(),
      nodes: [...current().nodes],
      edges: [...current().edges],
      title: current().title + " · copy",
    }),
  );
  selected++;
  time = startOf(selected);
  save();
  renderUI();
};
$("#delete-scene").onclick = () => {
  if (project.scenes.length < 2) return;
  pause();
  checkpoint(true);
  project.scenes.splice(selected, 1);
  selected = Math.min(selected, project.scenes.length - 1);
  time = startOf(selected);
  save();
  renderUI();
};
function move(delta) {
  const target = selected + delta;
  if (target < 0 || target >= project.scenes.length) return;
  pause();
  checkpoint(true);
  [project.scenes[selected], project.scenes[target]] = [
    project.scenes[target],
    project.scenes[selected],
  ];
  selected = target;
  time = startOf(selected);
  save();
  renderUI();
}
$("#move-up").onclick = () => move(-1);
$("#move-down").onclick = () => move(1);
canvas.onclick = (e) => {
  if (playing || exportController) return;
  const rect = canvas.getBoundingClientRect(),
    state = renderFrame(canvas, project, graph, time);
  const node = hitNode(
    ((e.clientX - rect.left) * WIDTH) / rect.width,
    ((e.clientY - rect.top) * HEIGHT) / rect.height,
    state,
    graph,
  );
  if (node) toggleTarget("nodes", node.id);
};
$("#play").onclick = play;
$("#restart").onclick = () => selectScene(0);
$("#scrubber").oninput = (e) => {
  const value = Number(e.target.value);
  pause();
  time = value;
  const index = sceneAt(project, time).index;
  if (index !== selected) {
    selected = index;
    renderCards();
    renderInspector();
  }
  draw();
};
document.addEventListener("keydown", (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.code === "KeyZ" &&
    !document.querySelector("dialog[open]") &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    restoreHistory(
      e.shiftKey ? redoStack : undoStack,
      e.shiftKey ? undoStack : redoStack,
    );
    return;
  }
  if (
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
      document.activeElement.tagName,
    ) ||
    document.querySelector("dialog[open]") ||
    exportController
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    play();
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    selectScene(selected + 1);
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    selectScene(selected - 1);
  }
});
$("#diagram-open").onclick = () => {
  pause();
  $("#diagram-source").value = project.source;
  $("#diagram-error").textContent = "";
  $("#diagram-dialog").showModal();
};
$("#apply-diagram").onclick = () => {
  try {
    const source = $("#diagram-source").value,
      newGraph = layoutDiagram(parseDiagram(source));
    checkpoint(true);
    const oldEdges = new Map(graph.edges.map((e) => [e.id, e]));
    for (const scene of project.scenes) {
      scene.nodes = scene.nodes.filter((id) =>
        newGraph.nodes.some((n) => n.id === id),
      );
      scene.edges = scene.edges
        .map((id) => {
          const e = oldEdges.get(id);
          return newGraph.edges.find(
            (n) =>
              e && n.from === e.from && n.to === e.to && n.label === e.label,
          )?.id;
        })
        .filter(Boolean);
    }
    project.source = source;
    graph = newGraph;
    save();
    renderUI();
    $("#diagram-dialog").close();
    toast("Diagram updated");
  } catch (error) {
    $("#diagram-error").textContent = error.message;
  }
};
$("#save-project").onclick = () => {
  downloadBlob(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
    "diagramtake-project.json",
  );
  if (audioBuffer)
    toast("프로젝트를 저장했어요. 오디오 파일은 다시 추가해 주세요.");
};
$("#open-project").onclick = () => $("#project-file").click();
$("#project-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 1_000_000)
      throw Error("프로젝트 파일은 1 MB 이하만 열 수 있어요.");
    const next = validateProject(JSON.parse(await file.text()));
    pause();
    checkpoint(true);
    project = next;
    graph = layoutDiagram(parseDiagram(project.source));
    selected = 0;
    time = 0;
    removeAudio();
    save();
    renderUI();
    toast("Project opened");
  } catch (error) {
    toast(error.message);
  }
};
$("#reset-demo").onclick = () => {
  if (
    !confirm(
      "현재 이야기를 예제로 바꿀까요? 필요한 경우 먼저 Save .json으로 저장해 주세요.",
    )
  )
    return;
  pause();
  checkpoint(true);
  project = demoProject();
  graph = layoutDiagram(parseDiagram(project.source));
  selected = 0;
  time = 0;
  removeAudio();
  save();
  renderUI();
};
function removeAudio() {
  stopAudio();
  audioBuffer = null;
  audioName = "";
  $("#audio-label").textContent =
    "♫ Add your voice. Let the diagram do the explaining.";
  $("#audio-remove").hidden = true;
  $("#audio-open").textContent = "Add audio ↗";
}
$("#audio-open").onclick = () => $("#audio-file").click();
$("#audio-remove").onclick = () => {
  pause();
  removeAudio();
};
$("#audio-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  pause();
  try {
    if (file.size > 100 * 1024 * 1024)
      throw Error("오디오는 100 MB 이하 파일을 사용해 주세요.");
    audioContext ??= new AudioContext();
    const decoded = await audioContext.decodeAudioData(
      await file.arrayBuffer(),
    );
    audioBuffer = decoded;
    audioName = file.name;
    $("#audio-label").textContent = `♫ ${audioName} · ${fmt(decoded.duration)}`;
    $("#audio-remove").hidden = false;
    $("#audio-open").textContent = "Replace ↗";
    toast("Audio added. 영상 시작부터 재생되며 영상 길이에 맞춰 잘립니다.");
  } catch (error) {
    toast(
      "오디오를 열지 못했어요. WAV 또는 브라우저에서 지원하는 음원을 사용해 주세요.",
    );
  }
};
$("#export-open").onclick = () => {
  pause();
  $("#export-status").textContent =
    "Video export takes the length of your story. Keep this tab visible.";
  $("#export-dialog").showModal();
};
$("#export-png").onclick = async () => {
  try {
    await exportPNG(canvas, "diagramtake-frame.png");
    toast("PNG saved");
  } catch (error) {
    $("#export-status").textContent = error.message;
  }
};
$("#export-video").onclick = async () => {
  if (exportController) return;
  pause();
  const snapshot = structuredClone(project),
    exportGraph = layoutDiagram(parseDiagram(snapshot.source)),
    exportCanvas = document.createElement("canvas");
  exportCanvas.width = WIDTH;
  exportCanvas.height = HEIGHT;
  exportController = new AbortController();
  $("#export-video").disabled = true;
  $("#export-png").disabled = true;
  $("#export-close").disabled = true;
  $("#export-cancel").hidden = false;
  $("#export-progress").hidden = false;
  $("#export-progress").value = 0;
  const duration = totalDuration(snapshot);
  try {
    const blob = await exportWebM({
      canvas: exportCanvas,
      duration,
      renderFrame: (t) => {
        renderFrame(exportCanvas, snapshot, exportGraph, t);
        canvas.getContext("2d").drawImage(exportCanvas, 0, 0);
      },
      audioBuffer,
      onProgress: (p) => {
        $("#export-progress").value = p;
        $("#export-status").textContent =
          `Rendering ${Math.round(p * 100)}% · ${Math.ceil(duration * (1 - p))}s remaining. Keep this tab visible.`;
      },
      signal: exportController.signal,
    });
    downloadBlob(blob, "diagramtake-story.webm");
    $("#export-status").textContent =
      `Video saved · ${(blob.size / 1024 / 1024).toFixed(1)} MB · ${duration.toFixed(1)} seconds`;
    toast("Your story is ready. WebM saved.");
  } catch (error) {
    $("#export-status").textContent =
      error.name === "AbortError"
        ? "Export cancelled. You can try again."
        : error.message;
  } finally {
    exportController = null;
    $("#export-video").disabled = false;
    $("#export-png").disabled = false;
    $("#export-close").disabled = false;
    $("#export-cancel").hidden = true;
    draw();
  }
};
$("#export-cancel").onclick = () => exportController?.abort();
$("#export-dialog").addEventListener("cancel", (e) => {
  if (exportController) e.preventDefault();
});
window.addEventListener("beforeunload", () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(project));
  } catch {}
  exportController?.abort();
  stopAudio();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) pause();
});
renderUI();
