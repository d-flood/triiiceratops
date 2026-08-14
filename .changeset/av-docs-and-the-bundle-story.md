---
'triiiceratops': patch
'@triiiceratops/plugin-av': patch
---

The public story catches up with audiovisual support.

`docs/bundle-size-comparison.md` no longer says the viewer "supports no audiovisual recipes at all". It now carries **two** Triiiceratops rows, because the nearest competitor by bytes plays audio and video and comparing an AV-capable TIFY against an image-only Triiiceratops stopped being fair the moment the plugin shipped: core alone (419,990 raw / 118,786 gzip / 98,132 Brotli) for image-only consumers, and core plus `@triiiceratops/plugin-av` (485,403 / 141,353 / 118,158) as the like-for-like figure. The pair beats TIFY's 141,467 gzip by 114 bytes, and the page says so in exactly those terms rather than claiming a lead. A new section documents where the AV bytes went — three media-agnostic core seams rather than AV code in core, four chunks fetched only on demand, and the shared Svelte runtime that keeps the plugin at 22,567 gzip — and lists every one of the fifteen audiovisual Cookbook recipes with what actually happens to it in the demo, evidenced by `av-cookbook.spec.ts` rather than by assertion. The recipe split is corrected while there: 15 of the 67 deduplicated recipes carry a `Sound` or `Video` painting body, verified against manifest content, so the image column is of 52, not 53.

The plugin-authoring guide gains a **published state** section — the publish helper, the command / observable / query-only classification every member must declare, the lifecycle that ties a publication to its activation, the typed-accessor pattern, and what the SDK conformance kit checks. It also explains why decoration over an opaque overlay belongs in a nested `<canvas>` rather than in the paint hook, and what build gate makes the shared Svelte runtime a reviewable dependency on private API. Third-party authors are still told, in the same words as before, to bundle their own Svelte.

`@triiiceratops/plugin-av` ships a README: registration as a module and as a script tag (with the dist-directory and script-order rules), the `AVState` surface with a host example, the manifest shapes it understands, and its documented fences — no DASH, no gapless stitching across segment seams, WebVTT only, spatially placed media degraded — stated as contracts. Core's README no longer lists time-based media as unsupported; it points at the plugin.
