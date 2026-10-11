# Release checks · 0.2.0

- The clean light-theme renderer and new routed payment example were rendered and visually inspected.
- 51 Node tests pass, including 12 connector-routing checks for separate branch ports and return lanes, obstacle avoidance, direction variants, loops, labels, and arrowheads.
- Five motion styles produce distinct rendered pixels; changing speed changes the animation position. All use the same renderer for preview and export.
- Core DOM editing flows still pass: scene editing, order, duplicate/delete, undo/redo, diagram updates and errors, timeline scrub, and export panel.
- The bundled sample is a 19.5-second, 1280×720, 30 fps MP4 rendered from the shared scene data and Canvas renderer with Node/FFmpeg.

Native browser WebM recording, audio synchronization, and responsive browser layout have not been end-to-end checked. The MP4 example is an engine render, not evidence of a successful browser WebM export.
