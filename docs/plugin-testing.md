---
icon: lucide/flask-conical
description: "Validate a plugin without a full application using @triiiceratops/plugin-sdk/testing and its real test viewer context."
---

# Testing a plugin

`@triiiceratops/plugin-sdk/testing` lets you validate a plugin without a full
application. It mounts your plugin against a **test viewer context**: a real,
compiled `ViewerState` (real commands, real batched notifications) with recording
doubles for the style, UI, and locale services and an injectable OSD stub that
defaults to absent. The harness is fake; the state is never fake, so a passing
test reflects production semantics.

The kit runs in a plain vitest project — no Svelte tooling required — because the
headless state comes from core's compiled `triiiceratops/testing` entry.

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
synchronously inside a command. After a command (or a locale/OSD change),
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

## The conformance suite

`runPluginConformance` runs the whole SDK lifecycle battery against your plugin
factory. It registers its own `describe`/`it` blocks, so call it at the top level
of a test file:

```ts
import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';
import { createExamplePlugin } from './my-plugin';

runPluginConformance(() => createExamplePlugin());
```

## OSD-dependent behavior

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

    // And read what a command sent to the renderer.
    tc.viewerState.zoomIn();
    return renderer.calls;
}
```

Genuine pixel behaviour still belongs at the browser seam.

## Testing an annotation storage adapter

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
