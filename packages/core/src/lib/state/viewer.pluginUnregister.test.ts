// ViewerState — plugin unregistration (`unregisterPlugin` / `destroyAllPlugins`).
//
// Chrome ids follow the `<pluginId>:<name>` convention (see `PluginMenuButton`
// in ../types/plugin), and `unregisterPlugin` drops records by matching that
// `<pluginId>:` prefix — the trailing colon is the only thing keeping `notes`
// from also evicting `notes-extra`, so that collision is covered explicitly.
//
// Everything here asserts through public members only: the three chrome
// collections plus the plugin UI-state queries. Cleared UI state is observed as
// the queries falling back to their unknown-plugin defaults ('panel', 'left',
// closed).
//
// A plugin's OVERLAY LAYERS are disposed by the same prefix, and that is the one
// piece of the plugin's own teardown core does for it: a layer is DOM on the
// image, so a plugin whose cleanup misses its dispose would otherwise leave
// markers on the picture with nothing left to remove them. It is a backstop —
// the layer's returned dispose is still the documented path, and the tests below
// run both orders to prove they compose.
//
// What the layer assertions here can and cannot say: viewer state owns the
// RECORD, not the container. It never calls a layer's `mount`, so a mount
// cleanup cannot run in this file at all. The two halves of "disposal runs the
// mount cleanup and removes the container" are asserted at the render site
// instead — `../components/TriiiceratopsViewer.overlayLayers.svelte.test.ts` for
// the mount/cleanup lifecycle in jsdom, and
// `../../../tests/canvas-renderer-overlay-layer.spec.ts` for the geometry and
// lifetime claims that need a real browser.

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

// Minimal plugin chrome — unregistration is content-agnostic, so a placeholder
// icon and mount thunk suffice for state-level assertions.
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

function chromeIdsFor(state: ViewerState, pluginId: string): string[] {
    return [
        ...state.pluginMenuButtons.filter((b) => b.pluginId === pluginId),
        ...state.pluginPanels.filter((p) => p.pluginId === pluginId),
        ...state.pluginFlyouts.filter((f) => f.pluginId === pluginId),
    ].map((record) => record.id);
}

