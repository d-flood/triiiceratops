/**
 * The plugin's global CSS, installed once at activation through the SDK style
 * service (`context.styles.install`) so it is root-aware: it reaches the document
 * head for a light-DOM viewer and the shadow root for the Web Component (SPEC.md
 * — "Global plugin CSS is installed through a root-aware style service"). This is
 * where the Annotorious layer CSS now lives (it previously injected from
 * `AnnotationManager`), so the annotation layer renders in the shadow root too.
 *
 * The real Annotorious stylesheet is imported `?inline` as the SINGLE SOURCE OF
 * TRUTH (F23): the bundler tracks it against the installed `@annotorious/*`
 * version, so it can't silently drift like a vendored copy. This import moved
 * here from core with the plugin (the `distributions.test.ts` single-source rule
 * moved with it).
 */
import annotoriousCss from '@annotorious/openseadragon/annotorious-openseadragon.css?inline';

/** Layer fixes + point-marker rendering, appended after the base stylesheet. */
const ANNOTORIOUS_FIXES = `
.a9s-annotationlayer, .a9s-osd-drawinglayer {
    width: 100% !important;
    height: 100% !important;
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
}
.a9s-annotationlayer svg, .a9s-osd-drawinglayer svg {
    pointer-events: auto;
    width: 100%;
    height: 100%;
}
.annotorious-drawing-mode .a9s-annotationlayer svg,
.annotorious-drawing-mode .a9s-osd-drawinglayer svg {
    pointer-events: none !important;
    cursor: crosshair;
}
.a9s-annotationlayer :is(rect, polygon, path, ellipse, line) {
    stroke: #1e90ff;
    stroke-width: 2px;
    fill: transparent;
    vector-effect: non-scaling-stroke;
}
.a9s-annotationlayer circle {
    stroke: #1e90ff;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: visiblePainted;
}
.point-selected .a9s-osd-selectionlayer rect {
    rx: 999px;
    ry: 999px;
}
.point-selected .a9s-handle,
.point-selected .a9s-edge-handle {
    display: none !important;
    pointer-events: none !important;
}
.a9s-osd-selectionlayer circle {
    fill: transparent;
    stroke: #3182ed;
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
}
`;

/**
 * Plugin chrome: the toggle button + the docked panel container.
 *
 * The toggle sits at the BOTTOM-LEFT (clear of core's top toolbar and the
 * image-manipulation flyout's bottom-right) at a z-index above core's toolbar
 * (50) and error rail (55), so it is always clickable. The dock renders BEFORE
 * the toggle in the DOM (see `AnnotationEditorApp.svelte`), so the toggle stacks
 * on top of the open panel as its close affordance.
 */
const CHROME = `
.tri-ae {
    position: absolute;
    inset: 0;
    z-index: 60;
    pointer-events: none;
}
.tri-ae > * {
    pointer-events: auto;
}
.tri-ae-toggle {
    position: absolute;
    bottom: var(--ui-inset, 0.5rem);
    left: var(--ui-inset, 0.5rem);
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-hit, 2.25rem);
    height: var(--ui-hit, 2.25rem);
    padding: 0;
    border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
    border-radius: var(--tri-radius-buttons, 0.5rem);
    background-color: var(--tri-toolbar-bg, rgb(255 255 255 / 0.9));
    color: var(--tri-toolbar-content, currentColor);
    cursor: pointer;
    box-shadow: var(--ui-chrome-shadow, 0 4px 6px -4px rgb(0 0 0 / 0.2));
}
.tri-ae-toggle:hover {
    background-color: color-mix(in oklab, var(--tri-toolbar-bg, #fff) 80%, transparent);
}
.tri-ae-toggle[aria-expanded='true'] {
    background-color: var(--tri-color-primary, #2563eb);
    color: var(--tri-color-primary-content, #fff);
    border-color: transparent;
}
.tri-ae-toggle svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
}
.tri-ae-dock {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    max-height: 100%;
    z-index: 1;
    display: flex;
    padding-top: calc(var(--ui-inset, 0.5rem) + var(--ui-hit, 2.25rem) + 0.5rem);
    box-sizing: border-box;
}
`;

/** The combined stylesheet installed under the `annotorious` id at activation. */
export const STYLES = `${annotoriousCss}\n${ANNOTORIOUS_FIXES}\n${CHROME}`;

/** Stable style-service install id (keyed `<pluginName>:<id>` by the service). */
export const STYLE_ID = 'annotorious';
