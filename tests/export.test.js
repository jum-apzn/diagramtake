import assert from "node:assert/strict";
import test from "node:test";
import { downloadBlob, exportPNG, exportWebM } from "../src/export.js";

// These tests exercise application lifecycle and error handling with browser
// doubles. They do not claim to test native video encoding or audio/video sync.
class Track extends EventTarget {
  constructor(kind = "video") {
    super();
    this.kind = kind;
    this.readyState = "live";
    this.requestedFrames = 0;
    this.stopCalls = 0;
  }
  requestFrame() {
    this.requestedFrames++;
  }
  stop() {
    this.stopCalls++;
    this.readyState = "ended";
  }
  endUnexpectedly() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class Stream {
  constructor(tracks = [new Track()]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  addTrack(track) {
    this.tracks.push(track);
  }
}

function installGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function browser(t, configuration = {}) {
  const state = {
    streams: [],
    recordings: [],
    audioContexts: [],
    anchors: [],
    revoked: [],
    urls: [],
  };
  class Recorder {
    static isTypeSupported(type) {
      return configuration.supports
        ? configuration.supports(type)
        : type.includes("vp8");
    }
    constructor(stream, options) {
      if (configuration.constructorError) throw configuration.constructorError;
      this.stream = stream;
      this.options = options;
      this.mimeType = options.mimeType;
      this.state = "inactive";
      state.recordings.push(this);
    }
    start(timeslice) {
      if (configuration.startError) throw configuration.startError;
      this.timeslice = timeslice;
      this.state = "recording";
      queueMicrotask(() => {
        this.onstart?.();
        configuration.afterStart?.(this);
      });
    }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        const data = new Blob(configuration.empty ? [] : ["mock-video-bytes"], {
          type: this.mimeType,
        });
        this.ondataavailable?.({ data });
        this.onstop?.();
      });
    }
  }
  class Audio extends EventTarget {
    constructor() {
      super();
      this.state = "suspended";
      this.currentTime = 1;
      state.audioContexts.push(this);
    }
    createMediaStreamDestination() {
      this.recordingDestination = {
        stream: new Stream([new Track("audio")]),
        disconnected: false,
        disconnect() {
          this.disconnected = true;
        },
      };
      return this.recordingDestination;
    }
    createBufferSource() {
      this.source = {
        startTime: null,
        stopped: false,
        disconnected: false,
        connect(destination) {
          this.destination = destination;
        },
        start(when) {
          this.startTime = when;
        },
        stop() {
          this.stopped = true;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      return this.source;
    }
    resume() {
      if (configuration.audioResumeError)
        return Promise.reject(configuration.audioResumeError);
      if (configuration.audioResumePending) return new Promise(() => {});
      this.state = "running";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  const document = new EventTarget();
  document.visibilityState = configuration.hidden ? "hidden" : "visible";
  document.body = {
    appendChild(anchor) {
      state.anchors.push(anchor);
    },
  };
  document.createElement = (tag) => {
    assert.equal(tag, "a");
    return {
      style: {},
      clicked: false,
      removed: false,
      click() {
        if (configuration.clickError) throw configuration.clickError;
        this.clicked = true;
      },
      remove() {
        this.removed = true;
      },
    };
  };
  state.document = document;
  state.canvas = {
    width: 1280,
    height: 720,
    captureStream(fps) {
      if (configuration.captureError) throw configuration.captureError;
      state.captureFPS = fps;
      const stream = new Stream();
      state.streams.push(stream);
      return stream;
    },
    toBlob(callback, type) {
      if (configuration.pngError) throw configuration.pngError;
      callback(
        configuration.emptyPNG ? null : new Blob(["mock-png-bytes"], { type }),
      );
    },
  };
  installGlobal(
    t,
    "MediaRecorder",
    configuration.noRecorder ? undefined : Recorder,
  );
  installGlobal(t, "AudioContext", Audio);
  installGlobal(t, "document", document);
  installGlobal(t, "URL", {
    createObjectURL(blob) {
      state.urls.push(blob);
      return `blob:test-${state.urls.length}`;
    },
    revokeObjectURL(url) {
      state.revoked.push(url);
    },
  });
  // Download URL cleanup is delayed by a minute in production. Keep test runs
  // fast while also ensuring no timer outlives this browser double.
  const originalSetTimeout = globalThis.setTimeout;
  const downloadTimers = [];
  installGlobal(t, "setTimeout", (callback, delay, ...args) => {
    const timer = originalSetTimeout(callback, delay, ...args);
    if (delay === 60000) downloadTimers.push(timer);
    return timer;
  });
  t.after(() => downloadTimers.forEach(clearTimeout));
  return state;
}

function assertReleased(state) {
  for (const stream of state.streams) {
    assert(stream.getTracks().every((track) => track.readyState === "ended"));
  }
  for (const recorder of state.recordings) {
    assert.equal(recorder.state, "inactive");
    assert.equal(recorder.onstart, null);
    assert.equal(recorder.ondataavailable, null);
    assert.equal(recorder.onerror, null);
    assert.equal(recorder.onstop, null);
  }
  for (const audio of state.audioContexts) {
    assert.equal(audio.state, "closed");
    assert(audio.source.stopped);
    assert(audio.source.disconnected);
    assert(audio.recordingDestination.disconnected);
  }
}

test("WebM lifecycle selects a supported codec, renders endpoints, and finalizes progress", async (t) => {
  const state = browser(t);
  const frames = [],
    progress = [];
  const blob = await exportWebM({
    canvas: state.canvas,
    duration: 0.02,
    renderFrame: (time) => frames.push(time),
    onProgress: (value) => progress.push(value),
  });
  assert(blob instanceof Blob);
  assert.equal(await blob.text(), "mock-video-bytes");
  assert.equal(blob.type, "video/webm;codecs=vp8");
  assert.equal(state.captureFPS, 30);
  assert.equal(frames[0], 0);
  assert.equal(frames.at(-1), 0.02);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert(
    progress.every(
      (value, index) =>
        value >= 0 && value <= 1 && (!index || value >= progress[index - 1]),
    ),
  );
  assert(state.streams[0].getVideoTracks()[0].requestedFrames > 0);
  assertReleased(state);
});

test("a generic WebM MIME type is a valid fallback", async (t) => {
  const state = browser(t, { supports: (type) => type === "video/webm" });
  const blob = await exportWebM({
    canvas: state.canvas,
    duration: 0.005,
    renderFrame() {},
  });
  assert.equal(blob.type, "video/webm");
  assertReleased(state);
});

test("unsupported WebM rejects before allocating capture", async (t) => {
  const state = browser(t, { supports: () => false });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /cannot record WebM/,
  );
  assert.equal(state.streams.length, 0);
});

test("missing MediaRecorder and canvas capture APIs provide capability errors", async (t) => {
  const state = browser(t, { noRecorder: true });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /does not support video recording/,
  );
  delete state.canvas.captureStream;
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /cannot capture a canvas/,
  );
});

