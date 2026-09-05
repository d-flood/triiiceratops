---
icon: lucide/link
description: "Which IIIF Content State forms Triiiceratops resolves, and how to turn an iiif-content parameter into viewer inputs."
---

# IIIF Content State

A **content state** is a portable IIIF description of a view: either a bare IIIF
URI, or a [W3C Annotation](https://www.w3.org/TR/annotation-model/) with
`motivation: contentState` whose `target` names a Canvas — optionally with an
`#xywh=` region or a `#t=` media time — and whose `partOf` names the Manifest.
It says *what to show*. It says nothing about how it reached you.

The `iiif-content` request parameter is one delivery channel for it. So are a
paste, a drop, a `FileReader`, and a `data-*` attribute. The channel is yours:
the viewer never reaches for one on its own, because a component that claimed
the address bar could hijack your routing or consume an `iiif-content` parameter
meant for the page around it
([ADR 0006](adr/0006-content-state-is-an-explicit-component-input.md)). What it
will do is accept the payload from you, on the `content-state` input — and, if
you say so explicitly, read that one parameter on your behalf.

You can also skip the viewer entirely. `parseContentState` turns a content state
into a **view target** — `{ manifestId, canvasId?, region?, time? }` — which you
map onto whatever inputs you like.

```ts
import { parseContentState } from 'triiiceratops';

const param = new URLSearchParams(location.search).get('iiif-content');
const target = param ? parseContentState(param) : null;

// Your own routing wins — the URL parameter is the fallback, not the authority.
if (target) {
    console.log(target.manifestId, target.canvasId, target.region);
}
```

`parseContentState` is pure and fetches nothing. A bare URI comes back as the
`manifestId` for you to dereference; it is never dereferenced here. The viewer,
[given the same URI](#passing-one-to-the-viewer), does dereference it.

## Passing one to the viewer

Two inputs, on every distribution — the Svelte component, the custom element, and
the React and Vue wrappers:

| Input | Attribute | Default |
| :--- | :--- | :--- |
| `contentState` | `content-state` | — |
| `readContentStateFromUrl` | `read-content-state-from-url` | off |

`content-state` takes a content state in any of its forms: a bare IIIF URI, the
Annotation as JSON, or that Annotation base64url-encoded exactly as the
`iiif-content` parameter delivers it.

```html
<triiiceratops-viewer content-state="https://example.org/state/1">
</triiiceratops-viewer>
```

`read-content-state-from-url` delegates one channel — the `iiif-content`
parameter — to the viewer. It is a boolean attribute: presence opts in. It is
**off by default**, it is read **once on mount**, and the viewer never writes to
the address bar, so URL cleanup and re-navigation in a single-page application
stay yours.

```html
<triiiceratops-viewer read-content-state-from-url></triiiceratops-viewer>
```

"Once on mount" is literal: the flag is read on the viewer's first render, so it
has to be set **before** the element is inserted into the document. Adding the
attribute to a viewer that is already mounted does nothing, and never will —
there is no second read to catch it. Build the element with the attribute (or
render it with the prop) rather than setting it afterwards.

### Precedence

When more than one source is present:

```
manifest-id / manifest-json (+ canvas-id, initial-canvas-region)
  > content-state
  > the iiif-content URL parameter
```

The discrete inputs are the manual-driving API and win. The URL is ambient and
lowest-trust. Setting `manifest-id` therefore turns a content state into a no-op
rather than a conflict — which is what lets an application keep its own routing
and still opt into the parameter as a fallback.

The tier wins input by input, not just as a whole: a content state still opens
its manifest when you set only `canvas-id` or only `initial-canvas-region`, but
the canvas and the region you set are the ones honored, and the target's own
canvas or `#xywh` is dropped.

### Dereferencing a URI

A content state that is a bare URI is fetched, and the document that comes back
is parsed — so the URI form works whether it points at a content-state Annotation
or straight at a Manifest. The request goes through the same fetch path
`manifest-id` uses; it introduces no new trust boundary, and your
[Content Security Policy](csp.md#content-states) is the control on it.

### Failures are reported, never thrown

Ingestion never throws. What cannot be honored degrades, and anything worth your
attention arrives on the `viewererror` channel under the scope `content-state`:

| Code | Meaning |
| :--- | :--- |
| `content-state-dereference-failed` | The URI could not be fetched. The viewer falls back to loading it as a manifest. |
| `content-state-unresolved` | Nothing in the content state named a Manifest, so nothing was loaded. |

Partially-supported shapes — a multi-target array, a `partOf` naming only a
Collection, a missing `motivation` — resolve to the most the viewer can honor and
log a dev-mode warning instead.

## Degradation, not rejection

Resolution never throws. A content state that is partly unsupported degrades to
the most that can be honored, and `null` comes back only when **no manifest is
resolvable at all**:

- A `target` array resolves its first entry; the rest are dropped with a
  dev-mode warning.
- A `partOf` array resolves the first entry whose type is `Manifest`. When *no*
  entry declares a type at all, the first entry is taken — untyped references are
  common in the wild. When entries *are* typed but none is a `Manifest` (a
  `Collection`, say), nothing is resolved and a dev-mode warning names what was
  found: fetching a Collection as a Manifest would fail anyway.
- A `motivation` that is missing or is not `contentState` still resolves, with a
  dev-mode warning. A document that names a Manifest is worth honoring whatever
  it claims to motivate.
- Identifiers and types are read in both the IIIF Presentation 3 (`id`, `type`)
  and Presentation 2 (`@id`, `@type`) spellings.

Two spec-legal shapes are deliberately **not** resolved, because neither appears
in any IIIF Cookbook recipe the fixtures are drawn from:

- A `target` that is a `SpecificResource` — a `source` plus a `selector` — is not
  unwrapped. The Manifest is looked for on `target.partOf`, not on
  `target.source.partOf`, and a `FragmentSelector`'s `xywh=` region or `t=` time
  is not read. Region and time are read only from the fragment on the target's
  own id.
- An annotation-level `source` (not a spec form) is not honored as a target.

Dev-mode warnings go through the viewer's logger, which is silent unless you
enable [debug mode](configuration.md).

## Supported forms

Every form below is pinned by a committed fixture that the unit tests parse, and
this table is generated from those fixtures — so it cannot claim a form no test
covers. Fixtures whose shape comes from a IIIF Cookbook recipe are constructed
over that recipe's vendored manifest; none of them is fetched, at test time or at
documentation-build time.

<!-- BEGIN GENERATED conformance table — do not edit by hand. Regenerate with: node scripts/docs-content-state.mjs -->

17 committed fixtures, each parsed by
`packages/core/src/lib/utils/contentState.test.ts`. Nothing here is fetched.

| Form | Resolves via | Fixture | Cookbook recipe | Captured |
| --- | --- | --- | --- | --- |
| Bare IIIF URI | Returned as the manifest id for the caller to dereference | `bare-uri.txt` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| base64url-encoded Annotation | Decoded, then parsed as an Annotation | `encoded-annotation.txt` | [0299-region](https://iiif.io/api/cookbook/recipe/0299-region/){target=_blank} | 2026-08-20 |
| The Cookbook's own published `iiif-content` value for recipe 0485 | base64url decoded, then percent-decoded, then parsed as an Annotation | `0485-published.txt` | [0485-contentstate-canvas-region](https://iiif.io/api/cookbook/recipe/0485-contentstate-canvas-region/){target=_blank} | 2026-08-22 |
| Annotation, `target` as string | The target string is the Canvas; the Annotation's `partOf` names the Manifest | `string-target-region.json` | [0299-region](https://iiif.io/api/cookbook/recipe/0299-region/){target=_blank} | 2026-08-20 |
| Annotation, `target` as object | `target.id` is the Canvas; `target.partOf` names the Manifest | `object-target-partof-array.json` | [0299-region](https://iiif.io/api/cookbook/recipe/0299-region/){target=_blank} | 2026-08-20 |
| Annotation, `target` as object with a single `partOf` | `target.partOf` as a bare object rather than an array | `object-target-partof-object.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| Annotation, `target` as object carrying a `#t=` media time | The fragment on `target.id`, through the shared IIIF target helpers | `object-target-time.json` | [0002-mvm-audio](https://iiif.io/api/cookbook/recipe/0002-mvm-audio/){target=_blank} | 2026-08-20 |
| `partOf` as array, Collection first | First entry whose type is `Manifest`, skipping the Collection | `partof-array-collection-first.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| `partOf` as array, no entry declaring a type | First entry, since none declares `Manifest` | `partof-array-untyped.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| `partOf` as array, typed but naming no Manifest | Nothing — a Collection is not fetchable as a manifest, so it degrades rather than resolving | `partof-array-no-manifest.json` | [0032-collection](https://iiif.io/api/cookbook/recipe/0032-collection/){target=_blank} | 2026-08-20 |
| Annotation, `target` as array | First entry; the rest are dropped with a dev-mode warning | `target-array.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| `motivation` as the bare string `contentState` | Accepted alongside the array form | `motivation-string.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| `motivation` absent or not `contentState` | Resolved anyway, with a dev-mode warning | `motivation-missing.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| Annotation spelling identifiers `@id` and types `@type` | Both spellings read at every level | `legacy-at-id.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| A Manifest document rather than an Annotation | The document's own id | `manifest-document.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| A Canvas document naming its Manifest in `partOf` | `partOf` names the Manifest; the document's own id is the view target | `canvas-document-partof.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |
| Annotation naming a Canvas but no Manifest | Nothing — no manifest is resolvable | `no-manifest.json` | [0009-book-1](https://iiif.io/api/cookbook/recipe/0009-book-1/){target=_blank} | 2026-08-20 |

<!-- END GENERATED conformance table -->

## Keeping the claim honest

Those fixtures were captured from cookbook recipes on a date, and the Cookbook
keeps changing. A scheduled, advisory job — `.github/workflows/recipe-drift.yml`
— fetches the live recipes weekly and reports where the recipe catalog, the
vendored manifests or a fixture's pinned manifest and canvas no longer match what
iiif.io publishes. It files a GitHub issue; it never fails a build, and it is
never a required check. A maintainer decides what to update.

Run it locally against the live Cookbook:

```bash
node scripts/recipe-drift.mjs                        # all 67 catalogued recipes
node scripts/recipe-drift.mjs --recipe 0009-book-1   # spot-check one
```
