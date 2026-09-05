/**
 * The plugin's global CSS, installed once at activation through the SDK style
 * service (`context.styles.install`) so it is root-aware: it reaches the document
 * head for a light-DOM viewer and the shadow root for the Web Component (SPEC.md
 * — "Global plugin CSS is installed through a root-aware style service"), so the
 * Annotorious annotation layer renders in the shadow root too.
 *
 * The real Annotorious stylesheet is imported `?inline` as the SINGLE SOURCE OF
 * TRUTH (F23): the bundler tracks it against the installed `@annotorious/*`
 * version, so it can't silently drift like a vendored copy.
 */
import { definePluginStyles } from '@triiiceratops/plugin-sdk';

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
 * The combined stylesheet (base Annotorious sheet + layer fixes) installed under
 * the `annotorious` id at activation, shaped by {@link definePluginStyles} into
 * the `STYLES` / `STYLE_ID` exports.
 *
 * No plugin chrome CSS lives here: core owns the toolbar button and the
 * docked-panel / anchored-flyout surface, so the plugin ships only the
 * Annotorious annotation-layer styles. The panel's own presentation is scoped
 * component CSS rendered inside `view.mount`.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `${annotoriousCss}\n${ANNOTORIOUS_FIXES}`,
    'annotorious',
);
