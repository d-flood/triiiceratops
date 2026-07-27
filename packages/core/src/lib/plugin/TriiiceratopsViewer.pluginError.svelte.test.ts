// Plugin failure channel through the real viewer component (ticket 09).
//
// Mounts TriiiceratopsViewer with a failing SDK plugin and proves the single
// structured `pluginerror` channel: the SAME payload object reaches both the
// bubbling+composed DOM event from the viewer root AND the `onpluginerror` host
// callback; a plugin-local error UI (badged button + retry panel) renders; and
// retry re-activates the plugin so a now-succeeding instance mounts normally.

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definePlugin, type PluginContext } from '@triiiceratops/plugin-sdk';

import TriiiceratopsViewer from '../components/TriiiceratopsViewer.svelte';
import type { PluginError, SdkPlugin } from '../types/plugin';
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

const ICON = { kind: 'svg', inner: '', viewBox: '0 0 1 1' } as const;

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

describe('TriiiceratopsViewer plugin failure channel', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('delivers the SAME payload to the DOM event and the host callback, and renders a badged button', async () => {
        const plugin = definePlugin({
            name: '@triiiceratops/plugin-failing',
            version: '2.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: 'panel',
            view: {
                mount() {
                    throw new Error('mount boom');
                },
            },
        });

        const eventPayloads: PluginError[] = [];
        target.addEventListener('pluginerror', (e) => {
            eventPayloads.push((e as CustomEvent<PluginError>).detail);
        });

        const callbackPayloads: PluginError[] = [];
        const props = $state({
            plugins: [plugin as unknown as SdkPlugin],
            viewerState: undefined as ViewerState | undefined,
            onpluginerror: (error: PluginError) => callbackPayloads.push(error),
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Both channels fired exactly once with the SAME object.
        expect(eventPayloads).toHaveLength(1);
        expect(callbackPayloads).toHaveLength(1);
        expect(eventPayloads[0]).toBe(callbackPayloads[0]);

        // Normative payload shape + attribution + phase.
        const payload = eventPayloads[0];
        expect(payload.pluginName).toBe('@triiiceratops/plugin-failing');
        expect(payload.pluginVersion).toBe('2.0.0');
        expect(payload.phase).toBe('mount');
        expect(payload.error).toBeInstanceOf(Error);
        expect(typeof payload.retry).toBe('function');

        // A plugin-local badged toolbar button is present (no global error UI).
        const button = target.querySelector('[data-plugin-error-button]');
        expect(button).not.toBeNull();
        expect(
            target.querySelector('[data-plugin-error] .plugin-error-badge'),
        ).not.toBeNull();

        await unmount(app);
    });

    it('retry re-activates the plugin; a now-succeeding instance mounts and the error UI clears', async () => {
        let mountAttempts = 0;
        let liveMounts = 0;
        const plugin = definePlugin({
            name: '@triiiceratops/plugin-flaky',
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: 'panel',
            view: {
                mount(container: HTMLElement, _context: PluginContext) {
                    mountAttempts++;
                    // Fail the first activation, succeed on retry.
                    if (mountAttempts === 1) throw new Error('first boom');
                    liveMounts++;
                    container.textContent = 'flaky-mounted';
                    return () => {
                        container.textContent = '';
                    };
                },
            },
        });

        const props = $state({
            plugins: [plugin as unknown as SdkPlugin],
            viewerState: undefined as ViewerState | undefined,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Failed first: error UI is shown, plugin not mounted.
        expect(mountAttempts).toBe(1);
        expect(liveMounts).toBe(0);
        const retryButton = target.querySelector<HTMLElement>(
            '[data-plugin-error-button]',
        );
        expect(retryButton).not.toBeNull();

        // Open the error panel and click retry.
        retryButton!.click();
        await settle();
        const retry = target.querySelector<HTMLElement>(
            '[data-plugin-error-retry]',
        );
        expect(retry).not.toBeNull();
        retry!.click();
        await settle();

        // Re-activated successfully: plugin mounted, error UI cleared.
        expect(mountAttempts).toBe(2);
        expect(liveMounts).toBe(1);
        expect(
            target.querySelector('[data-plugin-error-button]'),
        ).toBeNull();
        expect(
            target.querySelector('.tri-sdk-plugin')?.textContent,
        ).toBe('flaky-mounted');

        await unmount(app);
    });

    it('a failing plugin does not stop a healthy plugin in the same viewer', async () => {
        const failing = definePlugin({
            name: '@triiiceratops/plugin-bad',
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: 'panel',
            view: {
                mount() {
                    throw new Error('bad boom');
                },
            },
        });

        let healthyMounted = false;
        const healthy = definePlugin({
            name: '@triiiceratops/plugin-good',
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: 'panel',
            view: {
                mount(container: HTMLElement) {
                    healthyMounted = true;
                    container.textContent = 'good-mounted';
                    return () => {};
                },
            },
        });

        const props = $state({
            plugins: [
                failing as unknown as SdkPlugin,
                healthy as unknown as SdkPlugin,
            ],
            viewerState: undefined as ViewerState | undefined,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(healthyMounted).toBe(true);
        expect(
            target.querySelector('[data-plugin-name="@triiiceratops/plugin-good"]')
                ?.textContent,
        ).toBe('good-mounted');
        // Exactly one error button (for the failing plugin).
        expect(
            target.querySelectorAll('[data-plugin-error-button]'),
        ).toHaveLength(1);

        await unmount(app);
    });
});
