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
