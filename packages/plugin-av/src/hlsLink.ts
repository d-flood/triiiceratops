/**
 * Deciding how an HLS body is played, and loading the code that can play it.
 *
 * This module is eager and deliberately tiny, for the same reason
 * `waveformLink.ts` is: it is the half that has to run on every claimed canvas
 * in order to decide whether the hls.js chunk is worth fetching at all. Nothing
 * here touches hls.js — the moment it did, roughly 225 KB gzip of media-source
 * machinery would land in the entry that a manifest of progressive MP4s never
 * needs.
 *
 * ## The gate
 *
 * Native HLS wins wherever it exists. Safari and every iOS browser decode a
 * playlist straight off `src`, using the platform's own pipeline — hardware
 * decoding, AirPlay, Picture-in-Picture — so loading a JavaScript player over
 * the top of it would be slower, heavier and worse. `canPlayType` is asked of a
 * REAL element rather than a cached probe: the answer is the element's, and an
 * `<audio>` and a `<video>` need not agree.
 *
 * hls.js is the fallback, not the default. Where neither can play the stream
 * (no Media Source Extensions, so `Hls.isSupported()` is false) the canvas gets
 * the same "can't play" treatment a dead URL gets — one stage, never the
 * session.
 */

import { warnAboutUnloadableHlsChunk } from './degradation';
import type { AvSource } from './sources';

/**
 * The media types that mean "this URL is an HLS playlist".
 *
 * All five are in the wild for the same `.m3u8`: `application/vnd.apple.mpegurl`
 * is the registered one, `application/x-mpegurl` predates registration and is
 * what most servers still send, and the `audio/` spellings come from the era
 * when the format only carried audio. Compared case-insensitively, and with any
 * `; charset=` parameter cut off, because a `format` is copied out of a
 * `Content-Type` as often as it is authored.
 */
const HLS_MEDIA_TYPES = new Set([
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'application/mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl',
]);

/** The Apple type, which is also what `canPlayType` is asked about. */
export const HLS_CANONICAL_TYPE = 'application/vnd.apple.mpegurl';

/**
 * Whether this source is an HLS playlist.
 *
 * The declared `format` decides when there is one; the extension is the
 * fallback, because a `Choice` alternative may state only its IIIF `type`. The
 * extension is read off the path alone — a query string or fragment after it is
 * not part of the file name.
 */
export function isHlsSource(source: AvSource): boolean {
    const format = source.format?.split(';', 1)[0].trim().toLowerCase();
    if (format) return HLS_MEDIA_TYPES.has(format);
    return /\.m3u8$/i.test(source.url.split(/[?#]/, 1)[0]);
}

/**
 * Whether this element decodes HLS itself.
 *
 * `canPlayType` answers `''`, `'maybe'` or `'probably'`; anything but `''` is
 * the platform saying it will try, which is exactly the condition under which
 * assigning `src` is the right thing to do.
 */
export function hasNativeHlsSupport(media: HTMLMediaElement): boolean {
    return media.canPlayType(HLS_CANONICAL_TYPE) !== '';
}

/**
 * fMP4 is the container hls.js remuxes every segment into, so Media Source
 * support for one of these codec strings is what decides whether it can play
 * anything at all. Any ONE suffices, and the audio-only entries matter: an
 * audio HLS rendition plays on a browser with no AVC decoder, and testing video
 * alone would drop it from selection.
 *
 * Spelled exactly as `hls.js@1.7.0`'s `isSupported()` builds them
 * (`utils/codecs.ts` `mimeTypeForCodec`: `${type}/mp4;codecs=${codec}`, no
 * space and no quotes), because `isTypeSupported` parses the string. That check
 * is restated here rather than asked of hls.js, which would mean fetching the
 * chunk — the very thing this decision exists to avoid.
 */
const HLS_MSE_TYPES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=av01.0.01M.08',
    'video/mp4;codecs=vp09.00.50.08',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4;codecs=fLaC',
];

/**
 * Whether this browser plays an HLS playlist by either route — natively, or
 * through the chunk.
 *
 * The question format selection asks, and it has to be answerable
 * synchronously: a Choice is resolved while the stage is being built, and
 * awaiting a 220 KB chunk to find out whether an alternative is worth
 * considering would delay every canvas that never needed it.
 */
export function canPlayHls(media: HTMLMediaElement): boolean {
    if (hasNativeHlsSupport(media)) return true;
    // The same resolution order hls.js uses: a managed source is preferred, and
    // the WebKit-prefixed global is still the only one some iOS builds expose.
    const scope = globalThis as unknown as Record<string, typeof MediaSource>;
    const mediaSource =
        scope.ManagedMediaSource ??
        scope.MediaSource ??
        scope.WebKitMediaSource;
    if (typeof mediaSource?.isTypeSupported !== 'function') return false;
    return HLS_MSE_TYPES.some((type) => mediaSource.isTypeSupported(type));
}

/** The hls.js chunk's public shape, as the eager side uses it. */
export type HlsModule = typeof import('./hls/index');

/**
 * Load the hls.js chunk, or answer `null`.
 *
 * The `await import()` is the whole point of the module. It must stay dynamic —
 * a static import anywhere in the eager graph silently undoes it, which is what
 * `lazy-chunks.guard.test.ts` inspects the built artifacts for.
 *
 * A chunk that will not load — offline, a CSP that blocks it, a dist directory
 * hosted without its chunks — resolves `null`, and the caller gives that stage
 * the "can't play" treatment. It is never an activation failure and never
 * reaches the plugin error channel (user story 27). The console warning is the
 * only trace it leaves: the commonest cause is a consumer who copied `iife.js`
 * out of its directory and left the chunks behind, and without a diagnostic
 * that publishing mistake is indistinguishable from a stream that cannot play.
 */
export async function loadHls(): Promise<HlsModule | null> {
    try {
        return await import('./hls/index');
    } catch (error) {
        warnAboutUnloadableHlsChunk(error);
        return null;
    }
}