describe('ViewerState.unregisterPlugin', () => {
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        state = new ViewerState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('removes every chrome record whose id carries the `<pluginId>:` prefix', () => {
        state.registerSdkChrome(chrome({ id: 'p1' }));
        expect(chromeIdsFor(state, 'p1')).toEqual([
            'p1:toggle',
            'p1:panel',
            'p1:flyout',
        ]);

        state.unregisterPlugin('p1');

        expect(state.pluginMenuButtons).toEqual([]);
        expect(state.pluginPanels).toEqual([]);
        expect(state.pluginFlyouts).toEqual([]);
    });

    it("leaves another plugin's chrome alone", () => {
        state.registerSdkChrome(chrome({ id: 'keeper', name: 'Keeper' }));
        state.registerSdkChrome(chrome({ id: 'goner', name: 'Goner' }));

        state.unregisterPlugin('goner');

        expect(chromeIdsFor(state, 'keeper')).toEqual([
            'keeper:toggle',
            'keeper:panel',
            'keeper:flyout',
        ]);
        expect(chromeIdsFor(state, 'goner')).toEqual([]);
        expect(state.pluginMenuButtons).toHaveLength(1);
        expect(state.pluginPanels).toHaveLength(1);
        expect(state.pluginFlyouts).toHaveLength(1);
    });

    it('does not evict a plugin whose id merely starts with the unregistered id', () => {
        // `notes-extra:toggle` starts with `notes` but NOT with `notes:` — the
        // trailing colon in the filter is what makes the prefix match safe.
        state.registerSdkChrome(chrome({ id: 'notes', name: 'Notes' }));
        state.registerSdkChrome(
            chrome({ id: 'notes-extra', name: 'Notes Extra' }),
        );
        state.setPluginTarget('notes-extra', 'flyout');

        state.unregisterPlugin('notes');

        expect(chromeIdsFor(state, 'notes')).toEqual([]);
        expect(chromeIdsFor(state, 'notes-extra')).toEqual([
            'notes-extra:toggle',
            'notes-extra:panel',
            'notes-extra:flyout',
        ]);
        // ...and its UI state survives too.
        expect(state.getPluginTarget('notes-extra')).toBe('flyout');
    });

    it("clears that plugin's UI state and no other's", () => {
        state.registerSdkChrome(
            chrome({ id: 'goner', target: 'flyout', position: 'bottom' }),
        );
        state.registerSdkChrome(
            chrome({ id: 'keeper', target: 'flyout', position: 'right' }),
        );
        state.setPluginOpen('goner', true);
        state.setPluginOpen('keeper', true);

        state.unregisterPlugin('goner');

        // Non-default values are gone: the queries fall back to the defaults
        // they report for a plugin they have never heard of.
        expect(state.getPluginTarget('goner')).toBe('panel');
        expect(state.getPluginPosition('goner')).toBe('left');
        expect(state.isPluginOpen('goner')).toBe(false);

        expect(state.getPluginTarget('keeper')).toBe('flyout');
        expect(state.getPluginPosition('keeper')).toBe('right');
        expect(state.isPluginOpen('keeper')).toBe(true);
    });

    it('disposes that plugin’s overlay layers', () => {
        state.registerSdkChrome(chrome({ id: 'p1' }));
        const dispose = state.registerOverlayLayer({
            id: 'p1:markers',
            mount: () => () => {},
        });

        state.unregisterPlugin('p1');

        // The record leaving the list is the whole claim available HERE. Viewer
        // state never calls a layer's `mount`, so it never runs the cleanup that
        // returns either: mounting is the render site's job. That the container is
        // removed and the mount cleanup RUNS is asserted where the render site is
        // — `TriiiceratopsViewer.overlayLayers.svelte.test.ts` in jsdom, and
        // `tests/canvas-renderer-overlay-layer.spec.ts` in a real browser.
        expect(state.overlayLayers).toEqual([]);
        // And the plugin's own dispose, if its teardown does get there, is now a
        // no-op rather than a second teardown.
        expect(() => dispose()).not.toThrow();
        expect(state.overlayLayers).toEqual([]);
    });

    it('leaves the layer alone when the plugin already disposed it', () => {
        state.registerSdkChrome(chrome({ id: 'p1' }));
        state.registerSdkChrome(chrome({ id: 'p2', name: 'Plugin Two' }));
        const dispose = state.registerOverlayLayer({
            id: 'p1:markers',
            mount: () => () => {},
        });
        state.registerOverlayLayer({ id: 'p2:markers', mount: () => () => {} });

        // The documented order: the plugin releases its own layer, and core's
        // backstop then finds nothing of its to release.
        dispose();
        expect(() => {
            state.unregisterPlugin('p1');
        }).not.toThrow();

        expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
            'p2:markers',
        ]);
    });

    it('leaves another plugin’s overlay layers alone, colliding prefix included', () => {
        state.registerSdkChrome(chrome({ id: 'notes', name: 'Notes' }));
        state.registerSdkChrome(
            chrome({ id: 'notes-extra', name: 'Notes Extra' }),
        );
        state.registerOverlayLayer({
            id: 'notes:markers',
            mount: () => () => {},
        });
        state.registerOverlayLayer({
            id: 'notes-extra:markers',
            mount: () => () => {},
        });

        state.unregisterPlugin('notes');

        // `notes-extra:markers` starts with `notes` but not with `notes:` — the
        // same trailing colon the chrome filters depend on.
        expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
            'notes-extra:markers',
        ]);
    });

    it('is a safe no-op for an unknown plugin id', () => {
        state.registerSdkChrome(chrome({ id: 'p1', position: 'right' }));
        state.setPluginOpen('p1', true);

        expect(() => {
            state.unregisterPlugin('never-registered');
        }).not.toThrow();
        // Nothing registered, nothing lost.
        expect(() => {
            new ViewerState().unregisterPlugin('never-registered');
        }).not.toThrow();

        expect(chromeIdsFor(state, 'p1')).toEqual([
            'p1:toggle',
            'p1:panel',
            'p1:flyout',
        ]);
        expect(state.getPluginPosition('p1')).toBe('right');
        expect(state.isPluginOpen('p1')).toBe(true);
    });
});

describe('ViewerState.destroyAllPlugins', () => {
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        state = new ViewerState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('disposes every overlay layer, whoever registered it', () => {
        state.registerSdkChrome(chrome({ id: 'p1' }));
        state.registerSdkChrome(chrome({ id: 'p2', name: 'Plugin Two' }));
        const dispose = state.registerOverlayLayer({
            id: 'p1:markers',
            mount: () => () => {},
        });
        state.registerOverlayLayer({ id: 'p2:markers', mount: () => () => {} });

        state.destroyAllPlugins();

        // Layers are DOM on the image: an undisposed one outlives the plugin
        // that drew it with nothing left to remove it.
        expect(state.overlayLayers).toEqual([]);
        expect(() => dispose()).not.toThrow();
    });

    it('empties all three chrome collections and every plugin UI state', () => {
        state.registerSdkChrome(
            chrome({ id: 'p1', target: 'flyout', position: 'bottom' }),
        );
        state.registerSdkChrome(
            chrome({ id: 'p2', target: 'flyout', position: 'right' }),
        );
        state.setPluginOpen('p1', true);
        state.setPluginOpen('p2', true);

        state.destroyAllPlugins();

        expect(state.pluginMenuButtons).toEqual([]);
        expect(state.pluginPanels).toEqual([]);
        expect(state.pluginFlyouts).toEqual([]);

        for (const id of ['p1', 'p2']) {
            expect(state.getPluginTarget(id)).toBe('panel');
            expect(state.getPluginPosition(id)).toBe('left');
            expect(state.isPluginOpen(id)).toBe(false);
        }
    });

    it('is a safe no-op when no plugins are registered', () => {
        expect(() => {
            state.destroyAllPlugins();
        }).not.toThrow();
        expect(state.pluginMenuButtons).toEqual([]);
        expect(state.pluginPanels).toEqual([]);
        expect(state.pluginFlyouts).toEqual([]);
    });
});
