---
icon: lucide/flask-conical
description: "Validate a plugin without a full application using @triiiceratops/plugin-sdk/testing and its real test viewer context."
---

# Testing a plugin

`@triiiceratops/plugin-sdk/testing` lets you validate a plugin without a full
application. It mounts your plugin against a **test viewer context**: a real,
compiled `ViewerState` (real commands, real batched notifications) with recording
doubles for the style, UI, and locale services and an injectable renderer
stand-in that defaults to absent. The harness is fake; the state is never fake, so a passing
test reflects production semantics.

The kit runs in a plain vitest project — no Svelte tooling required — because the
headless state comes from core's compiled `triiiceratops/testing` entry.

It also carries the inert stub services — `createStubStyleService`,
`createStubLocaleService`, `createStubUiService`, `createStubSurfaceService` —
for an activation with no viewer behind it at all. A `PluginHost` requires every
service, and these are the ones to hand it when the test is about something else.
They live here rather than in the SDK's base entry so no shipped plugin bundle
carries a service implementation no reader can see.

=== "pnpm"

    ```bash
    pnpm add -D @triiiceratops/plugin-sdk vitest
    ```

=== "npm"

    ```bash
    npm install -D @triiiceratops/plugin-sdk vitest
    ```

=== "bun"

    ```bash
    bun add -d @triiiceratops/plugin-sdk vitest
    ```

## The flush timing rule

Notifications are **batched** and delivered on the reactive flush, never
synchronously inside a command. After a command (or a locale/renderer change),
`await flush()` before asserting a subscriber reacted:

```ts
import { describe, it, expect } from 'vitest';
import { createTestViewerContext, flush } from '@triiiceratops/plugin-sdk/testing';

describe('viewer state notifications', () => {
    it('delivers on the flush, not synchronously', async () => {
        const { context } = createTestViewerContext();
        const open = context.selectors.select((s) => s.toolbarOpen);

        let seen = open.get();
        open.subscribe((v) => {
            seen = v;
        });

        context.viewerState.toggleToolbar();
        // Batched: no synchronous delivery yet.
        expect(seen).toBe(false);

        await flush();
        expect(seen).toBe(true);
    });
});
```

## Mounting a plugin against real state

Activate your plugin against the context's live state and assert its DOM and
cleanup. The recording style service records installs so you can assert they were
released on deactivation:

```ts
import { describe, it, expect } from 'vitest';
import { activatePlugin } from '@triiiceratops/plugin-sdk';
import { createTestViewerContext, flush } from '@triiiceratops/plugin-sdk/testing';
import {
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from 'triiiceratops/testing';
import { createExamplePlugin } from './my-plugin';

describe('example plugin', () => {
    it('reacts to a command and cleans up', async () => {
        const tc = createTestViewerContext();
        const container = document.createElement('div');
        const activation = activatePlugin(createExamplePlugin(), {
            container,
            viewerState: tc.viewerState,
            coreVersion: CORE_VERSION,
            pluginApiVersion,
            capabilities,
            styles: tc.styles,
            locale: tc.locale,
            ui: tc.ui,
            // The REAL surface over the real state — see the trap below.
            surface: tc.surface,
            // Every guarded phase failure lands here. Rethrowing turns a broken
            // activation into a failing test instead of a silent one.
            reportError: (report) => {
                throw report.error;
            },
        });

        const label = container.querySelector('span');
        expect(label?.textContent).toBe('closed');

        tc.viewerState.toggleToolbar();
        await flush();
        expect(label?.textContent).toBe('open');

        activation.deactivate();
        expect(tc.styles.installed.every((s) => s.released)).toBe(true);
    });
});
```

### The id the viewer knows your plugin by

`createTestViewerContext` binds the surface to one chrome id — `uiId`, defaulting
to `'test-plugin'` — and seeds the viewer's plugin UI state for it. That id is the
only thing the viewer knows your plugin as, so it is the only prefix
`registerOverlayLayer` accepts. Two ways to trip over it, both of which show up as
a layer that never mounts:

