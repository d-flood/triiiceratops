// ViewerState — reactive, updatable plugin panel dock position (left/right/
// bottom/overlay).
//
// The effective position is config-updatable (like `open`/`visible`/`target`):
// it starts at the plugin's authored `position` (default 'left') and can
// change after registration via `config.plugins[id].position` (through
// updateConfig) or the imperative `setPluginPosition`, WITHOUT re-registering.
// It is meaningful only while the plugin's effective target is 'panel' — a
// flyout ignores it entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import { manifestsState } from './manifests.svelte';
import type { PluginDef } from '../types/plugin';

vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getAnnotations: vi.fn(() => []),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

// A minimal legacy PluginDef — the position machinery is component-agnostic,
// so a placeholder icon/component suffices for state-level assertions.
function def(overrides: Partial<PluginDef> = {}): PluginDef {
    return {
        id: 'p1',
        name: 'Plugin One',
        icon: (() => {}) as unknown as PluginDef['icon'],
        panel: (() => {}) as unknown as PluginDef['panel'],
        flyout: (() => {}) as unknown as PluginDef['flyout'],
        ...overrides,
    };
}

describe('ViewerState plugin panel position (updatable)', () => {
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        state = new ViewerState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("defaults the effective position to 'left' when the plugin declares none", () => {
        state.registerPlugin(def({ id: 'p1' }));
        expect(state.getPluginPosition('p1')).toBe('left');
        // Unknown plugin also falls back to 'left'.
        expect(state.getPluginPosition('nope')).toBe('left');
    });

    it('defaults the effective position to the authored position', () => {
        state.registerPlugin(def({ id: 'p1', position: 'right' }));
        expect(state.getPluginPosition('p1')).toBe('right');
    });

    it("setPluginPosition moves the panel to 'bottom'/'overlay' and is a no-op when unchanged", () => {
        state.registerPlugin(def({ id: 'p1' }));
        const spy = vi.spyOn(
            state as unknown as { dispatchStateChange: () => void },
            'dispatchStateChange',
        );

        state.setPluginPosition('p1', 'left'); // unchanged → no dispatch
        expect(spy).not.toHaveBeenCalled();

        state.setPluginPosition('p1', 'bottom');
        expect(state.getPluginPosition('p1')).toBe('bottom');
        expect(spy).toHaveBeenCalledTimes(1);

        state.setPluginPosition('p1', 'overlay');
        expect(state.getPluginPosition('p1')).toBe('overlay');
        expect(spy).toHaveBeenCalledTimes(2);

        // Unknown plugin is a safe no-op.
        state.setPluginPosition('ghost', 'right');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('applies config.plugins[id].position on updateConfig, after registration', () => {
        state.registerPlugin(def({ id: 'p1', position: 'left' }));
        expect(state.getPluginPosition('p1')).toBe('left');

        state.updateConfig({ plugins: { p1: { position: 'overlay' } } });
        expect(state.getPluginPosition('p1')).toBe('overlay');

        // Clearing the override does not clobber the live value (config is a
        // sparse override; absent fields keep the current state).
        state.updateConfig({ plugins: { p1: { open: true } } });
        expect(state.getPluginPosition('p1')).toBe('overlay');
    });

    it('seeds the effective position from config at registration time', () => {
        state.updateConfig({ plugins: { late: { position: 'bottom' } } });
        // Authored as 'left' (the default), but config already asks for 'bottom'.
        state.registerPlugin(def({ id: 'late' }));
        expect(state.getPluginPosition('late')).toBe('bottom');
    });

    it('is independent of target: switching to flyout leaves the stored position untouched', () => {
        state.registerPlugin(def({ id: 'p1', position: 'right', target: 'panel' }));
        expect(state.getPluginPosition('p1')).toBe('right');

        state.setPluginTarget('p1', 'flyout');
        // Position is meaningless while rendering as a flyout, but the stored
        // value survives so switching back to 'panel' restores it.
        expect(state.getPluginPosition('p1')).toBe('right');

        state.setPluginTarget('p1', 'panel');
        expect(state.getPluginPosition('p1')).toBe('right');
    });
});
