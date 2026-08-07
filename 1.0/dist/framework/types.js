/**
 * The shared, framework-neutral types every framework wrapper is built from
 * (CONTEXT.md **Framework wrapper**, **Viewer state**; ADR 0007).
 *
 * Nothing here imports React, Vue, or a Svelte runtime. `triiiceratops/react`
 * and `triiiceratops/vue` re-export these so a consumer never needs a deep
 * import, and the two wrappers agree on one vocabulary by construction.
 */
/**
 * The custom element's translated event channels, in the order the wrappers
 * document them. Wrappers install one DOM listener per channel and hand the
 * consumer {@link ViewerEventDetail} — never a `CustomEvent`.
 */
export const VIEWER_EVENT_CHANNELS = [
    'statechange',
    'canvaschange',
    'manifestchange',
    'choicechange',
    'pluginerror',
    'viewererror',
];
