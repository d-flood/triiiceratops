// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import { afterEach, expect, test } from 'vitest';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';
import type { TestViewerHandle } from 'triiiceratops/testing';
import { useViewerSelector } from 'triiiceratops/vue';

let handle: TestViewerHandle | undefined;
// `dispose()` drops the underlying subscription. It is idempotent, so an
// already-disposed handle is fine here.
afterEach(() => handle?.dispose());

test('follows the viewer to a new canvas', async () => {
    handle = createTestViewerHandle();
    // shallowRef, NOT ref: a deep ref would hand the composable a reactive
    // proxy of the handle, and identity comparisons would stop holding.
    const viewer = shallowRef(handle);

    const CanvasLabel = defineComponent({
        setup() {
            const canvasId = useViewerSelector(viewer, (s) => s.canvasId);
            return () => h('p', canvasId.value ?? 'No canvas yet');
        },
    });

    const container = document.createElement('div');
    const app = createApp(CanvasLabel);
    app.mount(container);
    expect(container.textContent).toBe('No canvas yet');

    handle.state.setCanvas('https://example.org/canvas/2');
    // Notifications are batched; then let Vue re-render.
    await flush();
    await nextTick();

    expect(container.textContent).toBe('https://example.org/canvas/2');
    app.unmount();
});
