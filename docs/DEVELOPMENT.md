# Development and demo media

## Web application

`node server.js` runs a simple development server. A static host can serve `index.html`, `style.css`, and `src/` directly. The browser app has zero runtime dependencies.

## Optional reproducible demo renderer

Install `@napi-rs/canvas` from npm into a separate working directory and install FFmpeg from your platform's trusted package source. Then run:

```sh
CANVAS_MODULE=/absolute/path/to/node_modules/@napi-rs/canvas/index.js \
KOREAN_FONT=/absolute/path/to/NotoSansCJK-Regular.ttc \
node scripts/render-demo.mjs
```

This writes `examples/payment-retry.json`, `docs/story-frame.png`, and `docs/payment-retry.mp4`. It calls the same `renderFrame` function as the editor, at 1280×720 and 30 fps, and pipes PNG frames to FFmpeg. It does not call the browser export function. The Korean font option is useful on systems without a configured CJK fallback.

To create the README animation:

```sh
ffmpeg -i docs/payment-retry.mp4 \
  -vf 'fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse' \
  -loop 0 docs/story-preview.gif
```

## Verification scope

The Node tests cover project validation, diagram parsing, camera math and mocked export lifecycle. The shipped sample has been rendered with the shared Canvas renderer and inspected as media. Native MediaRecorder recording, browser audio decoding, and full DOM interactions need real-browser validation; passing Node tests is not proof of those platform behaviors.
