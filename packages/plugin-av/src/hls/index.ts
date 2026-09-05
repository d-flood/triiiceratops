/**
 * The hls.js chunk's entry point.
 *
 * hls.js is reachable only from here, and this module is only ever reached
 * through the `await import()` in `../hlsLink.ts`. A page whose manifests carry
 * no HLS body — or one whose browser decodes HLS natively — never fetches these
 * bytes (SPEC — "Delivery and packaging").
 */

import Hls from 'hls.js';

/** A live hls.js player bound to one media element. */
export interface HlsAttachment {
    /** Tear the player down and release the buffers it is holding. */
    destroy(): void;
}

/**
 * Attach `url` to `media` through hls.js, or answer `null` when this browser
 * cannot run hls.js at all.
 *
 * `null` means no Media Source Extensions — the caller has already established
 * that native HLS is absent too, so the honest answer for that canvas is the
 * "can't play" treatment rather than a player that will never produce a frame.
 *
 * `onUnplayable` reports a FATAL stream error, which is the streaming
 * equivalent of the media element's own `error` event: hls.js swallows those
 * (the element never errors, because nothing was ever assigned to its `src`),
 * so without this the stage would sit blank and silent forever. Non-fatal
 * errors are hls.js's own business — it recovers from them by design, and a
 * viewer that gave up on the first dropped segment would be worse than one that
 * buffered.
 */
export function attachHlsStream(
    media: HTMLMediaElement,
    url: string,
    onUnplayable: () => void,
): HlsAttachment | null {
    if (!Hls.isSupported()) return null;

    const hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // Destroyed here rather than left to stage teardown: the stage is now
        // showing "can't play", and a live player would go on retrying against
        // a dead stream — network requests and buffers for a frame no one will
        // ever see. `destroy()` is idempotent, so the teardown below is safe.
        hls.destroy();
        onUnplayable();
    });
    hls.attachMedia(media as HTMLVideoElement);
    hls.loadSource(url);

    return {
        destroy(): void {
            hls.destroy();
        },
    };
}
