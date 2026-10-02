// GENERATED from apps/site/content/docs/programmatic.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

type ViewerState = NonNullable<TriiiceratopsViewerElement['viewerState']>;

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

function drive(state: ViewerState) {
    document
        .querySelector('button#next')!
        .addEventListener('click', () => state.nextCanvas());
}

// Listen first, then check: catches state published before or after this runs.
el.addEventListener('viewerstateavailable', (event) => {
    drive((event as CustomEvent<ViewerState>).detail);
});
if (el.viewerState) drive(el.viewerState);
