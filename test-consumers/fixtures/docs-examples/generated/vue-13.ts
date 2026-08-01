// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    TriiiceratopsViewer,
    type PluginError,
    type ViewerError,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

function syncUrl(snapshot: ViewerStateSnapshot): void {
    history.replaceState(
        null,
        '',
        `?canvas=${encodeURIComponent(snapshot.canvasId ?? '')}`,
    );
}
// The original PluginError object, recovery behavior intact.
const retry = (error: PluginError): void => error.retry();
const report = (error: ViewerError): void => console.error(error.message);
