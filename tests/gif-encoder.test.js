import assert from "node:assert/strict";
import test from "node:test";
import { createGifEncoder } from "../src/gif-encoder.js";
import { THEMES } from "../src/themes.js";

// An independent, intentionally simple GIF/LZW decoder for byte-level tests.
// No browser, image libraries, subprocesses, or dependencies are needed.
function decodeLzw(bytes, minimumCodeSize, expectedLength) {
  const clear = 1 << minimumCodeSize;
  const end = clear + 1;
  let table;
  let size;
  let previous;
  let bit = 0;
  let clears = 0;
  let maximumSize = 0;
  const output = [];

  function reset() {
    table = Array.from({ length: clear }, (_, color) => [color]);
    table.push(null, null);
    size = minimumCodeSize + 1;
    previous = null;
  }
  reset();
  while (true) {
    assert.ok(bit + size <= bytes.length * 8, "LZW end code is present");
    maximumSize = Math.max(maximumSize, size);
    let code = 0;
    for (let shift = 0; shift < size; shift++, bit++) {
      code |= ((bytes[bit >>> 3] >>> (bit & 7)) & 1) << shift;
    }
    if (code === clear) {
      clears++;
      reset();
      continue;
    }
    if (code === end) break;
    const entry = table[code] || (code === table.length && previous
      ? [...previous, previous[0]] : null);
    assert.ok(entry, `valid LZW code ${code} at dictionary size ${table.length}`);
    output.push(...entry);
    assert.ok(output.length <= expectedLength, "decoded pixels stay within frame bounds");
    if (previous && table.length < 4096) {
      table.push([...previous, entry[0]]);
      if (table.length === (1 << size) && size < 12) size++;
    }
    previous = entry;
  }
  assert.equal(output.length, expectedLength);
  return { pixels: Uint8Array.from(output), clears, maximumSize };
}

function decodeGif(bytes) {
  let offset = 0;
  function byte() {
    assert.ok(offset < bytes.length, "file is not truncated");
    return bytes[offset++];
  }
  function word() { return byte() | (byte() << 8); }
  function text(length) { return String.fromCharCode(...take(length)); }
  function take(length) {
    assert.ok(offset + length <= bytes.length, "block is not truncated");
    const result = bytes.slice(offset, offset + length);
    offset += length;
    return result;
  }
  function subBlocks() {
    const result = [];
    for (let length = byte(); length; length = byte()) result.push(...take(length));
    return Uint8Array.from(result);
  }

  assert.equal(text(6), "GIF89a");
  const width = word();
  const height = word();
  const flags = byte();
  assert.equal(flags, 0xf7);
  const background = byte();
  assert.equal(byte(), 0);
  const palette = take(3 * (2 ** ((flags & 7) + 1)));
  const frames = [];
  let repeat;
  let control;
  let introducer;
  while ((introducer = byte()) !== 0x3b) {
    if (introducer === 0x21) {
      const label = byte();
      if (label === 0xff) {
        assert.equal(text(byte()), "NETSCAPE2.0");
        const data = subBlocks();
        assert.equal(data.length, 3);
        assert.equal(data[0], 1);
        repeat = data[1] | (data[2] << 8);
      } else {
        assert.equal(label, 0xf9);
        assert.equal(byte(), 4);
        control = { flags: byte(), delay: word() * 10, transparent: byte() };
        assert.equal(byte(), 0);
      }
      continue;
    }
    assert.equal(introducer, 0x2c);
    assert.equal(word(), 0);
    assert.equal(word(), 0);
    assert.equal(word(), width);
    assert.equal(word(), height);
    assert.equal(byte(), 0);
    assert.ok(control, "each frame has its own control extension");
    const minimum = byte();
    assert.equal(minimum, 8);
    const decoded = decodeLzw(subBlocks(), minimum, width * height);
    frames.push({ ...control, ...decoded });
    control = null;
  }
  assert.equal(offset, bytes.length, "trailer is the final byte");
  return { width, height, background, palette, repeat, frames };
}

