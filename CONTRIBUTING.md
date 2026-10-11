# Contributing

Make explanations clearer, and keep the first story easy to finish.

Run `node server.js` and open localhost:5173. There are no app dependencies. Before submitting a change, run `npm test` and `npm run check`, then try the edited interaction in a real browser.

## Code map

- `src/model.js`: constrained diagram parser, layout, project schema, story timing.
- `src/render.js`: deterministic Canvas frame renderer and hit testing. Preview and exports share it.
- `src/app.js`: scene editor, playback, audio, autosave and file actions.
- `src/export.js`: native PNG and MediaRecorder WebM export, cancellation and cleanup.
- `style.css`: responsive studio interface.

Keep imported text as text. Never insert it as HTML. Preserve project files on errors. Keep media and projects local unless a future feature explicitly asks the user to share them.

## Useful next contributions

Better flow layout for dense diagrams; English UI localization; per-scene audio trimming; browser capture integration tests; keyboard diagram selection. Please discuss major new dependencies or project-format changes first.

For UI changes, exercise narrow screens, a long caption, invalid imports, repeated export/cancel, reload, and a silent project. Native browser recording must be tested in a real browser; lifecycle mocks cannot establish codec correctness.
