// GENERATED from apps/site/content/docs/plugin-annotation-editor.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';
import { MyAdapter } from './MyAdapter';

runAdapterContractTests(() => new MyAdapter(), {
    supportsIdReconciliation: true,
    supportsHydrate: true,
});
