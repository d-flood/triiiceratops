// SDK plugin mounting through the real viewer component (ticket 07).
//
// Proves the core mount path in TriiiceratopsViewer.svelte: a vanilla-DOM
// `definePlugin` plugin passed via the `plugins` prop is activated on the
// mounted viewer, renders into a core-owned panel container, reads live state
// through a selector, is woken by a state command, and is cleaned up when the
// viewer unmounts. The legacy PluginDef path is unaffected (coexistence).

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definePlugin, type PluginContext } from '@triiiceratops/plugin-sdk';

import TriiiceratopsViewer from '../components/TriiiceratopsViewer.svelte';
import type { SdkPlugin } from '../types/plugin';
import type { ViewerState } from '../state/viewer.svelte';

vi.mock('openseadragon', () => ({
    default: Object.assign(
        vi.fn(() => ({
            addHandler: vi.fn(),
            removeHandler: vi.fn(),
            removeAllHandlers: vi.fn(),
            destroy: vi.fn(),
            open: vi.fn(),
            close: vi.fn(),
            forceRedraw: vi.fn(),
            setMouseNavEnabled: vi.fn(),
            addOverlay: vi.fn(),
            removeOverlay: vi.fn(),
            clearOverlays: vi.fn(),
            viewport: {
                getZoom: vi.fn(() => 1),
                getMaxZoom: vi.fn(() => 10),
                getMinZoom: vi.fn(() => 0.1),
                zoomTo: vi.fn(),
                zoomBy: vi.fn(),
                panTo: vi.fn(),
                goHome: vi.fn(),
                fitBounds: vi.fn(),
                getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
            },
            world: {
                getItemCount: vi.fn(() => 0),
                getItemAt: vi.fn(),
                addHandler: vi.fn(),
                removeHandler: vi.fn(),
            },
            drawer: { canvas: null },
            container: null,
            element: null,
        })),
        { Rect: vi.fn(), Point: vi.fn(), ControlAnchor: {} },
    ),
}));

const ICON = { kind: 'svg', svg: '<svg viewBox="0 0 1 1"></svg>' } as const;

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

describe('TriiiceratopsViewer mounts SDK plugins', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('activates an SDK plugin into a core-owned container and cleans up on unmount', async () => {
        const capture = {
            container: null as HTMLElement | null,
            initialToolbarOpen: null as boolean | null,
            calls: [] as boolean[],
            cleanupRan: false,
        };

        const plugin = definePlugin({
            name: '@triiiceratops/plugin-component-test',
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: 'panel',
            view: {
                mount(container: HTMLElement, context: PluginContext) {
                    container.textContent = 'component-sdk-plugin';
                    capture.container = container;
                    const selector = context.selectors.select(
                        (s) => s.toolbarOpen,
                    );
                    capture.initialToolbarOpen = selector.get();
                    const unsub = selector.subscribe((v) =>
                        capture.calls.push(v),
                    );
                    return () => {
                        capture.cleanupRan = true;
                        unsub();
                    };
                },
            },
        });

        // `plugin` is typed against the SDK's published (dist) types; the viewer
        // prop wants core's source `SdkPlugin`. They are structurally identical
        // (nominally distinct only via `#private` on the referenced ViewerState),
        // so bridge the two build outputs for the prop.
        const props = $state({
            plugins: [plugin as unknown as SdkPlugin],
            viewerState: undefined as ViewerState | undefined,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Rendered into a core-owned container inside the SDK plugin host.
        const el = capture.container;
        expect(el).not.toBeNull();
        expect(el?.textContent).toBe('component-sdk-plugin');
        expect(el?.classList.contains('tri-sdk-plugin')).toBe(true);
        expect(el?.closest('.tri-sdk-plugin-host')).not.toBeNull();
        expect(el?.dataset.pluginName).toBe(
            '@triiiceratops/plugin-component-test',
        );
        expect(capture.initialToolbarOpen).toBe(false);

        // A state command wakes the plugin's selector subscription.
        expect(props.viewerState).toBeDefined();
        props.viewerState?.toggleToolbar();
        await settle();
        expect(capture.calls).toEqual([true]);

        // Unmounting the viewer deactivates the plugin (cleanup runs).
        await unmount(app);
        expect(capture.cleanupRan).toBe(true);
    });
});
