import { flushSync } from 'svelte';
import { expect, it } from 'vitest';

import { createRendererStub } from '../testing/rendererStub';
import { ViewerState } from './viewer.svelte';

it('subscribeSettled adds no dependency to the effect that calls it', () => {
    const state = new ViewerState();
    state.attachRenderer(createRendererStub());
    let runs = 0;
    const cleanup = $effect.root(() => {
        $effect(() => {
            runs++;
            return state.subscribeSettled(() => {});
        });
    });
    flushSync();

    state.setCanvas('https://example.org/canvas/2');
    flushSync();

    expect(runs).toBe(1);
    cleanup();
});

it('settles when the reader picks an alternative that paints no frame', async () => {
    const state = new ViewerState();
    const renderer = createRendererStub();
    state.attachRenderer(renderer);
    state.visibleCanvasIds = ['https://example.org/canvas/1'];
    let woke = 0;
    const off = state.subscribeSettled(() => woke++);
    flushSync();
    await Promise.resolve();
    expect(woke).toBe(0);

    state.selectChoice('https://example.org/canvas/1', 'https://example.org/b');
    flushSync();
    await Promise.resolve();
    expect(woke).toBe(1);

    renderer.emitFrame();
    expect(woke).toBe(1);
    off();
});
