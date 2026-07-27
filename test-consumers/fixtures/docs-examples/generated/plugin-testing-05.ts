// GENERATED from docs/plugin-testing.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';
import { LocalStorageAdapter } from '@triiiceratops/plugin-annotation-editor';

runAdapterContractTests(() => new LocalStorageAdapter(), {
    supportsIdReconciliation: false,
    supportsHydrate: false,
});
