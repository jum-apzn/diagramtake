<div align="center">

# DiagramTake

### Your architecture has a story. Show it.

Turn a static diagram into a short visual explainer.<br>
Write a sentence. Highlight its path. Press play.

**Local-first · No accounts · No API keys · MIT licensed**

![A payment request fails, retries, and succeeds](docs/story-preview.gif)

[Watch the 19-second example](docs/payment-retry.mp4) · [Open its project](examples/payment-retry.json) · [한국어](docs/README.ko.md)

</div>

## Make the “wait, how does that work?” moment click

A diagram shows everything at once. A good explanation shows the right thing at the right time.

DiagramTake pairs a small flowchart with a sequence of sentence cards. Each card controls what lights up, where the packets travel, how the camera moves, and how long the moment lasts. You direct the story without writing animation code.

Use it for a payment retry walkthrough, a product onboarding flow, a system-design lesson, or the architecture section of your next README.

## Try your first story

```sh
node server.js
```

Open **http://localhost:5173**. Requires Node.js 20+; no dependency install or build step.

1. **Play the example.** Follow a payment from request to failure to recovery.
2. **Pick a sentence card.** Rewrite the caption in the right panel.
3. **Point at the important part.** Click diagram nodes and select animated connections.
4. **Direct the shot.** Choose a motion style, speed, intensity, duration, and camera shot.
5. **Export.** Save a 720p WebM video or the current frame as a PNG.

Add an audio file if you already have a voice-over. It plays from the start of the story and is included in the video; scene lengths remain under your control.

## Small editor, complete loop

- **Sentence-first direction:** editable cards, duplication, reorder, deletion, undo/redo.
- **Moving explanations:** clean routed connections, per-scene highlights, smooth focus-camera transitions.
- **Five motion styles:** draw-on paths, flowing dots, soft pulses, fade-and-slide entrances, or camera focus. Tune speed and intensity per scene.
- **Clean connectors:** distinct ports, separate return lanes, and node-aware orthogonal routes keep branching explanations readable.
- **A real timeline:** play, pause, scrub, jump between scenes, edit durations.
- **Your voice, locally:** browser-decoded audio, synchronized preview and video export.
- **Files you own:** automatic browser saving, portable project JSON, PNG, WebM.
- **A quiet network:** no analytics, third-party fonts, remote rendering, uploads, or paid services.

Space plays/pauses. Left/right arrows switch scenes. Ctrl/⌘ Z undoes; Ctrl/⌘ Shift Z redoes (outside text inputs).

## Bring your own flow

Click **Edit diagram** and start with this:

```text
flowchart LR
  client[Client] -->|request| api[API]
  api -->|retry| queue[Queue]
  queue -->|try again| api
  api -->|success| done[Done]
```

The intentionally small **Mermaid-style subset** supports `flowchart` / `graph`, LR/RL/TD/TB/BT direction, identifiers, node labels in `[]`, `()` or `{}`, `-->` arrows, `-->|label|` edges, chained arrows, standalone nodes, and `%%` comment lines. Labels use one visual node style. This is a custom parser, **not a full Mermaid implementation**. Unsupported syntax produces an error instead of silently dropping content. Limits: 24 nodes, 48 connections, 100 scenes.

## Export notes

- WebM is recorded by your browser in real time at up to 30 fps. Keep the tab visible. Unsupported browsers show an explanation; current desktop Chromium or Firefox is a good starting point.
- Audio stays in memory and is **not embedded in project JSON or browser autosave**. Re-add it after reopening a project. Short audio ends naturally; longer audio is trimmed to the story.
- Captions wrap to three lines. Keep each card to a short spoken thought; exceptionally long captions are visually shortened with an ellipsis.
- The included MP4/GIF example uses the **same project and Canvas renderer**, rendered with the optional Node media script and FFmpeg. MP4 is a demo artifact, not a browser export option.

## Run anywhere

The editor is plain HTML, CSS, and native JavaScript modules. Serve the repository with any static host. No server-side processing is needed. The included Node server is for local development.

```sh
npm test        # parser, project format, camera and export lifecycle
npm run check   # JavaScript syntax
```

See [contributing](CONTRIBUTING.md) for the code map and [demo rendering](docs/DEVELOPMENT.md) for reproducible media generation.

## In good company

[Excalidraw](https://github.com/excalidraw/excalidraw) shows the value of an approachable canvas and open files. [Motion Canvas](https://github.com/motion-canvas/motion-canvas) is an excellent code-driven animation tool. [Cinegram](https://github.com/panset/cinegram) explores diagram-to-video workflows too. DiagramTake focuses on a lightweight sentence-card editor you can open and start directing immediately. These are references and neighboring tools, not bundled dependencies.

## License

[MIT](LICENSE). Build with it, remix it, and make your next explanation easier to follow.
