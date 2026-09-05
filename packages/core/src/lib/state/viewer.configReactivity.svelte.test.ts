import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import { ViewerState } from './viewer.svelte';

/**
 * The notification granularity of the config-backed getters (ADR 0008): a
 * reader of one resolved member follows that member's VALUE, not the identity
 * of the `config` object `updateConfig` replaces wholesale.
 *
 * Runes file (not `viewer.behavior.test.ts`, where these getters' values and
 * snapshots are covered) because pinning a notification needs `$effect.root`,
 * and only `.svelte.ts` sources are compiled with runes.
 */

// Torn down in `afterEach` so a failing assertion cannot leave live effect
// roots behind for the rest of the module.
const roots: Array<() => void> = [];

afterEach(() => {
    while (roots.length) roots.pop()?.();
});

/** Count the runs of an effect that reads exactly one getter. */
function countReads<T>(read: () => T) {
    let runs = 0;
    let last: T | undefined;

    roots.push(
        $effect.root(() => {
            $effect(() => {
                last = read();
                runs += 1;
            });
        }),
    );

    return {
        get runs() {
            return runs;
        },
        get last() {
            return last;
        },
    };
}

describe('ViewerState config-backed getter notifications', () => {
    it('does not wake a reader of an unrelated resolved member when the config object is replaced', async () => {
        const state = new ViewerState();
        state.updateConfig({ showToggle: false });

        const reader = countReads(() => state.showToggle);
        await tick();
        expect(reader.runs).toBe(1);
        expect(reader.last).toBe(false);

        // A new object; only an unrelated member moved.
        state.updateConfig({ showToggle: false, showCanvasNav: false });
        await tick();

        expect(reader.runs).toBe(1);
    });

    it('does not wake a reader of a member absent from both config objects', async () => {
        const state = new ViewerState();

        // The shape that caused the bug: the key is missing entirely, so the
        // read resolves to the getter's default.
        const reader = countReads(() => state.preserveCanvasScale);
        await tick();
        expect(reader.runs).toBe(1);
        expect(reader.last).toBe(false);

        state.updateConfig({ showZoomControls: false });
        await tick();

        expect(reader.runs).toBe(1);
    });

    it('wakes a reader of a member whose resolved value changed', async () => {
        const state = new ViewerState();

        const reader = countReads(() => state.preserveCanvasScale);
        await tick();
        expect(reader.runs).toBe(1);

        state.updateConfig({ preserveCanvasScale: true });
        await tick();

        expect(reader.runs).toBe(2);
        expect(reader.last).toBe(true);
    });

    it('wakes a reader when a member returns to its default by omission', async () => {
        const state = new ViewerState();
        state.updateConfig({ gallery: { size: 140 } });

        const reader = countReads(() => state.galleryExtent);
        await tick();
        expect(reader.last).toBe(140);
        expect(reader.runs).toBe(1);

        state.updateConfig({});
        await tick();

        expect(reader.runs).toBe(2);
        expect(reader.last).toBe(100);
    });

    it('leaves every value-returning config getter undisturbed by an unrelated replacement', async () => {
        const state = new ViewerState();

        const readers = [
            countReads(() => state.showToggle),
            countReads(() => state.showCanvasNav),
            countReads(() => state.showZoomControls),
            countReads(() => state.preserveCanvasScale),
            countReads(() => state.galleryExtent),
        ];
        await tick();
        expect(readers.map((r) => r.runs)).toEqual([1, 1, 1, 1, 1]);

        // The host round-trip: a panel's open state mirrored back into a fresh
        // config object, touching none of the five members.
        state.updateConfig({ information: { open: true } });
        await tick();

        expect(readers.map((r) => r.runs)).toEqual([1, 1, 1, 1, 1]);
        expect(readers.map((r) => r.last)).toEqual([
            true,
            true,
            true,
            false,
            100,
        ]);
    });
});
