---
'triiiceratops': patch
---

fix: honor a IIIF v2 `viewingHint` as the viewing mode, and read every manifest-level scalar from the raw manifest JSON for both IIIF versions.

Four manifest-level reads — start canvas, viewing direction, viewing behavior, and content-search service discovery — reached into the parsed `manifesto.js` object for at least one of the two IIIF versions. Each now reads the raw manifest JSON first, for both versions (`remove-manifesto` ticket 05).

**One deliberate behavior change.** IIIF Presentation 2.x spells viewing behavior `viewingHint`, and nothing read it: only the v3 `behavior` spelling was consulted, so a v2 manifest declaring `viewingHint: "paged"` opened in `individuals` mode instead of as a two-page spread. `viewingHint` is now read at the manifest root and, failing that, on the first sequence. Where a v2 manifest declares both `behavior` and `viewingHint`, `behavior` still wins; where it declares `viewingHint` at both the root and the sequence, the root wins, matching how viewing direction already resolved.

Everything else is parity-preserving:

- The IIIF v3 `start` property and the v2 sequence-level `viewingDirection` are now read from raw JSON rather than from the parsed object, so they keep working once `manifesto.js` is gone.
- Search-service discovery no longer calls a `manifesto.js` accessor at all. It reads `service` and `services` from the manifest JSON — either may be a bare object rather than an array — and matches search v0, v1 and v2 on `profile` (including a `dcterms:conformsTo` spelling and array-valued profiles) or on `type`/`@type`. v2 is still preferred when several are present. Discovery is now total: no manifest shape makes it throw, where previously an unguarded accessor call would have.
- A search service carrying the v0 profile is now recorded internally as version 0 rather than version 1, which is what the library-backed path reported. The version only chooses a response parser and 0 and 1 select the same one, so nothing downstream changes.
