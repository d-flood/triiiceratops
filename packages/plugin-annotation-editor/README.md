# @triiiceratops/plugin-annotation-editor

Annotation editing for the [Triiiceratops](https://d-flood.github.io/triiiceratops/)
IIIF viewer.

Core renders and selects the annotations a manifest publishes; it writes none.
This plugin adds the writing half: a **drawing layer** over the image with
rectangle, ellipse, polygon, point and whole-canvas tools, a panel with a body
editor and persistence-aware undo/redo, and an `AnnotationStorageAdapter` seam so
annotations persist wherever your institution keeps them. Every tool is operable
from the keyboard, for creation as well as editing.

The drawing layer is built on core's own published primitives — an overlay layer
for its DOM, `canvasToScreen`/`screenToCanvas` for projection, `subscribeFrame`
for reprojection — so no third party's object model sits between the editor and
the viewer. Annotations are persisted as W3C Web Annotations targeting canvas
coordinates: `FragmentSelector` (`xywh=`) for a rectangle, `SvgSelector` with a
`<polygon>` for an ellipse or a polygon, `PointSelector` for a point, and no
selector at all for a whole-canvas note.

## Install

```bash
pnpm add @triiiceratops/plugin-annotation-editor
```

`triiiceratops`, `@triiiceratops/plugin-sdk` and `svelte` are peers. The plugin
declares a core floor (`coreRange: '>=1.0.0-rc.36'`) — the first core that ships
overlay-layer registration — and refuses to activate against anything older,
loudly, on core's plugin-error channel rather than mounting a button that does
nothing.

## Registering it

### As a module (any bundler)

```ts
import {
    AnnotationEditorPlugin,
    createAnnotationEditorPlugin,
    LocalStorageAdapter,
} from '@triiiceratops/plugin-annotation-editor';
```

`AnnotationEditorPlugin` is the preconfigured plugin: every tool, rectangle
armed by default, and the built-in `LocalStorageAdapter`. Use
`createAnnotationEditorPlugin(config)` for anything else. Hand either to the
viewer the way you hand it any other plugin — the `plugins` prop in Svelte,
React and Vue, or the `.plugins` **property** (never an attribute) on the
`<triiiceratops-viewer>` custom element:

```ts
const annotations = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    user: { id: 'user-123', name: 'Jane Doe' },
});

document.querySelector('triiiceratops-viewer').plugins = [annotations];
```

### As a script tag (IIFE)

```html
<script src="/assets/triiiceratops-element.iife.js"></script>
<script src="/assets/plugin-annotation-editor/iife.js"></script>

<triiiceratops-viewer id="viewer"></triiiceratops-viewer>
<script>
    // Loading the script only registers a factory; activation is per-viewer.
    document.getElementById('viewer').plugins = [
        window.Triiiceratops.plugins.get(
            '@triiiceratops/plugin-annotation-editor',
        ),
    ];
</script>
```

Either script order works — the registry is bootstrapped order-independently —
and this bundle carries its own Svelte runtime, so it shares nothing private
with core. The IIFE path uses the built-in `LocalStorageAdapter`; a custom
adapter needs the module entry.

## Drawing

Drawing is **modal**: the reader arms a tool from the panel, and for as long as
it is armed the drawing layer takes pointer events across the whole image, so a
drag draws instead of panning. One tool, one gesture — nothing ever has to guess
whether a press was a click or a drag.

| Tool         | Gesture                                        | Persisted target          |
| ------------ | ---------------------------------------------- | ------------------------- |
| Rectangle    | drag a bounding box                            | `FragmentSelector`        |
| Ellipse      | drag a bounding box                            | `SvgSelector` `<polygon>` |
| Polygon      | click per vertex; Enter or double-click closes | `SvgSelector` `<polygon>` |
| Point        | single click                                   | `PointSelector`           |
| Whole canvas | activate the tool                              | no selector               |

A region smaller than a few canvas pixels in either dimension is discarded
rather than committed, so hand jitter does not litter an annotation set with
two-pixel shapes.

An **ellipse is a creation affordance only**. It persists as a 64-point polygon
inscribed in the dragged box, and edits afterwards as the polygon it is —
nothing records that it was once an ellipse. This is deliberate; see
[ADR 0022](../../docs/adr/0022-an-ellipse-persists-as-a-polygon.md).

What still works while a tool is armed:

- **Wheel zoom**, unchanged — place a vertex precisely without disarming.
- **Keyboard zoom and arrow-key panning**, unchanged.
- **Hold Space to pan by dragging.** The layer drops its own pointer events for
  as long as Space is held and the viewer's ordinary panning takes over
  underneath; a Space-pan never commits a shape.

Pointer-drag panning is the one thing arming suppresses, and Space is its escape
hatch.

A tool is armed only while the panel that explains it is on screen. There are
two exits and both cancel rather than commit: Escape, and **closing the
panel** — which gives the image straight back.

## Keyboard

Creation from the keyboard is **place-then-shape**: arming a tool drops a
default-sized shape at the centre of the current view, which the ordinary
editing verbs then move and size. Creation and editing share one set of verbs.

| Key             | Effect                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- |
| Arrows          | nudge the focused handle, vertex or whole shape by 1 canvas pixel                        |
| Shift + arrows  | the larger step, 10 canvas pixels                                                        |
| Tab / Shift+Tab | cycle the shape's handles and vertices                                                   |
| Enter           | commit; for a polygon in progress, close the outline                                     |
| Escape          | cancel the keyboard shape or edit in progress, else discard any pointer draft and disarm |
| Delete          | remove the selected annotation                                                           |
| `i`             | insert a vertex after the focused polygon vertex                                         |
| `x`             | remove the focused polygon vertex                                                        |

Nudges are in **canvas** pixels, not screen pixels, so one press moves a vertex
the same distance across the folio at fit zoom as at 8×.

Every persisted annotation stays a focusable, labelled element while the editor
is open — those targets are core's, and the drawing layer draws only the one
annotation currently under edit, its handles and the in-progress preview.

## Storage: the adapter seam

An adapter is **pure storage**. It knows nothing about how a shape is displayed;
the plugin's store owns display sync, caching, id reconciliation, creator
stamping, hydration and error handling around it.

```ts
import type {
    AnnotationStorageAdapter,
    W3CAnnotation,
} from '@triiiceratops/plugin-annotation-editor';

const adapter: AnnotationStorageAdapter = {
    id: 'my-server',
    name: 'Institutional annotation server',

    async load(manifestId, canvasId) {
        const res = await fetch(url(manifestId, canvasId));
        return res.json();
    },

    // Return the canonical annotation (or just its id) when your server mints
    // its own IRI — the plugin reconciles the id everywhere. `void` keeps the
    // client-generated one.
    async create(manifestId, canvasId, annotation) {
        const res = await fetch(url(manifestId, canvasId), {
            method: 'POST',
            body: JSON.stringify(annotation),
        });
        return (await res.json()) as W3CAnnotation;
    },

    async update(manifestId, canvasId, annotation) {
        /* … */
    },
    async delete(manifestId, canvasId, annotationId) {
        /* … */
    },
};
```

`load` may return **skeleton** entries — annotations whose bodies have not been
fetched — marked `__fullBodyLoaded: false`; implement the optional `hydrate` and
the plugin fetches a full body when one is opened. Optional `destroy` is called
on teardown.

A failed write **rolls back** the plugin's optimistic changes and then calls
`config.onPersistenceError` with the operation, the annotation id and a `retry()`
that re-runs the exact failed call. Omit the handler and the plugin logs and
shows a dismissible error line in the panel, so a failure is never invisible.

The conformance suite the built-in adapter passes is exported for yours to run
against:

```ts
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';

runAdapterContractTests(() => new MyAdapter(), {
    supportsIdReconciliation: true,
    supportsHydrate: true,
});
```

`LocalStorageAdapter` is the built-in default and persists under a frozen
`@triiiceratops/plugin-annotation-editor:v1` namespace, keyed by manifest and
canvas.

## Replacing the body editor

The built-in body editor edits W3C bodies — a value, a format, a language and a
purpose from the W3C vocabulary — and leaves structured bodies it does not
understand untouched across a save. To edit your own metadata model in place,
pass `bodyEditor`: either a Svelte `component` taking an `api` prop, or a
framework-neutral `render(container, api)` returning its own cleanup.

```ts
createAnnotationEditorPlugin({
    bodyEditor: {
        render(container, api) {
            const input = document.createElement('textarea');
            input.value = String(api.bodies[0]?.value ?? '');
            input.onchange = () =>
                api.save([{ type: 'TextualBody', value: input.value }]);
            container.append(input);
            return () => input.remove();
        },
    },
});
```

`api` carries the full `annotation` in canvas space, its `bodies` normalised to
an array, the runtime `context` (manifest, canvas, user, host context),
`isHydrating`, and `save` / `cancel` / `requestDelete`. The plugin owns the
geometry and the persistence; the body editor owns only the bodies.

`extension` is the other seam, for host applications rather than for a different
body shape: gate creation (`canCreate`, `getCreateDisabledReason`), prefill a
draft (`prepareDraft`), transform on the way out (`beforeSave`), or observe
selection (`onSelectionChange`).

## Configuration

| Option                                                                | Default          | Notes                                                                                     |
| --------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `adapter`                                                             | —                | Storage. `LocalStorageAdapter` on the preconfigured plugin.                               |
| `user`                                                                | —                | `{ id, name? }`, stamped onto new annotations as creator.                                 |
| `tools`                                                               | all five         | Which tools the panel offers.                                                             |
| `defaultTool`                                                         | first in `tools` | Honoured only if it is within `tools`.                                                    |
| `defaultMotivation`                                                   | `'commenting'`   | Never overwrites a motivation the host already set.                                       |
| `target`                                                              | `'panel'`        | Where the plugin chrome renders.                                                          |
| `ui`                                                                  | —                | `showModeToggle`, `startInCreateMode`, `showUndoRedo`, `purposes`, `allowMultipleBodies`. |
| `bodyEditor`, `extension`, `onPersistenceError`                       | —                | See above.                                                                                |
| `prepareAnnotation`, `canCreateAnnotation`, `getCreateDisabledReason` | —                | Flat equivalents of the matching `extension` hooks.                                       |

## Styling

The drawing layer is DOM and SVG, so CSS styles it — theming follows the
viewer's `--tri-` custom properties like everything else. There is no styling
**option**; set these on the viewer or any ancestor.

| Property                             | Default                                         |
| ------------------------------------ | ----------------------------------------------- |
| `--tri-annotation-draw-stroke`       | `var(--tri-color-primary)`                      |
| `--tri-annotation-draw-stroke-width` | `2px`                                           |
| `--tri-annotation-draw-fill`         | 20% `--tri-color-primary`, mixed to transparent |
| `--tri-annotation-draw-cursor`       | `crosshair`                                     |
| `--tri-annotation-edit-move-cursor`  | `move`                                          |
| `--tri-annotation-handle-size`       | `10px`                                          |
| `--tri-annotation-handle-fill`       | `var(--tri-color-primary)`                      |
| `--tri-annotation-handle-stroke`     | `var(--tri-color-base-100)`                     |
| `--tri-annotation-point-fill`        | `oklch(63.7% 0.237 25.331)`                     |
| `--tri-annotation-point-stroke`      | `oklch(63.7% 0.237 25.331)`                     |

Point markers are the exception, and their size is not set here at all: it comes
from the VIEWER's `pointStyle.radius` (`viewer.config.pointStyle`), which is the
one place core's read-only overlay resolves it from too. This plugin takes no
`pointStyle` of its own, deliberately — it cannot write core's config, so a
second setting could only disagree with the first, and a point would change size
the moment it was opened for editing.

Their colour is not configurable through `pointStyle` either — it is fixed to
match core's read-only marker, so a point looks the same open for editing as it
does at rest. Restyle it with `--tri-annotation-point-fill` and
`--tri-annotation-point-stroke`, and change core's own marker to match.

## Upgrading from `1.0.0-rc.7`

`rc.7` was the last published version, and its editing surface was
[Annotorious](https://annotorious.dev/). Annotorious and OpenSeadragon are gone;
the drawing layer is first-party. Four configuration changes, all visible at the
call site:

- **`drawingStyle` is removed.** It was typed with an Annotorious type and only
  ever read inside the deleted Annotorious binding. Style the drawing layer with
  the CSS custom properties above instead.
- **`requiredCapabilities` is gone.** Compatibility is now the `coreRange` floor
  alone — overlay layers are not optional in core, so there was nothing to
  require.
- **`user` keeps its `{ id, name }` shape** but is a locally declared type
  rather than an Annotorious one. No call-site change; replace an `import type
{ User } from '@annotorious/openseadragon'` with `AnnotationEditorUser` from
  this package.
- **`pointStyle` is removed from this plugin's config.** It only ever styled the
  Annotorious marker, which is why it goes the way `drawingStyle` does. The
  replacement is the VIEWER config's `pointStyle` (`viewer.config.pointStyle`) —
  the one place both core's read-only marker and this editor read, which is what
  makes a point the same size selected and not. Only `radius` is read there, in
  screen pixels; `fill`, `stroke` and `strokeWidth` are inert on both sides, and
  the marker's colour comes from the two `--tri-annotation-point-*` custom
  properties above.

Nothing about persisted data changed. The v1 LocalStorage namespace and the W3C
annotation format are the same, so annotations written by `rc.7` load and edit
without migration — an ellipse simply was not drawable before.

Everything that was never the Annotorious binding is carried forward unchanged:
the store, the adapter seam and `LocalStorageAdapter`, display sync, stamping, id
reconciliation, hydration, persistence-aware undo/redo, the body editor and its
replacement hook, the extension hooks, the i18n catalog, and the adapter
conformance suite on the `/testing` subpath.

## Design records

- [ADR 0020](../../docs/adr/0020-modal-drawing-swallows-pointer-events-in-the-dom.md)
  — why arming a tool takes pointer events in the DOM instead of claiming input
  at the gesture arbiter.
- [ADR 0021](../../docs/adr/0021-the-editing-surface-is-first-party.md) — why the
  editing surface is first-party, and why the editor draws one annotation while
  core draws the set.
- [ADR 0022](../../docs/adr/0022-an-ellipse-persists-as-a-polygon.md) — why an
  ellipse is stored as a polygon.