test("invalid duration, dimensions, renderer and progress callback reject", async (t) => {
  const state = browser(t);
  for (const duration of [0, -1, NaN, Infinity, "2"]) {
    await assert.rejects(
      exportWebM({ canvas: state.canvas, duration, renderFrame() {} }),
      /positive number/,
    );
  }
  await assert.rejects(
    exportWebM({
      canvas: { width: 0, height: 100 },
      duration: 1,
      renderFrame() {},
    }),
    /non-zero/,
  );
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1 }),
    /renderFrame/,
  );
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      onProgress: true,
    }),
    /onProgress/,
  );
  assert.equal(state.streams.length, 0);
});

test("an already aborted export does not allocate a capture stream", async (t) => {
  const state = browser(t),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(state.streams.length, 0);
});

test("cancellation while recording rejects and releases tracks", async (t) => {
  const state = browser(t),
    controller = new AbortController();
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      signal: controller.signal,
      onProgress() {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assertReleased(state);
});

test("a renderer error during capture releases all recording resources", async (t) => {
  const state = browser(t);
  let frames = 0;
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {
        if (++frames > 1) throw new Error("Render failed");
      },
    }),
    /Render failed/,
  );
  assertReleased(state);
});

test("a progress callback error does not leave recording running", async (t) => {
  const state = browser(t);
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      onProgress() {
        throw new Error("UI failed");
      },
    }),
    /UI failed/,
  );
  assertReleased(state);
});

test("audio is routed only to the recording and its context is closed", async (t) => {
  const state = browser(t),
    buffer = { mockAudioBuffer: true };
  const blob = await exportWebM({
    canvas: state.canvas,
    duration: 0.005,
    renderFrame() {},
    audioBuffer: buffer,
  });
  const audio = state.audioContexts[0];
  assert.equal(blob.type, "video/webm;codecs=vp8,opus");
  assert.equal(audio.source.buffer, buffer);
  assert.equal(audio.source.destination, audio.recordingDestination);
  assert.equal(audio.source.startTime, audio.currentTime);
  assert.equal(state.recordings[0].stream.getAudioTracks().length, 1);
  assert.equal(state.recordings[0].options.audioBitsPerSecond, 128000);
  assertReleased(state);
});

