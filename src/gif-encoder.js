// Original, dependency-free GIF89a writer. A fixed 216-color cube plus grayscale
// and optional exact theme colors keep memory and palette size predictable.
// A caller-supplied 256-color palette can instead dedicate every slot to a theme.
// GIF structure: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
const CHUNK_SIZE = 16 * 1024;
const CLEAR_CODE = 256;
const END_CODE = 257;
function buildPalette(colors) {
  const palette = new Uint8Array(768);
  const nearestGray = new Uint8Array(766);
  const customStart = 256 - colors.length;
  for (let index = 0; index < 216; index++) {
    palette[index * 3] = Math.floor(index / 36) * 51;
    palette[index * 3 + 1] = Math.floor(index / 6) % 6 * 51;
    palette[index * 3 + 2] = index % 6 * 51;
  }
  for (let index = 216; index < customStart; index++) {
    const shade = Math.round((index - 216) * 255 / (customStart - 217));
    palette.fill(shade, index * 3, index * 3 + 3);
  }
  colors.forEach((color, index) => palette.set(color, (customStart + index) * 3));
  for (let sum = 0; sum <= 765; sum++) {
    let distance = Infinity;
    for (let gray = 216; gray < customStart; gray++) {
      const difference = Math.abs(palette[gray * 3] * 3 - sum);
      if (difference < distance) {
        distance = difference;
        nearestGray[sum] = gray;
      }
    }
  }
  return { palette, nearestGray, customStart };
}
const DEFAULT_PALETTE = buildPalette([]);

class ByteSink {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.length = 0;
    this.chunks = [];
    this.current = null;
    this.offset = 0;
  }

  reserve(size) {
    if (size > this.maxBytes - this.length) {
      throw new RangeError(`GIF size limit exceeded (${this.maxBytes} bytes).`);
    }
  }

  ensureChunk() {
    if (!this.current || this.offset === this.current.length) {
      this.current = new Uint8Array(Math.min(CHUNK_SIZE, this.maxBytes - this.length));
      this.chunks.push(this.current);
      this.offset = 0;
    }
  }

  byte(value) {
    this.reserve(1);
    this.ensureChunk();
    this.current[this.offset++] = value;
    this.length++;
  }

  word(value) {
    this.byte(value & 255);
    this.byte(value >>> 8);
  }

  bytes(values) {
    this.reserve(values.length);
    let read = 0;
    while (read < values.length) {
      this.ensureChunk();
      const size = Math.min(values.length - read, this.current.length - this.offset);
      this.current.set(values.subarray(read, read + size), this.offset);
      this.offset += size;
      this.length += size;
      read += size;
    }
  }

  text(value) {
    for (let i = 0; i < value.length; i++) this.byte(value.charCodeAt(i));
  }

  release() {
    this.chunks = [];
    this.current = null;
    this.offset = 0;
  }

  finish() {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      const used = Math.min(chunk.length, this.length - offset);
      result.set(chunk.subarray(0, used), offset);
      offset += used;
    }
    this.release();
    return result;
  }
}

