// GENERATED from docs/integration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

function bind(state: NonNullable<TriiiceratopsViewerElement['viewerState']>) {
    // Read on demand…
    console.log(state.canvasId);
    // …command it…
    state.nextCanvas();
    // …or subscribe. Notifications are batched and carry no payload: they mean
    // "state changed — read what you need".
    return state.subscribe(() => console.log('now at', state.canvasId));
}

// Listen THEN check: this catches state that becomes available before, during,
// or after this code runs, with no race and no polling.
el.addEventListener('viewerstateavailable', (event) => {
    bind((event as CustomEvent).detail);
});
if (el.viewerState) bind(el.viewerState);