test("audio setup failure also closes the context and capture tracks", async (t) => {
  const state = browser(t, { audioResumeError: new Error("Audio denied") });
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      audioBuffer: {},
    }),
    /Audio denied/,
  );
  assertReleased(state);
});

test("cancellation while audio resume is pending releases setup resources", async (t) => {
  const state = browser(t, { audioResumePending: true }),
    controller = new AbortController();
  const promise = exportWebM({
    canvas: state.canvas,
    duration: 1,
    renderFrame() {},
    audioBuffer: {},
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assertReleased(state);
});

test("an interrupted audio context rejects instead of silently desynchronizing", async (t) => {
  const state = browser(t);
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      audioBuffer: {},
      onProgress() {
        const audio = state.audioContexts[0];
        audio.state = "suspended";
        audio.dispatchEvent(new Event("statechange"));
      },
    }),
    /Audio was interrupted/,
  );
  assertReleased(state);
});

test("hidden documents are rejected before capture", async (t) => {
  const state = browser(t, { hidden: true });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /visible/,
  );
  assert.equal(state.streams.length, 0);
});

test("hiding a document during export stops capture with a useful error", async (t) => {
  const state = browser(t);
  await assert.rejects(
    exportWebM({
      canvas: state.canvas,
      duration: 1,
      renderFrame() {},
      onProgress() {
        state.document.visibilityState = "hidden";
        state.document.dispatchEvent(new Event("visibilitychange"));
      },
    }),
    /tab was hidden/,
  );
  assertReleased(state);
});

test("backend recorder errors release capture resources", async (t) => {
  const state = browser(t, {
    afterStart: (recorder) =>
      recorder.onerror?.({ error: new Error("Codec failed") }),
  });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /Codec failed/,
  );
  assertReleased(state);
});

test("unexpected recording termination is not reported as success", async (t) => {
  const state = browser(t, { afterStart: (recorder) => recorder.stop() });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /before the story finished/,
  );
  assertReleased(state);
});

test("unexpected canvas track termination rejects export", async (t) => {
  const state = browser(t, {
    afterStart: (recorder) =>
      recorder.stream.getVideoTracks()[0].endUnexpectedly(),
  });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /track ended/,
  );
  assertReleased(state);
});

test("an empty recorder output is rejected rather than downloaded", async (t) => {
  const state = browser(t, { empty: true });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 0.005, renderFrame() {} }),
    /empty video/,
  );
  assertReleased(state);
});

test("tainted canvas capture provides an actionable error", async (t) => {
  const state = browser(t, {
    captureError: new DOMException("Tainted", "SecurityError"),
  });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /image that disallows capture/,
  );
});

test("recorder constructor failure releases an existing capture stream", async (t) => {
  const state = browser(t, {
    constructorError: new Error("Recorder allocation failed"),
  });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /allocation failed/,
  );
  assertReleased(state);
});

test("recorder start failure releases capture and event callbacks", async (t) => {
  const state = browser(t, { startError: new Error("Recorder start failed") });
  await assert.rejects(
    exportWebM({ canvas: state.canvas, duration: 1, renderFrame() {} }),
    /start failed/,
  );
  assertReleased(state);
});

test("PNG export returns the image Blob and triggers the named download", async (t) => {
  const state = browser(t);
  const blob = await exportPNG(state.canvas, "my-story.png");
  assert.equal(blob.type, "image/png");
  assert.equal(await blob.text(), "mock-png-bytes");
  assert.equal(state.anchors[0].download, "my-story.png");
  assert(state.anchors[0].clicked);
  assert(state.anchors[0].removed);
  assert.equal(state.urls[0], blob);
  assert.deepEqual(state.revoked, []);
});

test("PNG export failure creates no download", async (t) => {
  const state = browser(t, { emptyPNG: true });
  await assert.rejects(exportPNG(state.canvas), /PNG export failed/);
  assert.equal(state.anchors.length, 0);
});

test("tainted PNG canvas provides an actionable error", async (t) => {
  const state = browser(t, {
    pngError: new DOMException("Tainted", "SecurityError"),
  });
  await assert.rejects(exportPNG(state.canvas), /image that disallows export/);
  assert.equal(state.anchors.length, 0);
});

test("download validates input and revokes its object URL if clicking fails", (t) => {
  const state = browser(t, { clickError: new Error("Download blocked") });
  assert.throws(() => downloadBlob("not a blob"), /Blob is required/);
  assert.throws(
    () => downloadBlob(new Blob(["file"]), "file.webm"),
    /Download blocked/,
  );
  assert.deepEqual(state.revoked, ["blob:test-1"]);
  assert(state.anchors[0].removed);
});
