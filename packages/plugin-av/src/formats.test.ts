/**
 * Choice selection: which rendition of a canvas this browser is given.
 *
 * The rule is order plus playability and nothing else — no bitrate ranking, no
 * resolution heuristic — so every test here is about which alternative a
 * `canPlayType` answer picks out, and about the one case that overrides it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlayabilityProbe, selectSource } from './formats';
import { scanCanvasForAv, type AvSource } from './sources';

const AV_DIR = join(
    import.meta.dirname,
    '../../core/src/lib/test/fixtures/manifests/av',
);

function recipeCanvases(name: string): unknown[] {
    const manifest = JSON.parse(
        readFileSync(join(AV_DIR, name), 'utf8'),
    ) as Record<string, unknown>;
    return (manifest.items as unknown[]) ?? [];
}

function source(url: string, format: string | null): AvSource {
    return { url, format, kind: 'video' };
}

const MOV = source('master.mov', 'video/quicktime');
const MP4 = source('web.mp4', 'video/mp4');
const WEBM = source('web.webm', 'video/webm');

describe('selectSource — which choice alternative is attached', () => {
    it('takes the first alternative the browser can play, not the first', () => {
        expect(
            selectSource([MOV, MP4, WEBM], undefined, (s) => s !== MOV),
        ).toBe(MP4);
    });

    it('takes the first when the browser can play it', () => {
        expect(selectSource([MOV, MP4], undefined, () => true)).toBe(MOV);
    });

    it('lets an explicit selection win over a more playable alternative', () => {
        // The host asked for the master. It may well surface the "can't play"
        // treatment, which is the honest report of what was asked for.
        expect(selectSource([MOV, MP4], MOV.url, (s) => s !== MOV)).toBe(MOV);
    });

    it('ignores a selection naming an alternative that is not there', () => {
        expect(selectSource([MOV, MP4], 'gone.mp4', (s) => s !== MOV)).toBe(
            MP4,
        );
    });

    it('falls back to the first when nothing is playable', () => {
        // Attaching it is what produces the "can't play" treatment: the media
        // element's own `error` is the stage's existing path to it.
        expect(selectSource([MOV, MP4], undefined, () => false)).toBe(MOV);
    });

    it('answers null for an annotation that places nothing', () => {
        expect(selectSource([], undefined, () => true)).toBeNull();
    });

    /**
     * The vendored Choice recipe, which is exactly the shape the rule exists
     * for: its first alternative is Apple Lossless, which no browser outside
     * Safari decodes, and an MP3 of the same recording sits second.
     */
    it('skips the ALAC master of the vendored AV Choice recipe', () => {
        const [canvas] = recipeCanvases('0434-choice-av.json');
        const alternatives =
            scanCanvasForAv(canvas)!.placements[0].alternatives;

        const chosen = selectSource(
            alternatives,
            undefined,
            (candidate) => candidate.format === 'audio/mpeg',
        );

        expect(chosen?.url).toMatch(/\.mp3$/);
    });
});

describe('createPlayabilityProbe — whether a choice alternative can play', () => {
    const canPlayType = HTMLMediaElement.prototype.canPlayType;
    afterEach(() => {
        HTMLMediaElement.prototype.canPlayType = canPlayType;
        vi.unstubAllGlobals();
    });

    /** Answer `answer` for anything matching `pattern`, and `''` otherwise. */
    function stubCanPlayType(pattern: RegExp, answer: CanPlayTypeResult): void {
        HTMLMediaElement.prototype.canPlayType = (type: string) =>
            pattern.test(type) ? answer : '';
    }

    it('accepts a format the element answers anything but empty for', () => {
        stubCanPlayType(/mp4/, 'maybe');
        const canPlay = createPlayabilityProbe();

        expect(canPlay(MP4)).toBe(true);
        expect(canPlay(WEBM)).toBe(false);
    });

    it('accepts an alternative that declares no format', () => {
        stubCanPlayType(/never/, 'probably');
        const canPlay = createPlayabilityProbe();

        // Nothing to ask the browser about, and IIIF permits an alternative
        // stating only its `type`.
        expect(canPlay(source('clip.mp4', null))).toBe(true);
    });

    it('accepts HLS where the platform decodes it natively', () => {
        stubCanPlayType(/mpegurl/, 'maybe');
        vi.stubGlobal('MediaSource', undefined);
        const canPlay = createPlayabilityProbe();

        expect(canPlay(source('stream.m3u8', HLS_TYPE))).toBe(true);
    });

    it('accepts HLS where Media Source Extensions can run hls.js', () => {
        stubCanPlayType(/never/, 'probably');
        vi.stubGlobal('MediaSource', { isTypeSupported: () => true });
        const canPlay = createPlayabilityProbe();

        expect(canPlay(source('stream.m3u8', HLS_TYPE))).toBe(true);
    });

    it('refuses HLS with neither native support nor Media Source', () => {
        stubCanPlayType(/never/, 'probably');
        vi.stubGlobal('MediaSource', undefined);
        const canPlay = createPlayabilityProbe();

        expect(canPlay(source('stream.m3u8', HLS_TYPE))).toBe(false);
    });

    it('recognises an HLS alternative by its extension alone', () => {
        stubCanPlayType(/never/, 'probably');
        vi.stubGlobal('MediaSource', { isTypeSupported: () => false });
        const canPlay = createPlayabilityProbe();

        // No `format` to test, so the extension is what routes it to the HLS
        // gate rather than to the "nothing declared" rung.
        expect(canPlay(source('stream.m3u8', null))).toBe(false);
    });
});

const HLS_TYPE = 'application/vnd.apple.mpegurl';
