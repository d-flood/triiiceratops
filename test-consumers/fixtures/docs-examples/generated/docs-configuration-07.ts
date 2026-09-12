// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;
// Hide the built-in chrome you are replacing.
(el as { config?: unknown }).config = {
    showCanvasNav: false,
    showToggle: false,
};

const previous = document.querySelector('button#previous')!;
const next = document.querySelector('button#next')!;

function bind(state: NonNullable<TriiiceratopsViewerElement['viewerState']>) {
    previous.addEventListener('click', () => state.previousCanvas());
    next.addEventListener('click', () => state.nextCanvas());
    // Batched, payload-free: "state changed — read what you need".
    return state.subscribe(() => {
        (previous as HTMLButtonElement).disabled = !state.hasPrevious;
        (next as HTMLButtonElement).disabled = !state.hasNext;
    });
}

el.addEventListener('viewerstateavailable', (event) => {
    bind((event as CustomEvent).detail);
});
if (el.viewerState) bind(el.viewerState);
