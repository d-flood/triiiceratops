/**
 * The **peaks model** and the two parsers that produce it.
 *
 * Part of the lazily-imported waveform chunk: nothing in the plugin's eager
 * graph may import this module by value, or the bytes stop being on-demand
 * (SPEC — "Delivery and packaging").
 *
 * ## The content-sniffing contract
 *
 * Detection is by CONTENT, in a fixed order, and a declared `format` is never
 * consulted:
 *
 * 1. **audiowaveform binary** — the bytes are read as a `.dat` header first.
 * 2. **audiowaveform JSON** — only if the bytes are not a valid binary header.
 * 3. Neither ⇒ no peaks, one developer warning, and a lane that renders
 *    without a waveform.
 *
 * That order is a contract rather than a heuristic because the two publishers in
 * the wild disagree about `format` and neither agrees with the payload: Avalon
 * serves `waveform.json` as `application/json` (it is JSON), the British Library
 * serves a `.dat` as `application/octet-stream`, and a server that gets it wrong
 * — a `.dat` announced as `application/json` is the observed case — must still
 * render. The binary header is the cheap, unambiguous test (a four-byte version
 * of 1 or 2 followed by a self-consistent length), and no JSON document can
 * satisfy it, so trying it first costs nothing and cannot misfire.
 *
 * That last property has a consequence worth stating plainly, because it looks
 * like a gap in the tests: **the order is unfalsifiable by construction.** The
 * two acceptance tests — a self-consistent binary header and a parseable JSON
 * document — cannot both hold for one input, so swapping the two attempts here
 * changes no observable behaviour and no test can force it to. What the tests
 * pin is the property the order rests on: bytes of each format parse to the same
 * model whatever the server declared them to be. The order is written down for
 * the reader, not defended by a test.
 *
 * ## The two on-disk formats
 *
 * Both are `audiowaveform`'s own (`github.com/bbc/audiowaveform`). The binary
 * header is little-endian:
 *
 * | offset | v1 | v2 |
 * | --- | --- | --- |
 * | 0 | version (`int32`) | version (`int32`) |
 * | 4 | flags (`uint32`; bit 0 set ⇒ 8-bit data) | same |
 * | 8 | sample rate (`int32`) | same |
 * | 12 | samples per pixel (`int32`) | same |
 * | 16 | length in points (`uint32`) | same |
 * | 20 | *(data starts)* | channels (`int32`) |
 * | 24 | — | *(data starts)* |
 *
 * Version 1 has no channel count and is always mono. The data is `length ×
 * channels` consecutive min/max pairs.
 *
 * The JSON form carries the same fields under snake_case names plus `bits`, and
 * `data` as a plain number array in the same order. Note that one
 * `audiowaveform` run writes the `.dat` as format version 1 and the `.json` as
 * version 2 from the same clip — which is exactly why the two parsers must
 * normalize rather than expose their source's shape.
 *
 * ## Normalization
 *
 * 8-bit data is scaled to the 16-bit range on the way in, so a consumer never
 * asks how wide the source samples were. Everything else is carried through.
 */

/** The single normalized representation of waveform data. */
export interface Peaks {
    /**
     * Consecutive `min, max` pairs at 16-bit scale, channel-major within each
     * point: `[c0min, c0max, c1min, c1max, …]` for point 0, then point 1, and so
     * on. Length is always `points × channels × 2`.
     */
    readonly pairs: Int16Array;
    /** The audio's sample rate in Hz. */
    readonly sampleRate: number;
    /** Audio samples summarized by each point — the data's temporal resolution. */
    readonly samplesPerPixel: number;
    readonly channels: number;
    /** How many points the data holds. */
    readonly points: number;
}

/** The clip's length in seconds, as the peaks data itself describes it. */
export function peaksDuration(peaks: Peaks): number {
    return (peaks.points * peaks.samplesPerPixel) / peaks.sampleRate;
}

const HEADER_V1_BYTES = 20;
const HEADER_V2_BYTES = 24;

function isUsableCount(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}

function build(
    values: ArrayLike<number>,
    eightBit: boolean,
    sampleRate: number,
    samplesPerPixel: number,
    channels: number,
): Peaks | null {
    const perPoint = channels * 2;
    const points = Math.floor(values.length / perPoint);
    if (points < 1) return null;

    const pairs = new Int16Array(points * perPoint);
    // 8-bit data is stored as one byte per extreme; scaling by 256 puts both
    // formats on one scale so nothing downstream asks how wide the source was.
    for (let i = 0; i < pairs.length; i += 1) {
        const value = values[i];
        if (!Number.isFinite(value)) return null;
        pairs[i] = eightBit ? value * 256 : value;
    }

    return { pairs, sampleRate, samplesPerPixel, channels, points };
}

/**
 * Read the bytes as an audiowaveform `.dat`, or answer `null` if they are not
 * one.
 *
 * The self-consistency check is what makes this safe to try first: a version of
 * 1 or 2 is not enough on its own (a JSON document could in principle open with
 * those four bytes), so the declared point count must also match the bytes that
 * actually follow the header. A truncated file is refused here and falls through
 * to the JSON attempt, which refuses it too — a partial waveform drawn as if it
 * were whole would misplace every peak after the truncation.
 */
export function parseWaveformDat(bytes: ArrayBuffer): Peaks | null {
    if (bytes.byteLength < HEADER_V1_BYTES) return null;

    const view = new DataView(bytes);
    const version = view.getInt32(0, true);
    if (version !== 1 && version !== 2) return null;

    const flags = view.getUint32(4, true);
    const eightBit = (flags & 1) === 1;
    const sampleRate = view.getInt32(8, true);
    const samplesPerPixel = view.getInt32(12, true);
    const length = view.getUint32(16, true);
    if (!isUsableCount(sampleRate) || !isUsableCount(samplesPerPixel))
        return null;
    if (!isUsableCount(length)) return null;

    const headerBytes = version === 1 ? HEADER_V1_BYTES : HEADER_V2_BYTES;
    const channels = version === 1 ? 1 : view.getInt32(20, true);
    if (!isUsableCount(channels)) return null;

    const values = length * channels * 2;
    const expected = headerBytes + values * (eightBit ? 1 : 2);
    if (bytes.byteLength !== expected) return null;

    const data = eightBit
        ? new Int8Array(bytes, headerBytes, values)
        : new Int16Array(bytes.slice(headerBytes, expected));

    return build(data, eightBit, sampleRate, samplesPerPixel, channels);
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : fallback;
}

/**
 * Read the bytes as an audiowaveform `waveform.json`, or answer `null` if they
 * are not one.
 */
export function parseWaveformJson(bytes: ArrayBuffer): Peaks | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.data)) return null;

    const sampleRate = numberOr(record.sample_rate, 0);
    const samplesPerPixel = numberOr(record.samples_per_pixel, 0);
    if (!isUsableCount(sampleRate) || !isUsableCount(samplesPerPixel))
        return null;

    const channels = numberOr(record.channels, 1);
    if (!isUsableCount(channels)) return null;

    return build(
        record.data as number[],
        numberOr(record.bits, 16) === 8,
        sampleRate,
        samplesPerPixel,
        channels,
    );
}

/**
 * Parse waveform bytes of either format — the sniffing order documented above.
 * `null` means "these bytes are not waveform data", which the caller turns into
 * one developer warning and a lane with no waveform in it.
 */
export function parsePeaks(bytes: ArrayBuffer): Peaks | null {
    return parseWaveformDat(bytes) ?? parseWaveformJson(bytes);
}
