// GENERATED from docs/plugins.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
// MyAdapter.contract.test.ts
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';
import { MyAdapter } from './MyAdapter';

runAdapterContractTests(() => new MyAdapter(), {
    supportsIdReconciliation: true, // create returns a server-minted id
    supportsHydrate: true, // hydrate() is implemented
});