function rgbFromIndex(value) {
  return value < 216
    ? [Math.floor(value / 36) * 51, Math.floor(value / 6) % 6 * 51, value % 6 * 51]
    : new Array(3).fill(Math.round((value - 216) * 255 / 39));
}

function nearestIndex(rgb) {
  let best;
  let error = Infinity;
  for (let candidate = 0; candidate < 256; candidate++) {
    const color = rgbFromIndex(candidate);
    const difference = color.reduce((sum, value, index) => sum + (value - rgb[index]) ** 2, 0);
    if (difference < error) {
      best = candidate;
      error = difference;
    }
  }
  return best;
}

const CANONICAL = Uint8Array.from({ length: 256 }, (_, i) => nearestIndex(rgbFromIndex(i)));
function canonicalIndices(indices) { return Uint8Array.from(indices, (i) => CANONICAL[i]); }

function rgbaFromIndices(indices) {
  const rgba = new Uint8ClampedArray(indices.length * 4);
  indices.forEach((value, i) => {
    rgba.set(rgbFromIndex(value), i * 4);
    rgba[i * 4 + 3] = 255;
  });
  return rgba;
}

function noise(length, seed = 0xdecafbad) {
  const indices = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    indices[i] = seed & 255;
  }
  return indices;
}

test("single pixel is a complete GIF89a with default timing and infinite loop", () => {
  const encoder = createGifEncoder({ width: 1, height: 1 });
  encoder.addFrame(new Uint8Array([255, 0, 0, 255]));
  const output = encoder.finish();
  assert.ok(output instanceof Uint8Array);
  const gif = decodeGif(output);
  assert.equal(gif.width, 1);
  assert.equal(gif.height, 1);
  assert.equal(gif.background, 255);
  assert.equal(gif.repeat, 0);
  assert.equal(gif.frames.length, 1);
  assert.equal(gif.frames[0].delay, 100);
  assert.equal(gif.frames[0].flags, 4);
  assert.deepEqual(gif.frames[0].pixels, Uint8Array.of(180));
});

test("every palette color round-trips and each frame is encoded before returning", () => {
  const indices = Uint8Array.from({ length: 256 }, (_, i) => i);
  const rgba = rgbaFromIndices(indices);
  const encoder = createGifEncoder({ width: 16, height: 16, delay: 125, repeat: 3 });
  encoder.addFrame(rgba);
  rgba.fill(0); // Reuse/mutate the caller's frame without affecting earlier data.
  encoder.addFrame(rgba);
  const gif = decodeGif(encoder.finish());
  assert.equal(gif.repeat, 3);
  assert.equal(gif.frames.length, 2);
  assert.deepEqual(gif.frames[0].pixels, canonicalIndices(indices));
  assert.deepEqual(gif.frames[1].pixels, new Uint8Array(256).fill(215));
  for (const frame of gif.frames) assert.equal(frame.delay, 130);
  for (let i = 0; i < 256; i++) {
    assert.deepEqual([...gif.palette.slice(i * 3, i * 3 + 3)], rgbFromIndex(i));
  }
});

test("partial alpha is composited on white before bounded palette quantization", () => {
  const encoder = createGifEncoder({ width: 4, height: 1, delay: 0 });
  encoder.addFrame(Uint8Array.of(
    0, 0, 0, 0,
    0, 0, 0, 128,
    255, 0, 0, 128,
    0, 0, 0, 255,
  ));
  const { frames } = decodeGif(encoder.finish());
  assert.deepEqual(frames[0].pixels, Uint8Array.from([
    nearestIndex([255, 255, 255]), nearestIndex([127, 127, 127]),
    nearestIndex([255, 127, 127]), nearestIndex([0, 0, 0]),
  ]));
  assert.equal(frames[0].delay, 0);
});

