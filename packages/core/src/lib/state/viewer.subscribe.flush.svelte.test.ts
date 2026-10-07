import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';

import { ViewerState } from './viewer.svelte';

describe('ViewerState.subscribe flushing', () => {
    it('does not flush pending effects', () => {
        const state = new ViewerState();
        let ran = false;
        const cleanup = $effect.root(() => {
            $effect(() => {
                ran = true;
            });
        });

        const unsubscribe = state.subscribe(() => {});
        expect(ran).toBe(false);

        flushSync();
        expect(ran).toBe(true);

        unsubscribe();
        cleanup();
        state.destroy();
    });
});
