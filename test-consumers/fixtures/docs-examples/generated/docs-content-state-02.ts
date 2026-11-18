// GENERATED from apps/site/content/docs/content-state.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    captureViewTarget,
    serializeContentState,
    type ViewerState,
} from 'triiiceratops';

declare const state: ViewerState;

state.subscribeSettled(() => {
    const target = captureViewTarget(state);
    if (!target) return;
    const url = new URL(location.href);
    url.searchParams.set('iiif-content', serializeContentState(target));
    history.replaceState(null, '', url);
});