test("quantization picks the nearest palette color and keeps dark backgrounds neutral", () => {
  const rgba = noise(2048 * 4);
  rgba.set([25, 27, 32, 255], 0);
  rgba.set([250, 248, 242, 255], 4);
  const encoder = createGifEncoder({ width: 128, height: 16 });
  encoder.addFrame(rgba);
  const gif = decodeGif(encoder.finish());
  const expected = new Uint8Array(2048);
  for (let i = 0; i < expected.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    const rgb = [0, 1, 2].map((channel) => Math.round(255 + (rgba[i * 4 + channel] - 255) * alpha));
    expected[i] = nearestIndex(rgb);
  }
  assert.deepEqual(gif.frames[0].pixels, expected);
  assert.deepEqual(rgbFromIndex(expected[0]), [26, 26, 26]);
});

test("optional exact colors preserve all three DiagramTake themes", () => {
  for (const theme of Object.values(THEMES)) {
    const colors = [...Object.values(theme), ...Object.values(theme.accents)]
      .filter((value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
      .map((value) => [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)));
    const rgba = Uint8Array.from(colors.flatMap((color) => [...color, 255]));
    const encoder = createGifEncoder({ width: colors.length, height: 1, colors });
    encoder.addFrame(rgba);
    const gif = decodeGif(encoder.finish());
    assert.equal(gif.background, 215);
    for (let i = 0; i < colors.length; i++) {
      const index = gif.frames[0].pixels[i];
      assert.deepEqual([...gif.palette.slice(index * 3, index * 3 + 3)], colors[i], theme.name);
    }
  }
});

test("20 custom colors retain the cube, at least 20 grays, and do not retain input arrays", () => {
  const colors = Array.from({ length: 20 }, (_, i) => [i + 1, i * 2 + 3, i * 3 + 5]);
  const original = colors.map((color) => [...color]);
  const encoder = createGifEncoder({ width: 20, height: 1, colors });
  colors.forEach((color) => color.fill(0));
  colors.length = 0;
  encoder.addFrame(Uint8Array.from(original.flatMap((color) => [...color, 255])));
  const gif = decodeGif(encoder.finish());
  for (let index = 0; index < 216; index++) {
    assert.deepEqual([...gif.palette.slice(index * 3, index * 3 + 3)], rgbFromIndex(index));
  }
  for (let index = 216; index < 236; index++) {
    assert.deepEqual([...gif.palette.slice(index * 3, index * 3 + 3)], new Array(3).fill(Math.round((index - 216) * 255 / 19)));
  }
  for (let index = 0; index < 20; index++) {
    const decoded = gif.frames[0].pixels[index];
    assert.deepEqual([...gif.palette.slice(decoded * 3, decoded * 3 + 3)], original[index]);
  }
  const defaultEncoder = createGifEncoder({ width: 1, height: 1 });
  defaultEncoder.addFrame(Uint8Array.of(25, 27, 32, 255));
  const defaultGif = decodeGif(defaultEncoder.finish());
  assert.equal(defaultGif.background, 255);
  assert.deepEqual(rgbFromIndex(defaultGif.frames[0].pixels[0]), [26, 26, 26]);
});

test("a full 256-color palette preserves every supplied color exactly", () => {
  const palette = Array.from({ length: 256 }, (_, i) => [i, i * 37 % 256, i * 73 % 256]);
  const encoder = createGifEncoder({ width: 16, height: 16, palette });
  encoder.addFrame(Uint8Array.from(palette.flatMap((color) => [...color, 255])));
  const gif = decodeGif(encoder.finish());
  assert.deepEqual(gif.palette, Uint8Array.from(palette.flat()));
  assert.deepEqual(gif.frames[0].pixels, Uint8Array.from({ length: 256 }, (_, i) => i));
});

test("full-palette quantization finds exact nearest RGB colors after alpha flattening and cache collisions", () => {
  const palette = Array.from({ length: 256 }, (_, i) => [i, i * 37 % 256, i * 73 % 256]);
  // White is deliberately absent; the logical background must use its nearest color.
  const nearest = (rgb) => {
    let best = 0;
    let error = Infinity;
    palette.forEach((color, index) => {
      const difference = color.reduce((sum, value, channel) => sum + (value - rgb[channel]) ** 2, 0);
      if (difference < error) {
        best = index;
        error = difference;
      }
    });
    return best;
  };
  // More colors than cache slots, then repeat them to exercise replacement safely.
  const rgba = noise(8192 * 4);
  rgba.set([19, 73, 220, 0, 10, 90, 170, 128], 0);
  const encoder = createGifEncoder({ width: 128, height: 64, palette });
  encoder.addFrame(rgba);
  encoder.addFrame(rgba);
  const gif = decodeGif(encoder.finish());
  const expected = Uint8Array.from({ length: 8192 }, (_, i) => {
    const alpha = rgba[i * 4 + 3] / 255;
    return nearest([0, 1, 2].map((channel) => Math.round(255 + (rgba[i * 4 + channel] - 255) * alpha)));
  });
  assert.equal(gif.background, nearest([255, 255, 255]));
  assert.equal(expected[0], gif.background);
  for (const frame of gif.frames) assert.deepEqual(frame.pixels, expected);
});

test("full palettes are copied before callers can mutate their RGB arrays", () => {
  const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, i * 13 % 256]);
  const original = palette.map((color) => [...color]);
  const encoder = createGifEncoder({ width: 16, height: 16, palette, colors: [] });
  palette.forEach((color) => color.fill(0));
  palette.fill([255, 255, 255]);
  palette.length = 0;
  encoder.addFrame(Uint8Array.from(original.flatMap((color) => [...color, 255])));
  const gif = decodeGif(encoder.finish());
  assert.deepEqual(gif.palette, Uint8Array.from(original.flat()));
  assert.deepEqual(gif.frames[0].pixels, Uint8Array.from({ length: 256 }, (_, i) => i));
});

