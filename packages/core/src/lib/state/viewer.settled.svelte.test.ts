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
