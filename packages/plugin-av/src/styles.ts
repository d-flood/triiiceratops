import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned global CSS + its style-service install id.
 *
 * These rules style the **stage**: DOM the plugin builds imperatively inside its
 * overlay layer, which is therefore not Svelte-scoped and is namespaced
 * `tri-av-*` instead. Geometry (`left`/`top`/`width`/`height`) is written per
 * frame by the stage itself and deliberately absent here.
 *
 * The layer is transparent to pointer events; the two lanes opt back in, so a
 * tap can toggle playback or seek. A drag over a lane still pans, because the
 * lane hands the gesture down to the renderer's surface and acts only on a
 * pointer that barely moved (see `onLaneTap`). No descendant of a lane may
 * declare `pointer-events` of its own: the hand-down works by making the lane
 * transparent for one hit test, which an `auto` further down would defeat.
 *
 * Both `[hidden]` rules restate what the UA sheet already says, and neither is
 * redundant. Per the HTML spec's suggested rendering `[hidden] { display: none }`
 * is an ordinary rule, which the `display` declaration above it would outrank —
 * leaving a hidden stage laid out, or a failed stream's black box on screen
 * beside its "can't play" notice. Every current engine ships it `!important`, so
 * the hazard is theoretical there and real in one that follows the spec as
 * written.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
.tri-av-stage {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #000;
}
.tri-av-stage[hidden] {
    display: none;
}

/*
    The stage layout's lanes: a vertical division of the stage in canvas space,
    so the stack pans and zooms with the canvas. Geometry is written per frame
    by the stage, as it is for the stage box itself.
*/
.tri-av-lane-visual,
.tri-av-lane-timeline {
    position: absolute;
    overflow: hidden;
    pointer-events: auto;
    cursor: pointer;
}
.tri-av-lane-visual[hidden],
.tri-av-lane-timeline[hidden] {
    display: none;
}

/*
    The timeline lane: a styled region, the tap target for seeking, and the box
    the waveform's drawing surface hangs inside.
*/
.tri-av-lane-timeline {
    background: var(--tri-panel-bg, #1c1c1c);
    border-top: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
}

/*
    The waveform. Decorative pixels over a lane that already carries the seek
    (ADR 0016), and clipped to the visible area rather than sized to the whole
    projected lane — see waveform/surface.ts. Its geometry is written per frame.

    Deliberately no pointer-events declaration: the lane hands a drag down to
    the renderer by going transparent for one hit test, and an "auto" here would
    defeat it.
*/
.tri-av-waveform {
    position: absolute;
    display: block;
}
.tri-av-waveform[hidden] {
    display: none;
}

.tri-av-accompanying,
.tri-av-placeholder {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

/* Over everything in the stage until the first play removes it. */
.tri-av-placeholder {
    position: absolute;
    inset: 0;
    background: var(--tri-viewer-bg, #000);
}

.tri-av-media {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #000;
}
.tri-av-media[hidden] {
    display: none;
}

/*
    The play-state glyph: what a canvas projected too narrow for the transport
    shows instead (user story 26). Decorative and inert — it announces nothing
    and takes no pointer, because everything it depicts stays reachable through
    the visual lane's own tap-to-toggle and through AVState.
*/
.tri-av-glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(1rem, 40%, 3rem);
    color: #fff;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
    pointer-events: none;
}
.tri-av-glyph[hidden] {
    display: none;
}

.tri-av-unplayable {
    padding: 0.75rem 1rem;
    max-width: 100%;
    text-align: center;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--tri-color-error, #dc2626);
    background: var(--tri-surface-bg, #fff);
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.12));
    border-radius: var(--tri-radius-panels, 0.5rem);
}
`,
    'stage',
);
