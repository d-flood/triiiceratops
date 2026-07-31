// `PluginContext.surface` — a plugin's awareness of its OWN panel/flyout.
//
// Regression guard: core mounts an SDK plugin ONCE and re-parents its content
// element in and out of the open surface, so `view.mount` is not re-run on
// open/close. A Svelte component would learn open/close from its mount/destroy
// lifecycle; an SDK plugin learns it here. These tests pin the two
// properties that make that work:
//   - the surface is a LIVE projection of `ViewerState` (never a snapshot), and
//   - open-state changes NOTIFY, from every write source — including the toolbar
//     button, which is the one path a plugin cannot see any other way.
//
// The notification half is the load-bearing part: `pluginUiState` is a SvelteMap
// whose open/close writes are same-key value swaps, and the framework-neutral
// `subscribe` watcher tracks it through `keys()`. If that member is ever
// reclassified `internal` again (excluding it from the watcher), the "notifies"
// tests here fail rather than plugins silently going deaf.

import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { createPluginSurface } from './surface';
import { ViewerState } from '../state/viewer.svelte';

/** Settle the batched, payload-free notification flush. */
async function flush(): Promise<void> {
    await tick();
    await Promise.resolve();
}

describe('createPluginSurface', () => {
    it('exposes the chrome id it was bound to', () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'my-plugin', 'panel');

        expect(surface.id).toBe('my-plugin');
        state.destroy();
    });

    it('seeds the viewer UI state so isOpen/target are authoritative immediately', () => {
        // Core builds the surface BEFORE registering chrome (it registers only
        // after a successful mount, to fail closed), so the surface must seed the
        // entry itself or a plugin would read stale defaults inside `mount`.
        const state = new ViewerState();
        state.updateConfig({ plugins: { configured: { open: true } } });

        const surface = createPluginSurface(state, 'configured', 'flyout');

        expect(surface.isOpen).toBe(true);
        expect(surface.target).toBe('flyout');
        state.destroy();
    });

    it('defaults to closed, and reports the authored target before any override', () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'plain', 'flyout');

        expect(surface.isOpen).toBe(false);
        expect(surface.target).toBe('flyout');
        state.destroy();
    });

    it('is a live projection: isOpen follows the viewer, it is not a snapshot', () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'live', 'panel');

        expect(surface.isOpen).toBe(false);
        state.setPluginOpen('live', true);
        expect(surface.isOpen).toBe(true);
        state.setPluginOpen('live', false);
        expect(surface.isOpen).toBe(false);

        state.destroy();
    });

    it('follows a target change made after mount', () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'movable', 'panel');

        expect(surface.target).toBe('panel');
        state.setPluginTarget('movable', 'flyout');
        expect(surface.target).toBe('flyout');

        state.destroy();
    });

    it('open/close/toggle drive the real viewer commands', () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'driver', 'panel');

        surface.open();
        expect(state.isPluginOpen('driver')).toBe(true);
        // Idempotent: opening an open surface leaves it open.
        surface.open();
        expect(state.isPluginOpen('driver')).toBe(true);

        surface.close();
        expect(state.isPluginOpen('driver')).toBe(false);

        surface.toggle();
        expect(state.isPluginOpen('driver')).toBe(true);
        surface.toggle();
        expect(state.isPluginOpen('driver')).toBe(false);

        state.destroy();
    });
});

describe('plugin open state notifies subscribers', () => {
    /**
     * Subscribe the way a plugin does — through the framework-neutral
     * `ViewerState.subscribe` the SDK selector runtime is built on — and report
     * how many times it woke.
     */
    function watch(state: ViewerState) {
        const listener = vi.fn();
        const unsubscribe = state.subscribe(listener);
        return { listener, unsubscribe };
    }

    it('wakes subscribers when setPluginOpen flips the state', async () => {
        const state = new ViewerState();
        createPluginSurface(state, 'p', 'panel');
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.setPluginOpen('p', true);
        await flush();

        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        state.destroy();
    });

    it('wakes subscribers when the TOOLBAR BUTTON toggles the plugin', async () => {
        // The regression: `togglePluginOpen` is what the plugin's own toolbar
        // button calls. It is the primary way a user opens and closes a plugin,
        // and the one open-state mutator that used to notify nobody.
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'p', 'flyout');
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.togglePluginOpen('p');
        await flush();

        expect(surface.isOpen).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);

        state.togglePluginOpen('p');
        await flush();

        expect(surface.isOpen).toBe(false);
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        state.destroy();
    });

    it('wakes subscribers when a flyout is light-dismissed', async () => {
        // Closing by outside pointer-down / Escape goes through
        // `closePluginFlyouts`, not the button — a plugin must see it too. That
        // walks the registered flyout entries, so this case needs real chrome
        // (the surface alone only seeds the plugin's UI state).
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'p', 'flyout');
        state.registerSdkChrome({
            id: 'p',
            name: '@triiiceratops/plugin-p',
            icon: { kind: 'svg', inner: '<circle />', viewBox: '0 0 1 1' },
            target: 'flyout',
            dismiss: 'light',
            mount: () => () => {},
        });
        state.setPluginOpen('p', true);
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.closePluginFlyouts();
        await flush();

        expect(surface.isOpen).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        state.destroy();
    });

    it('wakes subscribers when config.plugins opens the plugin', async () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'p', 'panel');
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.updateConfig({ plugins: { p: { open: true } } });
        await flush();

        expect(surface.isOpen).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        state.destroy();
    });

    it('wakes subscribers when a target change moves the plugin between chromes', async () => {
        const state = new ViewerState();
        const surface = createPluginSurface(state, 'p', 'panel');
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.setPluginTarget('p', 'flyout');
        await flush();

        expect(surface.target).toBe('flyout');
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        state.destroy();
    });

    it('does not wake subscribers when an open-state write changes nothing', async () => {
        // A redundant write must not wake every plugin's subscription. The
        // selector equality gate would absorb it, but the flush churn is real.
        const state = new ViewerState();
        createPluginSurface(state, 'p', 'panel');
        state.setPluginOpen('p', true);
        await flush();

        const { listener, unsubscribe } = watch(state);
        state.setPluginOpen('p', true); // already open
        state.setPluginOpen('does-not-exist', true); // unknown id
        state.togglePluginOpen('does-not-exist'); // unknown id
        state.closePluginFlyouts(); // 'p' renders as a panel — not dismissible
        await flush();

        expect(listener).not.toHaveBeenCalled();
        expect(state.isPluginOpen('p')).toBe(true);

        unsubscribe();
        state.destroy();
    });
});