test("full palettes reject invalid sizes, RGB bytes, sparse arrays, and reserved-color combinations", () => {
  const valid = Array.from({ length: 256 }, (_, i) => [i, i, i]);
  const options = { width: 1, height: 1 };
  for (const palette of [null, "palette", {}, new Uint8Array(768), [], valid.slice(1), [...valid, [0, 0, 0]], new Array(256)]) {
    assert.throws(() => createGifEncoder({ ...options, palette }), /palette/);
  }
  for (const color of [null, [1, 2], [1, 2, 3, 4], new Array(3), [undefined, 0, 0],
    [-1, 0, 0], [256, 0, 0], [NaN, 0, 0], [Infinity, 0, 0], [0.5, 0, 0], ["1", 0, 0]]) {
    const palette = [...valid];
    palette[123] = color;
    assert.throws(() => createGifEncoder({ ...options, palette }), /palette/);
  }
  assert.throws(() => createGifEncoder({ ...options, palette: valid, colors: [[1, 2, 3]] }), /palette.*colors/);
});

test("LZW code widths grow through 12 bits and reset on incompressible frames", () => {
  const indices = noise(256 * 256);
  const encoder = createGifEncoder({ width: 256, height: 256 });
  encoder.addFrame(rgbaFromIndices(indices));
  const frame = decodeGif(encoder.finish()).frames[0];
  assert.deepEqual(frame.pixels, canonicalIndices(indices));
  assert.equal(frame.maximumSize, 12);
  assert.ok(frame.clears > 2, "full dictionaries are cleared and reused");
});

test("LZW handles short data, repeated runs, and endings near code-width boundaries", () => {
  for (const length of [1, 2, 3, 254, 255, 256, 257, 258, 511, 512, 513, 1024, 1280]) {
    for (const indices of [noise(length), new Uint8Array(length).fill(85)]) {
      const encoder = createGifEncoder({ width: length, height: 1 });
      encoder.addFrame(rgbaFromIndices(indices));
      assert.deepEqual(decodeGif(encoder.finish()).frames[0].pixels, canonicalIndices(indices));
    }
  }
});

