---
icon: lucide/pen-tool
description: "Add annotation authoring to the read-only viewer: rectangle, polygon and point tools, pluggable persistence, and host extension hooks."
---

# Annotation Editor

Provides optional annotation authoring on top of the read-only viewer. The plugin supports rectangle, polygon, and point drawing tools, pluggable persistence, and host-provided extension hooks for app-specific workflows.

## Setup

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-annotation-editor
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-annotation-editor
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-annotation-editor
    ```

Out of the box, `AnnotationEditorPlugin` uses a `LocalStorageAdapter`; add it
like any plugin (see [using plugins](plugins.md#adding-a-plugin-to-your-viewer)).
Use `createAnnotationEditorPlugin(...)` — and
pass the result instead — when you want to persist elsewhere or inject host
logic.

## Custom Storage Adapters

The plugin persistence layer is framework-agnostic. Supply an `AnnotationStorageAdapter` to back annotations with your own API, IndexedDB, SQLite bridge, or another local/remote store.

An adapter is **pure storage** — five functions, no more. The plugin owns everything else:

- **Display sync** — it injects loaded annotations into the viewer's read-only overlay and clears the overlay on teardown. Your adapter never touches `manifestsState` or any viewer state.
- **Caching and create-vs-update** — it keeps the in-memory cache and decides whether a save is a create or an update; you never call `load()` to find out.
- **Id bookkeeping** — if your server mints its own id on create, return it and the plugin reconciles it everywhere (see below). You never rewrite ids yourself.
- **Timestamp / attribution stamping** — it fills `@context`, `type`, `creator`, `created`, `modified`, and `motivation` before every create. Don't add them in the adapter.
- **Error handling** — throw (or reject) on failure and the plugin's error surface rolls back its optimistic state and notifies the host via the `onPersistenceError` config hook. Don't swallow errors.

`LocalStorageAdapter` is the reference minimal implementation.

### The contract

```ts
interface AnnotationStorageAdapter<TBody = W3CAnnotationBody> {
    readonly id: string;
    readonly name: string;

    /**
     * Return every annotation stored for this manifest+canvas ([] when none).
     * `AdapterLoadResult` is `W3CAnnotation` plus the optional skeleton
     * markers described below.
     */
    load(manifestId: string, canvasId: string): Promise<AdapterLoadResult<TBody>[]>;

    /**
     * Persist a new annotation. Return the canonical annotation (or just its id
     * string) if your server assigns the id — the plugin reconciles it. Return
     * nothing to keep the id the plugin sent.
     */
    create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation<TBody>,
    ): Promise<W3CAnnotation<TBody> | string | void>;

    /** Persist an update. Return the (possibly normalized) annotation to adopt it. */
    update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation<TBody>,
    ): Promise<W3CAnnotation<TBody> | void>;

    /** Remove an annotation by id. */
    delete(manifestId: string, canvasId: string, annotationId: string): Promise<void>;

    /** Optional: fetch one annotation's full body on demand (see below). */
    hydrate?(
        manifestId: string,
        canvasId: string,
        annotationId: string,
    ): Promise<AdapterLoadResult<TBody> | null>;

    /** Optional: release resources when the plugin is destroyed. */
    destroy?(): void;
}

/**
 * What `load()`/`hydrate()` may return: a stored annotation plus the internal
 * skeleton markers the plugin reads once and strips before anything enters
 * the cache. These markers never round-trip, so they live here rather than on
 * `W3CAnnotation` itself. Both types are exported from the package.
 */
type AdapterLoadResult<TBody = W3CAnnotationBody> = W3CAnnotation<TBody> & {
    __fullBodyLoaded?: boolean;
    __bodyPreview?: string | null;
};
```

`hydrate(...)` is optional. Implement it when `load()` returns lightweight headers (mark each `__fullBodyLoaded: false`) and you want to fetch large bodies only when an annotation is selected. The plugin reads that marker once, then strips it; return the full annotation from `hydrate`.

### A complete server adapter (fetch + W3C Annotation Protocol)

This adapter talks to a [W3C Annotation Protocol](https://www.w3.org/TR/annotation-protocol/) server: one annotation container per manifest+canvas, `POST` to create (reading the minted id from the `Location` header or the returned body), `PUT` to update, `DELETE` to remove. It has no display, caching, id, or stamping code — the plugin does all of that.

```ts
import {
    createAnnotationEditorPlugin,
    type AnnotationStorageAdapter,
    type W3CAnnotation,
} from '@triiiceratops/plugin-annotation-editor';

