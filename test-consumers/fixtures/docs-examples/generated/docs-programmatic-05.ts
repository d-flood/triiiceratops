// GENERATED from apps/site/content/docs/programmatic.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { ViewerState } from 'triiiceratops';

declare const state: ViewerState;
declare const counter: HTMLElement;

const stop = state.subscribe(() => {
    counter.textContent = `${state.currentCanvasIndex + 1} / ${state.canvases.length}`;
});

// Later, when your control goes away:
stop();
