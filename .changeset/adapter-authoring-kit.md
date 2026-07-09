---
'triiiceratops': minor
---

Annotation editor: added an adapter authoring kit. A new testing subpath `triiiceratops/plugins/annotation-editor/testing` exports `runAdapterContractTests(factory, { supportsIdReconciliation?, supportsHydrate? })` — a vitest conformance suite adapter authors can run against their own implementation to verify load/create/update/delete round-trips, verbatim body preservation, manifest/canvas isolation, server-assigned id reconciliation, and hydrate. `vitest` is only pulled in through this testing subpath and never becomes a runtime dependency. The plugin docs now include the minimal adapter contract, a complete fetch-based W3C Annotation Protocol adapter example, and a "test your adapter" section.
