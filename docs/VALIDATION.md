# Release checks · 0.1.0

- 38 Node tests passed: parser, project JSON validation, layout, camera math, hit testing, PNG/download behavior, and mocked MediaRecorder lifecycle.
- JavaScript syntax checks passed for the application modules.
- 19 DOM smoke assertions passed using Happy DOM with the Canvas renderer: initial state, adding/editing/duplicating/reordering/deleting scenes, undo/redo, replacing a diagram, preserving data on invalid input, restoring the example, timeline scrubbing, and opening the export panel.
- A scrubber bug found by the DOM smoke check was fixed and the flow rerun successfully.
- The shared renderer produced the bundled 19.5-second H.264 MP4, 1280×720 at 30 fps. Media properties were inspected with ffprobe; the PNG frame was visually reviewed for Korean text, highlighting, graph edges, and camera framing.

These checks are not native-browser end-to-end tests. Real MediaRecorder encoding, browser audio decoding/synchronization, native downloads, and responsive browser layout still require a browser check. The included MP4 was rendered by the optional Node/FFmpeg script, not by the app's WebM exporter.
