/** Browser-native exports. Video is recorded in real time; no server is used. */
const FPS = 30;
const FRAME_MS = 1000 / FPS;

function abortError(signal) {
  return signal?.reason ?? new DOMException("Export cancelled.", "AbortError");
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function checkCanvas(canvas) {
  if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) {
    throw new Error("Export needs a canvas with a non-zero width and height.");
  }
}

function webmType(hasAudio) {
  const Recorder = globalThis.MediaRecorder;
  if (
    typeof Recorder !== "function" ||
    typeof Recorder.isTypeSupported !== "function"
  ) {
    throw new Error(
      "This browser does not support video recording. Try a current desktop Chrome, Edge, or Firefox.",
    );
  }
  const candidates = hasAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const type = candidates.find((candidate) =>
    Recorder.isTypeSupported(candidate),
  );
  if (!type) {
    throw new Error(
      "This browser cannot record WebM. Try a current desktop Chrome, Edge, or Firefox, or export a PNG instead.",
    );
  }
  return type;
}

function waitForAudio(promise, signal) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(abortError(signal));
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Audio could not start. Click Export again to allow audio recording.",
          ),
        ),
      10000,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(() => finish(), finish);
    if (signal?.aborted) onAbort();
  });
}

/** Save a Blob locally. The object URL is released after the browser starts saving. */
export function downloadBlob(blob, filename = "diagramtake-export") {
  if (!(blob instanceof Blob))
    throw new TypeError("A Blob is required for download.");
  if (
    !globalThis.document ||
    typeof globalThis.URL?.createObjectURL !== "function"
  ) {
    throw new Error("File downloads require a browser.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = String(filename || "diagramtake-export");
  anchor.style.display = "none";
  try {
    (document.body || document.documentElement).appendChild(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  // Revoking synchronously can cancel downloads in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Download the currently painted canvas as PNG and return its Blob. */
export async function exportPNG(canvas, filename = "diagramtake-frame.png") {
  checkCanvas(canvas);
  if (typeof canvas.toBlob !== "function")
    throw new Error("This browser cannot export canvas images.");
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else
          reject(
            new Error(
              "PNG export failed. The canvas may be too large for this browser.",
            ),
          );
      }, "image/png");
    } catch (error) {
      if (error.name === "SecurityError") {
        reject(
          new Error(
            "PNG export is blocked because this canvas contains an image that disallows export.",
          ),
        );
      } else reject(error);
    }
  });
  downloadBlob(blob, filename);
  return blob;
}

/**
 * Record a diagram story to a real WebM Blob at up to 30 frames per second.
 * duration and renderFrame's argument are seconds. onProgress receives 0..1.
 * Optional audioBuffer is an already decoded Web Audio AudioBuffer. Short audio
 * ends naturally; long audio is trimmed to the story. Audio is not played aloud.
 * Keep the document visible while recording. The final frame is held for one
 * frame, so container duration can be about 33 ms longer than the story.
 * The caller owns download/UI and must not paint or resize canvas concurrently.
 */
