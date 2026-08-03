// ViewerState — reactive, updatable plugin render target (panel ↔ flyout).
//
// The effective target is config-updatable (like `open`/`visible`): it starts
// at the plugin's authored `target` and can change after registration via
// `config.plugins[id].target` (through updateConfig) or the imperative
// `setPluginTarget`, WITHOUT re-registering. Each plugin registers BOTH a panel
// and a flyout entry; only the one matching the effective target is live.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import type { IconDescriptor } from '../types/plugin';

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

type SdkChromeConfig = Parameters<ViewerState['registerSdkChrome']>[0];

const ICON: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

// Minimal plugin chrome — the target machinery is content-agnostic, so a
// placeholder icon and mount thunk suffice for state-level assertions.
function chrome(overrides: Partial<SdkChromeConfig> = {}): SdkChromeConfig {
    return {
        id: 'p1',
        name: 'Plugin One',
        icon: ICON,
        target: 'panel',
        dismiss: 'light',
        mount: () => () => {},
        ...overrides,
    };
}

function panelOf(state: ViewerState, id: string) {
    return state.pluginPanels.find((p) => p.id === `${id}:panel`);
}
function flyoutOf(state: ViewerState, id: string) {
    return state.pluginFlyouts.find((f) => f.id === `${id}:flyout`);
}

describe('ViewerState plugin render target (updatable)', () => {
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        state = new ViewerState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers BOTH a panel and a flyout entry regardless of authored target', () => {
        state.registerSdkChrome(chrome({ id: 'p1', target: 'panel' }));
        expect(panelOf(state, 'p1')).toBeDefined();
        expect(flyoutOf(state, 'p1')).toBeDefined();
        // One toolbar button, always carrying a flyout DOM id for anchoring.
        const buttons = state.pluginMenuButtons.filter(
            (b) => b.pluginId === 'p1',
        );
        expect(buttons).toHaveLength(1);
        expect(buttons[0].flyoutDomId).toBe('tri-flyout-p1');
    });

    it('defaults the effective target to the authored target', () => {
        state.registerSdkChrome(chrome({ id: 'panelish', target: 'panel' }));
        state.registerSdkChrome(chrome({ id: 'flyish', target: 'flyout' }));
        expect(state.getPluginTarget('panelish')).toBe('panel');
        expect(state.getPluginTarget('flyish')).toBe('flyout');
        // Unknown plugin falls back to 'panel'.
        expect(state.getPluginTarget('nope')).toBe('panel');
    });

    it('panel entry is live only when effective target is panel AND open', () => {
        state.registerSdkChrome(chrome({ id: 'p1', target: 'panel' }));
        const panel = panelOf(state, 'p1')!;

        expect(panel.isVisible()).toBe(false); // closed
        state.setPluginOpen('p1', true);
        expect(panel.isVisible()).toBe(true); // panel + open

        // Switch to flyout: the panel entry goes dark even though still "open".
        state.setPluginTarget('p1', 'flyout');
        expect(state.getPluginTarget('p1')).toBe('flyout');
        expect(panel.isVisible()).toBe(false);
    });

    it('setPluginTarget switches after registration and is a no-op when unchanged', () => {
        state.registerSdkChrome(chrome({ id: 'p1', target: 'panel' }));
        // dispatchStateChange is private; cast to observe the re-render signal.
        const spy = vi.spyOn(
            state as unknown as { dispatchStateChange: () => void },
            'dispatchStateChange',
        );

        state.setPluginTarget('p1', 'panel'); // unchanged → no dispatch
        expect(spy).not.toHaveBeenCalled();

        state.setPluginTarget('p1', 'flyout'); // changed → dispatch
        expect(state.getPluginTarget('p1')).toBe('flyout');
        expect(spy).toHaveBeenCalledTimes(1);

        // Unknown plugin is a safe no-op.
        state.setPluginTarget('ghost', 'flyout');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('applies config.plugins[id].target on updateConfig, after registration', () => {
        state.registerSdkChrome(chrome({ id: 'p1', target: 'panel' }));
        expect(state.getPluginTarget('p1')).toBe('panel');

        state.updateConfig({ plugins: { p1: { target: 'flyout' } } });
        expect(state.getPluginTarget('p1')).toBe('flyout');

        // Clearing the override does not clobber the live value (config is a
        // sparse override; absent fields keep the current state).
        state.updateConfig({ plugins: { p1: { open: true } } });
        expect(state.getPluginTarget('p1')).toBe('flyout');
    });

    it('seeds the effective target from config at registration time', () => {
        state.updateConfig({ plugins: { late: { target: 'flyout' } } });
        // Authored as panel, but config already asks for flyout.
        state.registerSdkChrome(chrome({ id: 'late', target: 'panel' }));
        expect(state.getPluginTarget('late')).toBe('flyout');
    });

    it('closePluginFlyouts ignores plugins currently rendering as a panel', () => {
        state.registerSdkChrome(chrome({ id: 'panelish', target: 'panel' }));
        state.registerSdkChrome(chrome({ id: 'flyish', target: 'flyout' }));
        state.setPluginOpen('panelish', true);
        state.setPluginOpen('flyish', true);

        state.closePluginFlyouts();

        // The panel-target plugin stays open; only the flyout-target one closes.
        expect(panelOf(state, 'panelish')!.isVisible()).toBe(true);
        expect(state.getPluginTarget('flyish')).toBe('flyout');
        const flyBtn = state.pluginMenuButtons.find(
            (b) => b.pluginId === 'flyish',
        );
        expect(flyBtn!.isActive!()).toBe(false);
    });
});