class AnnotationServerAdapter implements AnnotationStorageAdapter {
    readonly id = 'annotation-server';
    readonly name = 'Annotation Server';

    constructor(private baseUrl: string) {}

    /** One container per manifest+canvas. */
    private container(manifestId: string, canvasId: string): string {
        const key = encodeURIComponent(`${manifestId}::${canvasId}`);
        return `${this.baseUrl}/containers/${key}/`;
    }

    async load(manifestId: string, canvasId: string): Promise<W3CAnnotation[]> {
        const res = await fetch(this.container(manifestId, canvasId), {
            headers: { Accept: 'application/ld+json' },
        });
        // An empty container is normal — return [] rather than throwing.
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const page = await res.json();
        return page.items ?? [];
    }

    async create(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(this.container(manifestId, canvasId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`create failed: ${res.status}`);
        // Prefer the server's returned representation; fall back to the id it
        // minted in the Location header. Returning the canonical annotation lets
        // the plugin reconcile the id everywhere it is displayed and edited.
        const location = res.headers.get('Location');
        const created = await res.json().catch(() => null);
        if (created?.id) return created;
        if (location) return { ...annotation, id: location };
        return created ?? annotation;
    }

    async update(
        manifestId: string,
        canvasId: string,
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        const res = await fetch(annotation.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/ld+json' },
            body: JSON.stringify(annotation),
        });
        if (!res.ok) throw new Error(`update failed: ${res.status}`);
        return (await res.json().catch(() => null)) ?? annotation;
    }

    async delete(
        _manifestId: string,
        _canvasId: string,
        annotationId: string,
    ): Promise<void> {
        const res = await fetch(annotationId, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`delete failed: ${res.status}`);
        }
    }
}

const plugin = createAnnotationEditorPlugin({
    adapter: new AnnotationServerAdapter('https://annotations.example.org'),
});
```

Errors are thrown, not caught: a rejected `load`/`create`/`update`/`delete` reaches the plugin's error surface, which rolls back the optimistic cache/display change and calls your `onPersistenceError` handler (or shows a dismissible panel message).

### Test your adapter

Verify any adapter against the contract above with the conformance suite. It runs under [vitest](https://vitest.dev/) and checks load/create/update/delete round-trips, verbatim body preservation (including structured bodies), manifest/canvas isolation, and — when you opt in — server-assigned ids and hydrate:

```ts
// MyAdapter.contract.test.ts
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';
import { MyAdapter } from './MyAdapter';

runAdapterContractTests(() => new MyAdapter(), {
    supportsIdReconciliation: true, // create returns a server-minted id
    supportsHydrate: true, // hydrate() is implemented
});
```

`runAdapterContractTests` registers its own `describe`/`it` blocks, so call it at the top level of a test file. Each test uses a unique manifest/canvas pair, so it is safe against storage-backed adapters. `vitest` is the only extra requirement, and it is pulled in only through this testing subpath — it never becomes a runtime dependency of the plugin.

## Host Extension Hooks

For app-specific behavior, prefer the `extension` API over forking the plugin. This keeps the annotation editor reusable in both the Svelte package and the web component build.

```ts
// example-ignore
import {
    createAnnotationEditorPlugin,
    type AnnotationEditorExtension,
} from '@triiiceratops/plugin-annotation-editor';

