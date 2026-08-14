/**
 * The peaks model and its two parsers, against the REAL `audiowaveform` output
 * committed with the AV fixtures — one run of the tool over `tone.mp3` produced
 * both files, so the two parsers must agree about them point for point.
 *
 * The tool is never invoked here: the assets are the fixture.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    parsePeaks,
    parseWaveformDat,
    parseWaveformJson,
    peaksDuration,
    type Peaks,
} from './peaks';

const MEDIA = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../core/tests/media',
);

function fixture(name: string): ArrayBuffer {
    const file = readFileSync(resolve(MEDIA, name));
    return file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
}

const DAT = fixture('tone.dat');
const JSON_BYTES = fixture('tone.json');

function encode(text: string): ArrayBuffer {
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** A synthetic `.dat` of `version`, mono, with the given 16-bit pairs. */
function makeDat(version: number, pairs: number[], flags = 0): ArrayBuffer {
    const header = version === 1 ? 20 : 24;
    const buffer = new ArrayBuffer(header + pairs.length * 2);
    const view = new DataView(buffer);
    view.setInt32(0, version, true);
    view.setUint32(4, flags, true);
    view.setInt32(8, 44_100, true);
    view.setInt32(12, 256, true);
    view.setUint32(16, pairs.length / 2, true);
    if (version === 2) view.setInt32(20, 1, true);
    pairs.forEach((value, index) =>
        view.setInt16(header + index * 2, value, true),
    );
    return buffer;
}

describe('peaks model', () => {
    describe('the binary .dat parser', () => {
        it('reads the committed audiowaveform version 1 output', () => {
            const peaks = parseWaveformDat(DAT) as Peaks;
            expect(peaks).not.toBeNull();
            expect(peaks.sampleRate).toBe(44_100);
            expect(peaks.samplesPerPixel).toBe(256);
            expect(peaks.channels).toBe(1);
            expect(peaks.points).toBe(347);
            expect(peaks.pairs.length).toBe(694);
            expect([peaks.pairs[0], peaks.pairs[1]]).toEqual([-4003, 4071]);
        });

        it('reads a version 2 header, which carries a channel count', () => {
            const peaks = parseWaveformDat(
                makeDat(2, [-100, 100, -200, 200]),
            ) as Peaks;
            expect(peaks.points).toBe(2);
            expect([...peaks.pairs]).toEqual([-100, 100, -200, 200]);
        });

        it('scales 8-bit data onto the 16-bit range', () => {
            const buffer = new ArrayBuffer(20 + 2);
            const view = new DataView(buffer);
            view.setInt32(0, 1, true);
            view.setUint32(4, 1, true);
            view.setInt32(8, 44_100, true);
            view.setInt32(12, 256, true);
            view.setUint32(16, 1, true);
            view.setInt8(20, -8);
            view.setInt8(21, 8);
            const peaks = parseWaveformDat(buffer) as Peaks;
            expect([...peaks.pairs]).toEqual([-2048, 2048]);
        });

        it('refuses a header whose declared length does not match the bytes', () => {
            const truncated = DAT.slice(0, DAT.byteLength - 4);
            expect(parseWaveformDat(truncated)).toBeNull();
        });

        it('refuses a header followed by more bytes than it declares', () => {
            // The length check is exact in both directions, not a minimum: a
            // file with trailing bytes is not the file its header describes,
            // and reading the prefix as if it were whole hides whatever the
            // rest of it was.
            const whole = makeDat(1, [-100, 100]);
            const padded = new Uint8Array(whole.byteLength + 4);
            padded.set(new Uint8Array(whole));
            expect(parseWaveformDat(padded.buffer as ArrayBuffer)).toBeNull();
        });

        it('refuses a version it does not know', () => {
            expect(parseWaveformDat(makeDat(3, [-1, 1]))).toBeNull();
        });

        it('refuses JSON', () => {
            expect(parseWaveformDat(JSON_BYTES)).toBeNull();
        });
    });

    describe('the JSON parser', () => {
        it('reads the committed audiowaveform version 2 output', () => {
            const peaks = parseWaveformJson(JSON_BYTES) as Peaks;
            expect(peaks.sampleRate).toBe(44_100);
            expect(peaks.samplesPerPixel).toBe(256);
            expect(peaks.channels).toBe(1);
            expect(peaks.points).toBe(347);
        });

        it('refuses a document with no data array', () => {
            expect(
                parseWaveformJson(encode('{"version":2,"channels":1}')),
            ).toBeNull();
        });
    });

    describe('both formats describe the same clip', () => {
        it('produces equivalent peaks models from one audiowaveform run', () => {
            const fromDat = parseWaveformDat(DAT) as Peaks;
            const fromJson = parseWaveformJson(JSON_BYTES) as Peaks;

            expect(fromJson.sampleRate).toBe(fromDat.sampleRate);
            expect(fromJson.samplesPerPixel).toBe(fromDat.samplesPerPixel);
            expect(fromJson.channels).toBe(fromDat.channels);
            expect(fromJson.points).toBe(fromDat.points);
            expect([...fromJson.pairs]).toEqual([...fromDat.pairs]);
            // The clip is two seconds; the two files must say so identically.
            expect(peaksDuration(fromJson)).toBeCloseTo(
                peaksDuration(fromDat),
                6,
            );
            expect(peaksDuration(fromDat)).toBeCloseTo(2.014, 2);
        });
    });

    describe('content sniffing order', () => {
        it('parses a .dat as binary however its server declared it', () => {
            // The observed misconfiguration: audiowaveform binary served as
            // `application/json`. Nothing here is ever told the format, which is
            // the point — the bytes decide, binary first.
            const peaks = parsePeaks(DAT) as Peaks;
            expect(peaks.points).toBe(347);
            expect([peaks.pairs[0], peaks.pairs[1]]).toEqual([-4003, 4071]);
        });

        it('falls through to JSON when the bytes are not a binary header', () => {
            const peaks = parsePeaks(JSON_BYTES) as Peaks;
            expect(peaks.points).toBe(347);
        });

        it('degrades to no peaks on bytes of neither format', () => {
            expect(parsePeaks(encode('not waveform data at all'))).toBeNull();
            expect(parsePeaks(new ArrayBuffer(0))).toBeNull();
            expect(parsePeaks(encode('{"data":"not an array"}'))).toBeNull();
        });
    });
});
