---
'@triiiceratops/plugin-av': patch
'triiiceratops': minor
---

Give companion paintability one source of truth, fixing a stage yielded for a picture core never paints.

The AV plugin decided for itself whether core would paint a canvas's `placeholderCanvas` or `accompanyingCanvas`, restating each of core's own refusals — the `items`-only spelling, the empty-page and missing-id checks, the painting-body classifier, and a search for a requestable image. A companion phase is set on that answer: the plugin yields the canvas rect and hides its media element for as long as core is showing the picture. Two implementations of one decision had to agree forever, and they no longer did.

**The multimedia canvas.** The plugin read the companion and never the canvas carrying it, while core refuses a companion on a canvas that paints images of its own — a composite canvas whose own images already paint, under which a companion would be invisible at best. The Cookbook's `0489-multimedia-canvas`, an image body beside a video one, is exactly that shape. The plugin set a placeholder phase and held its media element invisible awaiting a first play, for a picture core had explicitly declined; core painted the canvas's own image instead, so the reader was left with a still where the video belonged and the transport's lanes stood down for a handover that had nothing to hand over.

**The blank stage.** Where a companion's painting body is a Choice, the plugin searched every alternative for one with an id, while core resolves only the **selected** alternative. A companion whose default alternative is an image body naming no source, beside an alternative that names one, made the plugin claim a companion phase, yield the rect and hide the media element for a picture core never painted — the reader got nothing at all, with no error, where the honest fallback was the treatment the canvas would have had with no companion.

**Two pictures readers were being denied.** An image body carrying an Image API `service` and no `id` is painted by core through the service; the plugin required a non-empty string `id` on the body and never looked at the service, though its own comment claimed otherwise. A body wrapped in a `SpecificResource` — how an Image API region selector is authored — is unwrapped by core; the plugin read the id off the wrapper, whose id names the selection rather than the resource, found none, and refused. Both now show. A companion whose canvas id is not a string is painted for the same reason: core takes the id as authored.

`companionPaintable(selection, canvas, property)` is now public API from `triiiceratops` and joins the curated `window.Triiiceratops.core` set the plugin's IIFE reads instead of bundling. It is not a restatement of the rule: it runs core's actual companion resolution and reports whether that resolution produced a picture, so there is no second implementation left to drift. `CompanionProperty` names the two Presentation 3 properties a claimant can ask about.

The plugin's IIFE drops from 15,145 to 15,023 bytes gzip and its ceiling is ratcheted to match; the element bundle grows 80 gzip for the new export, for 42 bytes off the pair.
