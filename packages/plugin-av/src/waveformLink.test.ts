/**
 * The waveform LINKAGE contract: which `seeAlso`/`rendering` entry on a canvas
 * is waveform data.
 *
 * Verified against the three real shapes — the two vendored manifests carry
 * them — rather than against invented ones, because the whole reason the rule
 * cannot consult `format` is that the real publishers disagree about it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { waveformUrlFor } from './waveformLink';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function manifest(path: string): { items: unknown[] } {
    return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')) as {
        items: unknown[];
    };
}

const LOCAL = manifest('packages/core/tests/media/manifests/av-waveform.json');
const AVALON = manifest(
    'packages/core/src/lib/test/fixtures/manifests/av/avalon-9g54xh933-skip-transcoding-mp3.json',
);
const TRANSCRIPT = manifest(
    'packages/core/src/lib/test/fixtures/manifests/av/0017-transcription-av.json',
);

describe('waveform linkage', () => {
    it('adopts the Avalon shape: seeAlso, a JSON Dataset labelled waveform.json', () => {
        expect(waveformUrlFor(LOCAL.items[0])).toBe('/media/tone.json');
        expect(waveformUrlFor(AVALON.items[0])).toBe(
            'https://demo.avalonmediasystem.org/master_files/fj2362289/waveform.json',
        );
    });

    it('adopts the British Library shape: seeAlso carrying the BBC profile', () => {
        expect(waveformUrlFor(LOCAL.items[1])).toBe('/media/tone.dat');
    });

    it('adopts waveform data linked through rendering', () => {
        expect(waveformUrlFor(LOCAL.items[2])).toBe('/media/tone.dat');
    });

    it('does not adopt a rendering that is a transcript', () => {
        expect(waveformUrlFor(TRANSCRIPT.items[0])).toBeNull();
    });

    it('never consults the declared format', () => {
        // A JSON-declared .dat and an octet-stream-declared .json are both real
        // publishing mistakes; both must still be found, and the parser decides
        // what the bytes are.
        expect(
            waveformUrlFor({
                seeAlso: [
                    {
                        id: 'https://example.org/peaks/waveform.dat',
                        format: 'application/json',
                    },
                ],
            }),
        ).toBe('https://example.org/peaks/waveform.dat');
        expect(
            waveformUrlFor({
                seeAlso: [
                    {
                        id: 'https://example.org/transcript.json',
                        format: 'application/json',
                        label: { en: ['Transcript'] },
                    },
                ],
            }),
        ).toBeNull();
    });

    it('prefers seeAlso, then rendering, in manifest order', () => {
        expect(
            waveformUrlFor({
                seeAlso: [
                    { id: 'https://example.org/notes.json' },
                    { id: 'https://example.org/a/waveform.json' },
                ],
                rendering: [{ id: 'https://example.org/b/waveform.dat' }],
            }),
        ).toBe('https://example.org/a/waveform.json');
        expect(
            waveformUrlFor({
                rendering: [{ id: 'https://example.org/b/waveform.dat' }],
            }),
        ).toBe('https://example.org/b/waveform.dat');
    });

    it('answers null for a canvas that links nothing', () => {
        expect(waveformUrlFor({ id: 'canvas' })).toBeNull();
        expect(waveformUrlFor(null)).toBeNull();
    });
});