function createQuantizer({ palette, nearestGray, customStart }) {
  // Direct-mapped exact-RGB cache: fixed 20 KiB, irrespective of frame count or
  // color diversity. Collisions replace old entries, never approximate a color.
  const keys = new Uint32Array(4096).fill(0xffffffff);
  const values = new Uint8Array(4096);
  return (rgba, offset) => {
    const alpha = rgba[offset + 3] / 255;
    // GIF has no partial alpha. Flatten onto white before quantizing, including
    // fully transparent pixels whose hidden RGB values may be arbitrary.
    const red = Math.round(255 + (rgba[offset] - 255) * alpha);
    const green = Math.round(255 + (rgba[offset + 1] - 255) * alpha);
    const blue = Math.round(255 + (rgba[offset + 2] - 255) * alpha);
    const key = (red << 16) | (green << 8) | blue;
    const slot = Math.imul(key, 0x9e3779b1) >>> 20;
    if (keys[slot] === key) return values[slot];

    let index = 0;
    let error = Infinity;
    if (nearestGray) {
      const cube = Math.round(red / 51) * 36 + Math.round(green / 51) * 6 + Math.round(blue / 51);
      const gray = nearestGray[red + green + blue];
      const shade = palette[gray * 3];
      const cubeError = (red - palette[cube * 3]) ** 2
        + (green - palette[cube * 3 + 1]) ** 2 + (blue - palette[cube * 3 + 2]) ** 2;
      const grayError = (red - shade) ** 2 + (green - shade) ** 2 + (blue - shade) ** 2;
      index = grayError < cubeError ? gray : cube;
      error = Math.min(grayError, cubeError);
    }
    for (let candidate = customStart; candidate < 256 && error > 0; candidate++) {
      const difference = (red - palette[candidate * 3]) ** 2
        + (green - palette[candidate * 3 + 1]) ** 2 + (blue - palette[candidate * 3 + 2]) ** 2;
      if (difference < error) {
        error = difference;
        index = candidate;
      }
    }
    keys[slot] = key;
    values[slot] = index;
    return index;
  };
}

function writeImageData(sink, rgba, paletteIndex) {
  sink.byte(8); // Minimum LZW code size: the global palette has 256 entries.
  const block = new Uint8Array(255);
  let blockLength = 0;
  let pending = 0;
  let pendingBits = 0;
  let codeSize = 9;
  let nextCode = 258;
  const dictionary = new Map();

  function flushBlock() {
    if (!blockLength) return;
    sink.byte(blockLength);
    sink.bytes(block.subarray(0, blockLength));
    blockLength = 0;
  }

  function emitByte(value) {
    block[blockLength++] = value;
    if (blockLength === 255) flushBlock();
  }

  function emitCode(code) {
    pending |= code << pendingBits;
    pendingBits += codeSize;
    while (pendingBits >= 8) {
      emitByte(pending & 255);
      pending >>>= 8;
      pendingBits -= 8;
    }
  }

  function emitPixelCode(code) {
    emitCode(code);
    // The decoder creates an entry one emitted code later than the encoder.
    // Grow AFTER writing this code, including the final pixel code before EOI.
    if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
  }

  emitCode(CLEAR_CODE);
  let prefix = paletteIndex(rgba, 0);
  for (let offset = 4; offset < rgba.length; offset += 4) {
    const color = paletteIndex(rgba, offset);
    const key = (prefix << 8) | color;
    const match = dictionary.get(key);
    if (match !== undefined) {
      prefix = match;
      continue;
    }

    emitPixelCode(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
    } else {
      emitCode(CLEAR_CODE);
      dictionary.clear();
      codeSize = 9;
      nextCode = 258;
    }
    prefix = color;
  }
  emitPixelCode(prefix);
  emitCode(END_CODE);
  if (pendingBits) emitByte(pending & 255);
  flushBlock();
  sink.byte(0); // Image-data sub-block terminator.
}

/**
 * Encode opaque, full-size animated GIF frames without dependencies.
 * width/height: integers 1..1280. delay: 0..655350 milliseconds, rounded to
 * centiseconds, shared by every frame. repeat: 0 = forever, otherwise 1..65535.
 * RGBA frames must be Uint8Array or Uint8ClampedArray; alpha is flattened white.
 * colors: optionally reserve up to 20 exact [r, g, b] byte triples in the palette,
 * replacing grayscale slots. The 216-color cube and at least 20 grays remain.
 * palette: optionally supply exactly 256 [r, g, b] byte triples instead. Cannot
 * be combined with nonempty colors. A defensive copy is used for exact nearest
 * RGB quantization, with the closest-to-white color as the logical background.
 * Each addFrame encodes synchronously and does not retain its input. Only encoded
 * chunks are retained. maxBytes caps the complete file; final assembly temporarily
 * needs another output-sized buffer. An exceeded limit permanently fails the writer.
 */
