/**
 * The untimed-transcript LINKAGE contract: which `rendering` entry on a canvas
 * is a transcript this plugin will render as words.
 *
 * Anchored on the real cookbook recipe rather than on invented shapes — 0017 is
 * the manifest the rule exists for, and the one that proved the feature was
 * missing.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { textTranscriptFor } from './renderingTranscript';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function manifest(path: string): { items: unknown[] } {
    return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')) as {
        items: unknown[];
    };
}

const COOKBOOK_0017 = manifest(
    'packages/core/src/lib/test/fixtures/manifests/av/0017-transcription-av.json',
);
const AVALON = manifest(
    'packages/core/src/lib/test/fixtures/manifests/av/avalon-9g54xh933-skip-transcoding-mp3.json',
);

describe('untimed transcript linkage', () => {
    it('adopts cookbook 0017: a text/plain rendering on the canvas', () => {
        expect(textTranscriptFor(COOKBOOK_0017.items[0])).toEqual({
            url: 'https://fixtures.iiif.io/video/indiana/volleyball/volleyball.txt',
            label: 'Transcript',
        });
    });

    it('adopts a canvas whose rendering is a bare object rather than an array', () => {
        expect(
            textTranscriptFor({
                rendering: { id: '/t.txt', format: 'text/plain' },
            }),
        ).toEqual({ url: '/t.txt', label: '' });
    });

    it('ignores the format parameters and the case a publisher wrote', () => {
        expect(
            textTranscriptFor({
                rendering: [
                    { id: '/t.txt', format: 'Text/Plain; charset=utf-8' },
                ],
            })?.url,
        ).toBe('/t.txt');
    });

    it('names the transcript from any language tag the entry used', () => {
        expect(
            textTranscriptFor({
                rendering: [
                    {
                        id: '/t.txt',
                        format: 'text/plain',
                        label: { de: ['Transkript'] },
                    },
                ],
            })?.label,
        ).toBe('Transkript');
    });

    it('takes the first text/plain entry and ignores later ones', () => {
        expect(
            textTranscriptFor({
                rendering: [
                    { id: '/first.txt', format: 'text/plain' },
                    { id: '/second.txt', format: 'text/plain' },
                ],
            })?.url,
        ).toBe('/first.txt');
    });

    it('skips formats it cannot render as words, whatever they are labelled', () => {
        expect(
            textTranscriptFor({
                rendering: [
                    {
                        id: '/t.pdf',
                        format: 'application/pdf',
                        label: { en: ['Transcript'] },
                    },
                    {
                        id: '/t.html',
                        format: 'text/html',
                        label: { en: ['Transcript'] },
                    },
                ],
            }),
        ).toBeNull();
    });

    it('does not read seeAlso: a machine-readable description is not a transcript', () => {
        expect(
            textTranscriptFor({
                seeAlso: [{ id: '/meta.txt', format: 'text/plain' }],
            }),
        ).toBeNull();
    });

    it('returns null for a canvas that links nothing, and for a non-canvas', () => {
        expect(textTranscriptFor(AVALON.items[0])).toBeNull();
        expect(textTranscriptFor({})).toBeNull();
        expect(textTranscriptFor(null)).toBeNull();
        expect(textTranscriptFor('canvas')).toBeNull();
    });

    it('skips an entry with no usable id', () => {
        expect(
            textTranscriptFor({
                rendering: [
                    { format: 'text/plain' },
                    { id: '', format: 'text/plain' },
                    { id: { '@id': '/x.txt' }, format: 'text/plain' },
                ],
            }),
        ).toBeNull();
    });
});
