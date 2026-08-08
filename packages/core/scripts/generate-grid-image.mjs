/*
 * Generates the numbered-grid fixture image used by the renderer's geometric
 * e2e assertions — the epic's hard correctness gate (spec §Testing Decisions,
 * "Geometric assertions").
 *
 * The image is committed, so e2e never depends on running this. Regenerate with:
 *
 *     node packages/core/scripts/generate-grid-image.mjs
 *
 * ## Why this image looks the way it does
 *
 * The assertion is "a named feature lands at a known screen coordinate within
 * one pixel", and it must survive Canvas2D resampling, which differs at
 * essentially every pixel between engines and zoom levels. So the features are
 * solid, uniquely-coloured squares: the set of pixels matching a marker's exact
 * colour shrinks symmetrically as resampling blends the edges, which leaves the
 * CENTROID of that set exactly on the marker's centre at any scale. A feature
 * built from strokes, text, or gradients would not have that property.
 *
 * The grid lines and the printed cell numbers carry no assertions. They exist so
 * that a failing screenshot is legible to a human debugging it.
 *
 * A hand-rolled PNG encoder (zlib is in Node) keeps this dependency-free.
 *
 * ## Also a module
 *
 * `draw`, `renderRegion`, and `encodePng` are exported, and the file write only
 * happens when this file is *run*. The fake IIIF image service that backs the
 * tiled e2e fixture (`scripts/iiifFixturePlugin.mjs`) renders its tiles from the
 * same pixels, so the tiled fixture and the static one are the same picture and
 * the geometric assertions carry over to deep zoom unchanged.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WIDTH = 1200;
export const HEIGHT = 900;
export const CELL = 100;
/** Marker edge length in image pixels. Even, so its centre is on a pixel edge. */
export const MARKER = 24;

const BACKGROUND = [255, 255, 255];
const GRID_LINE = [200, 200, 200];
const AXIS_LINE = [150, 150, 150];
const DIGIT = [48, 48, 48];

/**
 * The named features, at known image coordinates. Colours are deliberately
 * saturated and far apart from each other and from every other colour in the
 * image, so a tolerance-based pixel match can never confuse two of them.
 */
export const FEATURES = [
    { name: 'alpha', x: 200, y: 150, color: [230, 0, 0] },
    { name: 'bravo', x: 600, y: 450, color: [0, 170, 0] },
    { name: 'charlie', x: 1000, y: 750, color: [0, 0, 220] },
    { name: 'delta', x: 200, y: 750, color: [220, 0, 220] },
    { name: 'echo', x: 1000, y: 150, color: [0, 180, 190] },
];

/** 3x5 bitmap digits, so the fixture is human-readable without a font. */
const DIGITS = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'],
    7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'],
};

function createPixels() {
    const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
    for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = BACKGROUND[0];
        pixels[i + 1] = BACKGROUND[1];
        pixels[i + 2] = BACKGROUND[2];
    }
    return pixels;
}

function setPixel(pixels, x, y, color) {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const offset = (y * WIDTH + x) * 3;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
}

function fillRect(pixels, x, y, width, height, color) {
    for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
            setPixel(pixels, x + dx, y + dy, color);
        }
    }
}

function drawDigits(pixels, text, x, y, scale) {
    let cursor = x;
    for (const char of text) {
        const glyph = DIGITS[char];
        if (!glyph) {
            cursor += 4 * scale;
            continue;
        }
        glyph.forEach((row, rowIndex) => {
            [...row].forEach((bit, colIndex) => {
                if (bit !== '1') return;
                fillRect(
                    pixels,
                    cursor + colIndex * scale,
                    y + rowIndex * scale,
                    scale,
                    scale,
                    DIGIT,
                );
            });
        });
        cursor += 4 * scale;
    }
}

export function draw() {
    const pixels = createPixels();

    for (let x = 0; x <= WIDTH; x += CELL) {
        fillRect(pixels, x, 0, 1, HEIGHT, x === 0 ? AXIS_LINE : GRID_LINE);
    }
    for (let y = 0; y <= HEIGHT; y += CELL) {
        fillRect(pixels, 0, y, WIDTH, 1, y === 0 ? AXIS_LINE : GRID_LINE);
    }

    // Cell numbers, row-major, in the top-left of each cell.
    let cellIndex = 0;
    for (let y = 0; y < HEIGHT; y += CELL) {
        for (let x = 0; x < WIDTH; x += CELL) {
            drawDigits(pixels, String(cellIndex), x + 6, y + 6, 3);
            cellIndex += 1;
        }
    }

    for (const feature of FEATURES) {
        fillRect(
            pixels,
            feature.x - MARKER / 2,
            feature.y - MARKER / 2,
            MARKER,
            MARKER,
            feature.color,
        );
    }

    return pixels;
}

// ── Minimal PNG encoder (8-bit truecolour, no interlace) ────────────────────

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([length, typeAndData, crc]);
}

export function encodePng(pixels, width = WIDTH, height = HEIGHT) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(2, 9); // colour type: truecolour
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace

    // Filter type 0 (None) per scanline: the image is flat colour blocks, so
    // predictive filters buy little and cost clarity.
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
            raw,
            y * (stride + 1) + 1,
        );
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * A IIIF Image API region of the grid, resampled to `targetWidth`.
 *
 * Nearest-neighbour on purpose: it is exact at scale factor 1, which is the
 * level the deep-zoom geometric assertions land on, and it leaves the marker
 * colours untouched at every coarser level so a centroid search still finds
 * them. A box filter would blend markers toward the background and shrink the
 * matched set for no benefit here.
 */
export function renderRegion(source, region, targetWidth, targetHeight) {
    const out = new Uint8Array(targetWidth * targetHeight * 3);

    for (let y = 0; y < targetHeight; y += 1) {
        const sourceY = Math.min(
            HEIGHT - 1,
            region.y + Math.floor((y * region.height) / targetHeight),
        );
        for (let x = 0; x < targetWidth; x += 1) {
            const sourceX = Math.min(
                WIDTH - 1,
                region.x + Math.floor((x * region.width) / targetWidth),
            );
            const from = (sourceY * WIDTH + sourceX) * 3;
            const to = (y * targetWidth + x) * 3;
            out[to] = source[from];
            out[to + 1] = source[from + 1];
            out[to + 2] = source[from + 2];
        }
    }

    return out;
}

// Only when RUN, never when imported: the fake image service imports this file
// for `draw`/`renderRegion` and must not write to the repository to do it.
if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const outPath = resolve(
        __dirname,
        '../public/demo-manifests/static-image/numbered-grid.png',
    );
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, encodePng(draw()));
    process.stdout.write(`wrote ${outPath} (${WIDTH}x${HEIGHT})\n`);
}
