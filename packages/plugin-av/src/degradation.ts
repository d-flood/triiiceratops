/**
 * The **degradation contract**: manifest shapes this release renders less than
 * fully, each announced once to the developer console and never to the reader.
 *
 * These are curator-facing diagnostics in core's unreadable-canvas style (user
 * story 45): the manifest is valid, the viewer keeps working, and what it did
 * not honour is stated plainly. They are deliberately NOT viewer errors — a
 * degraded render must stay degraded rather than become a surfaced failure — and
 * deliberately not debug-gated, because the curator who needs to read them has
 * no reason to have turned debug on.
 */

import { readBehaviors } from './behaviors';
import type { AvCanvasScan } from './sources';

/**
 * What each canvas has already been warned about, so a re-scan (a manifest
 * reload, a sequence change) does not repeat itself. Keyed by the canvas JSON
 * object, as core's own once-per-canvas warning is: the entry goes when the
 * manifest does, so this cannot grow without bound.
 *
 * Keyed by REASON as well as canvas, because the two degradations here are
 * independent: a canvas can be both spatially targeted and temporally composed,
 * and a curator told only about the first would never learn the composition was
 * dropped too.
 */
const warned = new WeakMap<object, Set<string>>();

function warnOnce(canvas: unknown, reason: string, message: string): void {
    if (!canvas || typeof canvas !== 'object') return;

    let reasons = warned.get(canvas);
    if (!reasons) {
        reasons = new Set<string>();
        warned.set(canvas, reasons);
    }
    if (reasons.has(reason)) return;
    reasons.add(reason);

    // triiiceratops-console-allow: the curator-facing degradation warning of
    // user story 45. There is no structured channel for it — it is not a viewer
    // error, and a `pluginerror` would make an honest degraded render look like
    // a failure. Recorded in lint-allowlist.md.
    console.warn(`[triiiceratops] ${message}`);
}

/**
 * Announce whatever this canvas's scan says was not honoured. Called once per
 * canvas per manifest, from the activation's scan, for EVERY canvas that paints
 * time-based media — including the ones core paints an image for and this plugin
 * therefore never claims (`0489-multimedia-canvas`), which is precisely the case
 * a curator most needs told about.
 */
export function warnAboutDegradation(
    canvas: unknown,
    scan: AvCanvasScan,
): void {
    if (scan.spatiallyTargeted) {
        warnOnce(
            canvas,
            'spatial',
            `Canvas ${scan.canvasId} places time-based media into part of its rect ` +
                `(an \`xywh=\` target). Spatial placement of audiovisual content is not ` +
                `supported: the placement is ignored, and where this viewer plays the ` +
                `media it fills the whole canvas rect.`,
        );
    }

    // Not an `else`: a canvas can be both, and each degradation is separately
    // worth knowing about.
    if (scan.temporallyComposed) {
        warnOnce(
            canvas,
            'composed',
            `Canvas ${scan.canvasId} is painted by ${scan.placements.length} time-based ` +
                `bodies sharing its duration. This release plays the first of them ` +
                `(${scan.placements[0]?.source.url}) and ignores the rest; playing a ` +
                `composed canvas through as one work is not implemented yet.`,
        );
    }
}

/**
 * `repeat` on a Canvas, which IIIF Presentation 3 does not allow: the term is
 * valid on Collections and Manifests only, and there it means "return to the
 * first canvas after the last", not "loop this one recording".
 */
export function warnAboutCanvasRepeat(canvas: unknown): void {
    if (!readBehaviors(canvas).includes('repeat')) return;

    warnOnce(
        canvas,
        'canvas-repeat',
        `Canvas ${(canvas as { id?: string }).id} carries the \`repeat\` behavior, ` +
            `which IIIF Presentation 3 defines on Collections and Manifests only. ` +
            `It is ignored here. \`repeat\` is not a per-canvas loop: on a Manifest, ` +
            `and only alongside \`auto-advance\`, it returns to the first canvas ` +
            `after the last one ends.`,
    );
}

const warnedWaveforms = new Set<string>();

/**
 * Waveform data was linked but could not be read — a dead URL, a CORS refusal,
 * or bytes of neither audiowaveform format.
 *
 * Announced once per URL rather than once per canvas, because the same file is
 * commonly linked from several canvases and one broken publish should not fill
 * the console. The reader sees nothing: the lane renders without a waveform and
 * still seeks (SPEC — "Peaks model": malformed data degrades, it does not fail).
 */
export function warnAboutUnreadableWaveform(url: string): void {
    if (warnedWaveforms.has(url)) return;
    warnedWaveforms.add(url);

    // triiiceratops-console-allow: the same curator-facing degradation channel
    // as the warnings above. Recorded in lint-allowlist.md.
    console.warn(
        `[triiiceratops] Waveform data at ${url} could not be read as ` +
            `audiowaveform binary (.dat) or JSON, so no waveform is drawn. The ` +
            `timeline still seeks.`,
    );
}

const warnedCaptions = new Set<string>();

/**
 * A caption track was attached and the browser would not load it — a dead URL,
 * or (much the commoner cause) a server that serves the VTT cross-origin
 * without `Access-Control-Allow-Origin`, which text tracks always require.
 *
 * Once per URL, for the same reason a waveform is: one caption file is commonly
 * supplemented onto several canvases. The reader is not told, and is not shown
 * a toggle for it either — a control that selects a track with no cues is the
 * silent nothing user story 46 forbids.
 */
export function warnAboutUnloadableCaptionTrack(url: string): void {
    if (warnedCaptions.has(url)) return;
    warnedCaptions.add(url);

    // triiiceratops-console-allow: the same curator-facing degradation channel
    // as the warnings above. Recorded in lint-allowlist.md.
    console.warn(
        `[triiiceratops] The caption track at ${url} could not be loaded, so it ` +
            `is not offered. Text tracks are always fetched with CORS: serve the ` +
            `VTT with an \`Access-Control-Allow-Origin\` header, or from the ` +
            `viewer's own origin.`,
    );
}

let warnedHlsChunk = false;

/**
 * The hls.js chunk could not be loaded, so an HLS canvas that needed it gets
 * the "can't play" treatment.
 *
 * Announced once per page: the cause is a property of the deployment, not of
 * the canvas, and the commonest one is a `dist/iife.js` copied away from the
 * sibling chunks it fetches by name.
 */
export function warnAboutUnloadableHlsChunk(cause: unknown): void {
    if (warnedHlsChunk) return;
    warnedHlsChunk = true;

    // triiiceratops-console-allow: the same curator-facing degradation channel
    // as the warnings above. Recorded in lint-allowlist.md.
    console.warn(
        `[triiiceratops] The hls.js chunk could not be loaded, so HLS canvases ` +
            `cannot play. Serve dist/iife.js from its own directory, beside the ` +
            `chunks it fetches.`,
        cause,
    );
}
