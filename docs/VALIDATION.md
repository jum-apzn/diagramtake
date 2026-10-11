# Release checks · 0.3.0

Light, Dark, and Paper are selectable in the editor. The chosen theme survives project JSON and local autosave; older and invalid theme values fall back to Light. Undo and loading the example preserve the expected selection.

The same Canvas renderer produced all three same-scene PNGs and the 12-second Dark MP4 in `docs/themes/`. The palettes were visually reviewed for text, connector and highlight contrast. Existing 0.2 sample media is preserved.

54 Node tests pass, including theme schema/fallback checks and the existing routing and export lifecycle coverage. Core DOM editing and theme-selection flows pass. Native browser WebM recording and browser layout still need end-to-end browser validation; the MP4 is an engine-rendered example.
