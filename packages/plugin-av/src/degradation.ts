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
import { PLUGIN_META } from './identity';
import type { AvCanvasScan } from './sources';

/**
 * Where every line below sends the curator. One pointer for the whole contract,
 * so the prose here can stay a single cause line.
 */
const SEE_DOCS = `. See ${PLUGIN_META.docs}`;

/**
 * The canvases already announced, one set per reason, so a canvas degraded two
 * ways is announced twice rather than once.
 *
 * Keyed by the canvas JSON object, as core's own once-per-canvas warning is: the
 * entry goes when the manifest does, so these cannot grow without bound.
 */
const warnedSpatial = new WeakSet<object>();
const warnedCanvasRepeat = new WeakSet<object>();

function warnOnce(
    seen: WeakSet<object>,
    canvas: unknown,
    message: string,
): void {
    if (!canvas || typeof canvas !== 'object') return;
    if (seen.has(canvas)) return;
    seen.add(canvas);

    // triiiceratops-console-allow: the curator-facing degradation warning of
    // user story 45. There is no structured channel for it — it is not a viewer
    // error, and a `pluginerror` would make an honest degraded render look like
    // a failure. Recorded in lint-allowlist.md.
    console.warn(`[triiiceratops] ${message}${SEE_DOCS}`);
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
            warnedSpatial,
            canvas,
            `Canvas ${scan.canvasId} targets time-based media at \`xywh=\`; ` +
                `spatial placement is unsupported, so the media fills the whole rect`,
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
        warnedCanvasRepeat,
        canvas,
        `Canvas ${(canvas as { id?: string }).id} carries \`repeat\`, which IIIF ` +
            `Presentation 3 defines on Collections and Manifests only and not as a ` +
            `per-canvas loop; it is ignored. On a Manifest, \`repeat\` with ` +
            `\`auto-advance\` returns to the first canvas after the last`,
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
        `[triiiceratops] Waveform data at ${url} is neither audiowaveform ` +
            `binary (.dat) nor JSON; no waveform is drawn, and the timeline ` +
            `still seeks${SEE_DOCS}`,
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
        `[triiiceratops] The caption track at ${url} would not load, so it is ` +
            `not offered; text tracks are always fetched with CORS, so serve the ` +
            `VTT with \`Access-Control-Allow-Origin\` or from the viewer's own ` +
            `origin${SEE_DOCS}`,
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
        `[triiiceratops] The hls.js chunk would not load, so HLS canvases ` +
            `cannot play; serve dist/iife.js beside the chunks it fetches` +
            SEE_DOCS,
        cause,
    );
}