export function createGifEncoder({
  width,
  height,
  delay = 100,
  repeat = 0,
  maxBytes = 32 * 1024 * 1024,
  colors = [],
  palette,
} = {}) {
  for (const [name, value] of [["width", width], ["height", height]]) {
    if (!Number.isInteger(value) || value < 1 || value > 1280) {
      throw new RangeError(`GIF ${name} must be an integer between 1 and 1280.`);
    }
  }
  if (!Number.isFinite(delay) || delay < 0 || delay > 655350) {
    throw new RangeError("GIF delay must be between 0 and 655350 milliseconds.");
  }
  if (!Number.isInteger(repeat) || repeat < 0 || repeat > 65535) {
    throw new RangeError("GIF repeat must be an integer between 0 and 65535.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("GIF maxBytes must be a positive safe integer.");
  }
  if (!Array.isArray(colors) || colors.length > 20) {
    throw new RangeError("GIF colors must be an array of at most 20 RGB triples.");
  }
  for (const color of colors) {
    if (!Array.isArray(color) || color.length !== 3
      || [...color].some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new RangeError("GIF colors must contain RGB triples of integer bytes (0..255).");
    }
  }
  if (palette !== undefined) {
    if (!Array.isArray(palette) || palette.length !== 256) {
      throw new RangeError("GIF palette must be an array of exactly 256 RGB triples.");
    }
    if (colors.length) {
      throw new RangeError("GIF palette cannot be combined with nonempty colors.");
    }
    for (const color of palette) {
      if (!Array.isArray(color) || color.length !== 3
        || [...color].some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        throw new RangeError("GIF palette must contain RGB triples of integer bytes (0..255).");
      }
    }
  }

  const sink = new ByteSink(maxBytes);
  const paletteConfig = palette !== undefined
    ? { palette: Uint8Array.from(palette.flat()), customStart: 0 }
    : colors.length ? buildPalette(colors) : DEFAULT_PALETTE;
  const paletteIndex = createQuantizer(paletteConfig);
  const frameLength = width * height * 4;
  const delayCentiseconds = Math.round(delay / 10);
  let state = "open";
  let frames = 0;

  sink.text("GIF89a");
  sink.word(width);
  sink.word(height);
  sink.byte(0xf7); // Global table, 8-bit source color, unsorted, 256 entries.
  sink.byte(palette !== undefined
    ? paletteIndex(Uint8Array.of(255, 255, 255, 255), 0)
    : colors.length ? 215 : 255); // Nearest-to-white background index.
  sink.byte(0); // Unspecified pixel aspect ratio.
  sink.bytes(paletteConfig.palette);
  sink.byte(0x21);
  sink.byte(0xff);
  sink.byte(11);
  sink.text("NETSCAPE2.0");
  sink.byte(3);
  sink.byte(1);
  sink.word(repeat);
  sink.byte(0);

  function assertOpen() {
    if (state !== "open") throw new Error(`GIF encoder is ${state}.`);
  }

  function fail(error) {
    state = "failed";
    sink.release();
    throw error;
  }

  return {
    addFrame(rgba) {
      assertOpen();
      if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) {
        throw new TypeError("GIF frame must be a Uint8Array or Uint8ClampedArray of RGBA bytes.");
      }
      if (rgba.length !== frameLength) {
        throw new RangeError(`GIF frame must contain exactly ${frameLength} RGBA bytes.`);
      }
      try {
        sink.byte(0x21);
        sink.byte(0xf9);
        sink.byte(4);
        sink.byte(4); // Disposal 1: retain; every next frame replaces the full image.
        sink.word(delayCentiseconds);
        sink.byte(0); // No transparent index (transparency flag is off).
        sink.byte(0);
        sink.byte(0x2c); // Image descriptor, full screen, no local palette/interlace.
        sink.word(0);
        sink.word(0);
        sink.word(width);
        sink.word(height);
        sink.byte(0);
        writeImageData(sink, rgba, paletteIndex);
        frames++;
      } catch (error) {
        fail(error);
      }
    },

    finish() {
      assertOpen();
      if (!frames) throw new Error("GIF needs at least one frame before finish().");
      try {
        sink.byte(0x3b);
        const result = sink.finish();
        state = "finished";
        return result;
      } catch (error) {
        fail(error);
      }
    },
  };
}