const extension: AnnotationEditorExtension<{ selectedText: string | null }> = {
    getContext: () => ({ selectedText: window.appSelection ?? null }),
    canCreate: ({ hostContext }) => !!hostContext?.selectedText,
    getCreateDisabledReason: ({ hostContext }) =>
        hostContext?.selectedText
            ? null
            : 'Select text before creating an annotation.',
    prepareDraft: (annotation, { hostContext }) => ({
        ...annotation,
        body: hostContext?.selectedText
            ? [
                  {
                      type: 'TextualBody',
                      purpose: 'commenting',
                      value: hostContext.selectedText,
                  },
              ]
            : [],
    }),
    beforeSave: async (annotation, context) => annotation,
    onSelectionChange: (annotation, context) => {},
};

const plugin = createAnnotationEditorPlugin({ extension });
```

The extension context includes the active manifest/canvas, current editing state, selected annotation, current user, and your host-specific context object.

When `canCreate`/`getCreateDisabledReason` read external host state (the example above reads `window.appSelection`), give the plugin a way to know it changed with `extension.subscribe` — otherwise the creation gate only re-evaluates on the plugin's own reactive state. `subscribe(invalidate)` receives a callback to run whenever the gate should re-check, and returns an unsubscribe:

```ts
const extension: AnnotationEditorExtension<{ selectedText: string | null }> = {
    getContext: () => ({ selectedText: window.appSelection ?? null }),
    canCreate: ({ hostContext }) => !!hostContext?.selectedText,
    subscribe: (invalidate) => {
        // Re-evaluate the gate whenever the host selection changes.
        window.addEventListener('selectionchange', invalidate);
        return () => window.removeEventListener('selectionchange', invalidate);
    },
};
```

Svelte hosts can alternatively back `getContext()` with `$state` and the gate composes correctly without `subscribe`.

## Point Annotations

The point tool authors a true IIIF [`PointSelector`](https://www.w3.org/TR/annotation-model/#point-selector), not a tiny rectangle. Clicking the canvas creates:

```json
{
    "type": "SpecificResource",
    "source": "https://example.org/canvas/1",
    "selector": { "type": "PointSelector", "x": 1234, "y": 567 }
}
```

`x`/`y` are in **canvas coordinate space**, rounded to integer pixels (matching the IIIF cookbook's point examples), and are independent of the zoom level at click time. Points render as circular markers consistently in the read-only overlay, in create mode, and while editing.

Style markers with `pointStyle`, which is consumed by **both** the read-only overlay and the editor so a point looks identical selected or not:

```ts
const plugin = createAnnotationEditorPlugin({
    pointStyle: { radius: 6, fill: '#e5484d', stroke: '#ffffff', strokeWidth: 2 },
});
```

`radius` is in screen (CSS) pixels; the default is a red marker of radius 5 (10 px diameter).

## Custom Body Editor

The built-in body editor handles simple `{ purpose, value }` textual bodies. Projects with structured or app-specific annotation bodies can replace it with `bodyEditor`. Selection, the delete button, and card chrome stay plugin-owned; only the body UI inside the card is yours, and bodies become **opaque** — the plugin writes whatever you hand `save()` through verbatim and never assumes a shape.

There are two variants. Use `component` for Svelte hosts and `render` for the web-component/IIFE build (React, Vue, vanilla, Django templates, …):

```ts
interface AnnotationBodyEditorApi {
    annotation: W3CAnnotation; // full (hydrated) annotation, canvas space
    bodies: unknown[]; // current bodies, untyped — you own the shape
    context: AnnotationEditorRuntimeContext;
    isHydrating: boolean;
    save: (bodies: unknown[] | unknown) => Promise<void>; // persists via the store
    cancel: () => void;
    requestDelete: () => void;
}

type AnnotationBodyEditor =
    | { component: Component<{ api: AnnotationBodyEditorApi }> } // Svelte hosts
    | { render: (container: HTMLElement, api: AnnotationBodyEditorApi) => (() => void) | void };