- **Your plugin hardcodes its own name in the layer id.** Derive it from
  `context.surface.id` instead — in a test that is `uiId`, in production it is your
  declared `uiId` or your sanitised package name, and in neither case is it
  guaranteed to be the string you typed.
- **You pass a stub surface instead of `tc.surface`.** `createStubSurfaceService`
  answers with whatever id you gave it, and a viewer has never heard of an id it
  did not register, so every layer is refused. Pass `surface: tc.surface`;
  `runPluginConformance` already does.

A refusal is reported on the host's `viewererror` channel
(`code: 'overlay-layer-refused'`), not thrown, and `mount` is never called. If you
want the refusal to be loud in a test, wire a reporter:
`tc.viewerState.setErrorReporter((error) => { throw new Error(error.message); })`.
Pass `uiId: '<your plugin's uiId>'` when your plugin declares one, so the test id
and the production id are the same string.

## The conformance suite

`runPluginConformance` runs the whole SDK lifecycle battery against your plugin
factory. It registers its own `describe`/`it` blocks, so call it at the top level
of a test file:

```ts
import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';
import { createExamplePlugin } from './my-plugin';

runPluginConformance(() => createExamplePlugin());
```

## Renderer-dependent behavior

The kit ships **no** Annotorious fake, but it does ship a headless renderer
stand-in — the renderer is first-party now, so there is one right answer to what
a stand-in reports. Mount it with `attachRenderer(...)` to exercise the readiness
path, the viewport queries, and the `frame` selector cadence with no DOM:

```ts
import {
    createTestViewerContext,
    whenRendererReady,
} from '@triiiceratops/plugin-sdk/testing';

async function readinessExample() {
    const tc = createTestViewerContext();
    const ready = whenRendererReady(tc.viewerState);
    const renderer = tc.attachRenderer({ scale: 2 }); // sized surface
    await ready;

    // Move the viewport and fire one animation event, synchronously.
    renderer.setView({ scale: 4 });
    renderer.emitFrame();

    // Tap the image surface at a screen-space point — the gesture reserved for
    // annotation selection — without synthesizing pointer events.
    renderer.emitTap({ x: 120, y: 80 });

    // And read what a command sent to the renderer.
    tc.viewerState.zoomIn();
    return renderer.calls;
}
```

`emitTap` reaches every `viewerState.subscribeSurfaceTap` listener. The stand-in
does not decide what was tapped: a real tap arrives already filtered by the
renderer's single arbitration point (never a drag, a pinch, or a gesture
suppressed by an input claim), and which annotation a point selects is answered
from geometry the subscriber holds.

Genuine pixel behaviour still belongs at the browser seam.

## Testing an annotation storage adapter

!!! warning "Paused with the plugin"

    `@triiiceratops/plugin-annotation-editor` is
    [paused and no longer published](plugin-annotation-editor.md) in this release
    line, so this subpath is only installable from `1.0.0-rc.7` (which needs
    `triiiceratops@1.0.0-rc.36`). The API below is unaffected by the pause and is
    what returns with the phase-2 drawing layer.

Annotation-editor adapters have their own conformance API in
`@triiiceratops/plugin-annotation-editor/testing`. It checks
load/create/update/delete round-trips, verbatim body preservation, manifest and
canvas isolation, and — when you opt in — server-assigned ids and hydrate. It too
registers its own `describe`/`it` blocks:

```ts
import { runAdapterContractTests } from '@triiiceratops/plugin-annotation-editor/testing';
import { LocalStorageAdapter } from '@triiiceratops/plugin-annotation-editor';

runAdapterContractTests(() => new LocalStorageAdapter(), {
    supportsIdReconciliation: false,
    supportsHydrate: false,
});
```

`vitest` is the only extra requirement, pulled in through the `testing` subpath —
it never becomes a runtime dependency of your plugin.

## Verified against the packed packages

CI runs the `vitest-kit` fixture (the SDK test kit against the compiled
`triiiceratops/testing` entry in a plain vitest project) and the
`plugin-annotation-conformance` fixture (the adapter conformance suite from the
packed `@triiiceratops/plugin-annotation-editor/testing` subpath).
