// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { shallowRef } from 'vue';
import { TriiiceratopsViewer } from 'triiiceratops/vue';

// shallowRef, not ref: a deep ref would hand the wrapper a reactive proxy.
const manifestJson = shallowRef<Record<string, unknown>>({
    id: 'urn:example:manifest',
    type: 'Manifest',
    label: { none: ['Local manifest'] },
    items: [],
});