```

=== "Svelte component"

    ```html
    <!-- MyBodyEditor.svelte -->
    <script lang="ts">
      import type { AnnotationBodyEditorApi } from '@triiiceratops/plugin-annotation-editor';
      let { api }: { api: AnnotationBodyEditorApi } = $props();
      let label = $state((api.bodies[0] as any)?.label ?? '');
    </script>

    <input bind:value={label} disabled={api.isHydrating} />
    <button onclick={() => api.save({ type: 'MyBody', label })}>Save</button>
    ```

    ```ts
    // example-ignore
    import MyBodyEditor from './MyBodyEditor.svelte';
    import { createAnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';
    const plugin = createAnnotationEditorPlugin({
        bodyEditor: { component: MyBodyEditor },
    });
    ```

=== "Framework-agnostic `render`"

    The `render` callback receives a DOM node and the API; mount anything you like and return a cleanup function. It is re-invoked (after cleanup) when the selected annotation changes; the API object is stable per selection.

    ```ts
    const plugin = createAnnotationEditorPlugin({
        bodyEditor: {
            render(container, api) {
                const current = (api.bodies[0] as any) ?? { label: '' };
                container.innerHTML = `
                    <form>
                        <input name="label" />
                        <button type="submit">Save</button>
                    </form>`;
                const form = container.querySelector('form')!;
                (form.elements as any).label.value = current.label ?? '';
                const submit = (e: Event) => {
                    e.preventDefault();
                    api.save({
                        type: 'MyBody',
                        label: new FormData(form).get('label'),
                    });
                };
                form.addEventListener('submit', submit);
                return () => form.removeEventListener('submit', submit);
            },
        },
    });
    ```

## Worked Example: Point-Only Tagging Tool

Combining the pieces above gives a focused "drop a tagged point" tool — point tool only, rendered as a flyout, always in create mode, with a structured-body form. This mirrors the web-component consumer demo (`src/demo-consumer`):

```ts
const annotationPlugin = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    target: 'flyout', // a compact button + popover instead of a docked panel
    tools: ['point'],
    defaultTool: 'point',
    ui: {
        showModeToggle: false, // no Edit/Create switch
        startInCreateMode: true, // clicking the canvas drops a point immediately
        showUndoRedo: false,
        allowMultipleBodies: false,
    },
    bodyEditor: {
        render(container, api) {
            const current = (api.bodies[0] as any) ?? { label: '', confidence: 'medium' };
            container.innerHTML = `
                <form>
                    <label>Label <input name="label" /></label>
                    <label>Confidence
                        <select name="confidence">
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                        </select>
                    </label>
                    <button type="submit">Save</button>
                </form>`;
            const form = container.querySelector('form')!;
            (form.elements as any).label.value = current.label ?? '';
            (form.elements as any).confidence.value = current.confidence ?? 'medium';
            const submit = (e: Event) => {
                e.preventDefault();
                const data = new FormData(form);
                api.save({
                    type: 'TriiiceratopsDemoBody',
                    label: data.get('label'),
                    confidence: data.get('confidence'),
                });
            };
            form.addEventListener('submit', submit);
            return () => form.removeEventListener('submit', submit);
        },
    },
});
```

The structured `{ type: 'TriiiceratopsDemoBody', label, confidence }` body round-trips through `LocalStorageAdapter` (and any conforming adapter) unmodified — the plugin never inspects or filters it.

## Configuration Reference

All options are optional; `createAnnotationEditorPlugin()` with no arguments behaves like the default `AnnotationEditorPlugin`. There is no construction-time option for panel dock side — that's a consumer-only, per-viewer decision, set the same way for every plugin via `config.plugins['annotation-editor'].position` (see [Controlling Plugin UI Through Config](plugins.md#controlling-plugin-ui-through-config)).

| Option                    | Type                                             | Default        | Description                                                                                     |
| ------------------------- | ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------- |
| `adapter`                 | `AnnotationStorageAdapter`                       | `LocalStorageAdapter` | Persistence backend (the five-function contract above).                                  |
| `user`                    | `{ id; name }`                                   | —              | Attribution stamped as `creator` on new annotations.                                            |
| `tools`                   | `('rectangle' \| 'polygon' \| 'point')[]`        | all three      | Which drawing tools are available and actually constrain drawing.                               |
| `defaultTool`             | `'rectangle' \| 'polygon' \| 'point'`            | first of `tools` | Initially active tool (ignored if not within `tools`).                                        |
| `defaultMotivation`       | `string`                                         | `'commenting'` | `motivation` stamped on new annotations lacking one (host/`beforeSave` values win).             |
| `drawingStyle`            | `DrawingStyle`                                   | red            | Annotorious stroke/fill for rectangles and polygons while editing.                              |
| `pointStyle`              | `{ radius?; fill?; stroke?; strokeWidth? }`      | red, radius 5  | Marker styling for points, shared by overlay and editor (`radius` in screen px).                |
| `target`                  | `'panel' \| 'flyout'`                            | `'panel'`      | Render the editor as a docked panel or a toolbar flyout.                                         |
| `ui`                      | `AnnotationEditorUiConfig`                       | see below      | UI chrome and built-in body editor knobs.                                                        |
| `bodyEditor`              | `{ component } \| { render }`                    | built-in       | Replace the built-in body UI (see Custom Body Editor).                                           |
| `extension`               | `AnnotationEditorExtension`                      | —              | Host hooks: `getContext`, `subscribe`, `canCreate`, `getCreateDisabledReason`, `prepareDraft`, `beforeSave`, `onSelectionChange`. |
| `onPersistenceError`      | `(error) => void`                                | console + panel line | Called on adapter failure after the plugin rolls back; `error.retry()` re-runs it.       |
| `prepareAnnotation`       | `(annotation) => annotation`                     | —              | Backward-compatible single-hook draft prefill (prefer `extension.prepareDraft`).                |
| `canCreateAnnotation`     | `() => boolean`                                  | —              | Backward-compatible creation gate (prefer `extension.canCreate`).                               |
| `getCreateDisabledReason` | `() => string \| null`                           | —              | Backward-compatible disabled reason (prefer `extension.getCreateDisabledReason`).               |

`ui` sub-options:

| `ui` field            | Type       | Default        | Description                                                            |
| --------------------- | ---------- | -------------- | --------------------------------------------------------------------- |
| `showModeToggle`      | `boolean`  | `true`         | Show the Edit/Create segmented control.                               |
| `startInCreateMode`   | `boolean`  | `false`        | Open in create mode (only when creation is currently allowed).        |
| `showUndoRedo`        | `boolean`  | `true`         | Show the persistence-aware undo/redo buttons.                         |
| `purposes`            | `string[]` | `W3C_PURPOSES` | Purpose choices offered by the built-in body editor.                  |
| `allowMultipleBodies` | `boolean`  | `true`         | Allow adding multiple body rows in the built-in body editor.          |

## Migrating from the v1 Adapter API

If you wrote an adapter against an earlier release:

- **Remove display-sync code.** Adapters no longer touch `manifestsState` / `setUserAnnotations`. The plugin owns display sync now; an adapter that still injects is redundant (harmless, but delete it). This is the fix for custom adapters that persisted but rendered nothing.
- **`__fullBodyLoaded` is read but no longer round-trips.** Mark skeleton entries with `__fullBodyLoaded: false` on `load()` results as before; the plugin reads the marker once, then strips it. Don't rely on it surviving into the annotation you get back.
- **Undo/redo semantics changed.** Undo/redo is now persistence-aware — it replays inverse operations through your adapter so storage and display never disagree. The old in-memory stack could resurrect deleted data on reload; that no longer happens.
- **Window events are deprecated.** The internal `triiiceratops:annotation-editor:*` `CustomEvent`s are replaced by a per-viewer bus. They are still dispatched for one release as a shim and will be removed in the next major; migrate any external listeners.
- **Stored point annotations need no migration.** Points were already persisted as `PointSelector`, so existing data loads unchanged; a legacy fragment-center read path is kept for one release.

## Backward-Compatible Hooks

`prepareAnnotation`, `canCreateAnnotation`, and `getCreateDisabledReason` remain available for simple integrations. New work should prefer `extension` because it works as a single, portable surface for creation rules, draft enrichment, save-time transforms, and selection callbacks.

## Export Paths

- `@triiiceratops/plugin-annotation-editor`
- `@triiiceratops/plugin-annotation-editor/iife`
- `@triiiceratops/plugin-annotation-editor/testing`
