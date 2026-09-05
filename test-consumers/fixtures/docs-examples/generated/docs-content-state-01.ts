// GENERATED from apps/site/content/docs/content-state.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { parseContentState } from 'triiiceratops';

const param = new URLSearchParams(location.search).get('iiif-content');
const target = param ? parseContentState(param) : null;

// Your own routing wins — the URL parameter is the fallback, not the authority.
if (target) {
    console.log(target.manifestId, target.canvasId, target.region);
}
