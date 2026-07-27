// GENERATED from docs/integration-web-component.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
// Registers <triiiceratops-viewer> as a side effect.
import 'triiiceratops/element/register';

// Complex values (objects, arrays) are set as JS properties, not attributes.
const el = document.querySelector('triiiceratops-viewer');
if (el) {
    (el as any).manifestId = 'https://example.org/manifest.json';
}
