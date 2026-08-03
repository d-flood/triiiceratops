// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';
import type { TestViewerHandle } from 'triiiceratops/testing';
import { useViewerSelector } from 'triiiceratops/react';

// React logs "The current testing environment is not configured to support
// act(...)" unless you set this. Most React setups put it in a shared test
// setup file; Testing Library sets it for you.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

function CanvasLabel({ handle }: { handle: TestViewerHandle }) {
    const canvasId = useViewerSelector(handle, (state) => state.canvasId);
    return <p>{canvasId ?? 'No canvas yet'}</p>;
}

let handle: TestViewerHandle | undefined;
// `dispose()` drops the underlying subscription. It is idempotent, so an
// already-disposed handle is fine here.
afterEach(() => handle?.dispose());

test('follows the viewer to a new canvas', async () => {
    handle = createTestViewerHandle();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<CanvasLabel handle={handle!} />));
    expect(container.textContent).toBe('No canvas yet');

    handle.state.setCanvas('https://example.org/canvas/2');
    // Notifications are batched: settle the flush before asserting.
    await act(async () => flush());

    expect(container.textContent).toBe('https://example.org/canvas/2');
    // Unmounting is a React update too, so it belongs inside `act` as well.
    await act(async () => root.unmount());
});