export async function exportWebM({
  canvas,
  duration,
  renderFrame,
  audioBuffer,
  onProgress,
  signal,
} = {}) {
  checkAbort(signal);
  checkCanvas(canvas);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new TypeError("Video duration must be a positive number of seconds.");
  if (typeof renderFrame !== "function")
    throw new TypeError("Video export needs a renderFrame(seconds) function.");
  if (onProgress != null && typeof onProgress !== "function")
    throw new TypeError("onProgress must be a function.");
  if (typeof canvas.captureStream !== "function") {
    throw new Error(
      "This browser cannot capture a canvas as video. Try a current desktop Chrome, Edge, or Firefox.",
    );
  }
  if (globalThis.document?.visibilityState === "hidden") {
    throw new Error(
      "Keep this tab visible while exporting video, then try again.",
    );
  }
  const mimeType = webmType(Boolean(audioBuffer));
  const AudioContextClass =
    globalThis.AudioContext || globalThis.webkitAudioContext;
  if (audioBuffer && typeof AudioContextClass !== "function") {
    throw new Error(
      "This browser cannot add audio to the recording. Try exporting without audio.",
    );
  }

  let stream;
  let audioContext;
  let audioSource;
  let audioDestination;
  let recorder;
  let timer;
  let watchdog;
  let detachListeners = () => {};

  try {
    renderFrame(0);
    try {
      stream = canvas.captureStream(FPS);
    } catch (error) {
      if (error.name === "SecurityError") {
        throw new Error(
          "Video export is blocked because this canvas contains an image that disallows capture.",
        );
      }
      throw error;
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState === "ended")
      throw new Error(
        "The browser did not provide a usable canvas video track.",
      );

    if (audioBuffer) {
      // Construct/resume before the first await, preserving the click gesture.
      audioContext = new AudioContextClass();
      audioDestination = audioContext.createMediaStreamDestination();
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioDestination);
      for (const track of audioDestination.stream.getAudioTracks())
        stream.addTrack(track);
      if (!stream.getAudioTracks().length)
        throw new Error(
          "The browser could not create a recording audio track.",
        );
      await waitForAudio(audioContext.resume(), signal);
      if (audioContext.state !== "running")
        throw new Error(
          "Audio is blocked by the browser. Click Export again to start audio.",
        );
    }
    checkAbort(signal);

    const options = { mimeType, videoBitsPerSecond: 6000000 };
    if (audioBuffer) options.audioBitsPerSecond = 128000;
    recorder = new MediaRecorder(stream, options);
    const blob = await new Promise((resolve, reject) => {
      const chunks = [];
      let settled = false;
      let finishing = false;
      let started = false;
      let origin = 0;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error(String(error)),
        );
      };
      const onAbort = () => fail(abortError(signal));
      const onVisibility = () => {
        if (document.visibilityState === "hidden")
          fail(
            new Error(
              "Export stopped because this tab was hidden. Keep it visible and export again.",
            ),
          );
      };
      const onAudioState = () => {
        if (started && !finishing && audioContext.state !== "running") {
          fail(
            new Error(
              "Audio was interrupted. Keep this tab active and export again.",
            ),
          );
        }
      };
      const onTrackEnded = () => {
        if (!finishing)
          fail(
            new Error(
              "The canvas recording track ended before the story finished.",
            ),
          );
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      globalThis.document?.addEventListener("visibilitychange", onVisibility);
      audioContext?.addEventListener("statechange", onAudioState);
      videoTrack.addEventListener("ended", onTrackEnded);
      detachListeners = () => {
        signal?.removeEventListener("abort", onAbort);
        globalThis.document?.removeEventListener(
          "visibilitychange",
          onVisibility,
        );
        audioContext?.removeEventListener("statechange", onAudioState);
        videoTrack.removeEventListener("ended", onTrackEnded);
        recorder.onstart =
          recorder.ondataavailable =
          recorder.onerror =
          recorder.onstop =
            null;
      };

      const paint = (seconds) => {
        renderFrame(seconds);
        // requestFrame also guarantees a fresh frame when the drawing is static.
        if (typeof videoTrack.requestFrame === "function")
          videoTrack.requestFrame();
      };
      const tick = () => {
        if (settled) return;
        try {
          checkAbort(signal);
          const elapsed = Math.min(
            duration,
            (performance.now() - origin) / 1000,
          );
          paint(elapsed);
          // 100% means the recorder has finalized its Blob, not just rendered it.
          onProgress?.(Math.min(0.99, elapsed / duration));
          if (elapsed >= duration) {
            finishing = true;
            if (audioSource) audioSource.stop();
            timer = setTimeout(() => {
              if (settled) return;
              try {
                if (recorder.state === "inactive")
                  throw new Error("Video recording ended unexpectedly.");
                recorder.stop();
                clearTimeout(watchdog);
                watchdog = setTimeout(
                  () =>
                    fail(
                      new Error(
                        "The browser could not finish encoding this video. Try a shorter story.",
                      ),
                    ),
                  15000,
                );
              } catch (error) {
                fail(error);
              }
            }, FRAME_MS);
          } else {
            timer = setTimeout(
              tick,
              Math.min(FRAME_MS, (duration - elapsed) * 1000),
            );
          }
        } catch (error) {
          fail(error);
        }
      };

      recorder.ondataavailable = (event) => {
        if (!settled && event.data?.size > 0) chunks.push(event.data);
      };
      recorder.onerror = (event) =>
        fail(
          event.error || new Error("The browser failed to encode this video."),
        );
      recorder.onstop = () => {
        if (settled) return;
        if (!finishing) {
          fail(new Error("Video recording stopped before the story finished."));
          return;
        }
        try {
          const result = new Blob(chunks, {
            type: recorder.mimeType || mimeType,
          });
          if (!result.size)
            throw new Error(
              "The browser produced an empty video. Try a shorter story or another browser.",
            );
          onProgress?.(1);
          settled = true;
          resolve(result);
        } catch (error) {
          fail(error);
        }
      };
      recorder.onstart = () => {
        if (settled) return;
        try {
          clearTimeout(watchdog);
          started = true;
          origin = performance.now();
          if (audioSource) audioSource.start(audioContext.currentTime);
          onProgress?.(0);
          tick();
        } catch (error) {
          fail(error);
        }
      };
      try {
        checkAbort(signal);
        watchdog = setTimeout(
          () =>
            fail(
              new Error(
                "The browser did not start video recording. Please try again.",
              ),
            ),
          10000,
        );
        recorder.start(250);
      } catch (error) {
        fail(error);
      }
    });
    return blob;
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
    detachListeners();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Already stopped or failed. */
      }
    }
    if (audioSource) {
      try {
        audioSource.stop();
      } catch {
        /* Not started or already stopped. */
      }
      audioSource.disconnect();
    }
    const tracks = new Set([
      ...(stream?.getTracks() || []),
      ...(audioDestination?.stream.getTracks() || []),
    ]);
    for (const track of tracks) track.stop();
    audioDestination?.disconnect();
    if (audioContext && audioContext.state !== "closed") {
      // Do not let a delayed device shutdown hold up download or cancellation.
      try {
        Promise.resolve(audioContext.close()).catch(() => {});
      } catch {
        /* Device already closed. */
      }
    }
  }
}