test("larger logical dimensions and maximum timing/repeat are little-endian", () => {
  const encoder = createGifEncoder({ width: 1280, height: 2, delay: 655350, repeat: 65535 });
  encoder.addFrame(new Uint8Array(1280 * 2 * 4));
  const gif = decodeGif(encoder.finish());
  assert.equal(gif.width, 1280);
  assert.equal(gif.height, 2);
  assert.equal(gif.frames[0].delay, 655350);
  assert.equal(gif.repeat, 65535);
});

test("invalid dimensions, delay, repeat, and byte budgets are rejected", () => {
  for (const dimension of [undefined, null, 0, -1, 1.5, 1281, Infinity, NaN, "2"]) {
    assert.throws(() => createGifEncoder({ width: dimension, height: 1 }), /width/);
    assert.throws(() => createGifEncoder({ width: 1, height: dimension }), /height/);
  }
  for (const delay of [null, -1, 655351, Infinity, NaN, "100"]) {
    assert.throws(() => createGifEncoder({ width: 1, height: 1, delay }), /delay/);
  }
  for (const repeat of [null, -1, 1.5, 65536, Infinity, NaN, "1"]) {
    assert.throws(() => createGifEncoder({ width: 1, height: 1, repeat }), /repeat/);
  }
  for (const maxBytes of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1000"]) {
    assert.throws(() => createGifEncoder({ width: 1, height: 1, maxBytes }), /maxBytes/);
  }
  assert.throws(() => createGifEncoder({ width: 1, height: 1, maxBytes: 799 }), /size limit/);
});

test("custom palettes reject malformed or excessive colors", () => {
  for (const colors of [null, "red", {}, new Array(21).fill([0, 0, 0]), [null],
    [[1, 2]], [[1, 2, 3, 4]], [[-1, 0, 0]], [[256, 0, 0]], [[NaN, 0, 0]],
    [[0.5, 0, 0]], [["1", 0, 0]], [new Array(3)], new Array(1)]) {
    assert.throws(() => createGifEncoder({ width: 1, height: 1, colors }), /colors/);
  }
});

test("invalid frames and empty finish are retryable; finished writers cannot be reused", () => {
  const encoder = createGifEncoder({ width: 1, height: 1 });
  assert.throws(() => encoder.finish(), /at least one frame/);
  for (const frame of [null, undefined, [0, 0, 0, 255], new Uint16Array(4), {}]) {
    assert.throws(() => encoder.addFrame(frame), /RGBA bytes/);
  }
  for (const length of [0, 3, 5, 8]) {
    assert.throws(() => encoder.addFrame(new Uint8Array(length)), /exactly 4/);
  }
  encoder.addFrame(Uint8Array.of(0, 0, 0, 255));
  assert.equal(decodeGif(encoder.finish()).frames.length, 1);
  assert.throws(() => encoder.finish(), /finished/);
  assert.throws(() => encoder.addFrame(new Uint8Array(4)), /finished/);
});

test("maxBytes includes frame sub-blocks and trailer, and overflow fails safely", () => {
  const rgba = rgbaFromIndices(noise(32 * 32));
  const baseline = createGifEncoder({ width: 32, height: 32 });
  baseline.addFrame(rgba);
  const expected = baseline.finish();

  const exact = createGifEncoder({ width: 32, height: 32, maxBytes: expected.length });
  exact.addFrame(rgba);
  assert.deepEqual(exact.finish(), expected);

  const noTrailer = createGifEncoder({ width: 32, height: 32, maxBytes: expected.length - 1 });
  noTrailer.addFrame(rgba);
  assert.throws(() => noTrailer.finish(), /size limit/);
  assert.throws(() => noTrailer.finish(), /failed/);

  const tooSmall = createGifEncoder({ width: 32, height: 32, maxBytes: 900 });
  assert.throws(() => tooSmall.addFrame(rgba), /size limit/);
  assert.throws(() => tooSmall.addFrame(rgba), /failed/);
  assert.throws(() => tooSmall.finish(), /failed/);
});
