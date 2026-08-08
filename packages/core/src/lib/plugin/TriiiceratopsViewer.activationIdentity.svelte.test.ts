// Identity-keyed plugin activation (framework-wrappers ticket 04).
//
// An activation's lifetime is keyed to the plugin's identity WITHIN the viewer's
// plugin list, not to the identity of the list itself (CONTEXT.md
// **Activation**). The plugin effect in `TriiiceratopsViewer` therefore diffs
// the incoming list against live activations by plugin OBJECT REFERENCE:
//   - present before and after → untouched (no deactivate, no re-mount, no
//     style re-install, no chrome re-registration, no subscription churn);
//   - absent now → the existing teardown path;
//   - newly present → the existing activation path;
//   - reordered with unchanged membership → nothing at all.
//
// This matters because a React or Vue host re-evaluates its plugin array on
// every render, which used to restart every plugin. `retry()` keeps its
// deliberate full re-activation of the ONE plugin it names, and unmounting the
// viewer still tears everything down.
//
// Everything here is asserted through the REAL viewer chrome and a real
// `ViewerState`: mount/cleanup counts observed by the plugin doubles, live
// selector subscriptions, installed stylesheets, and the toolbar DOM.

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

const ICON = {
    kind: 'svg',
    inner: '<circle data-double-icon="1" />',
    viewBox: '0 0 1 1',
} as const;

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

/**
 * Everything one SDK activation leaves behind that a re-supplied list must not
 * disturb: how often it mounted and cleaned up, how often it installed and
 * released its stylesheet, the container core handed it, and every value its
 * live selector subscription observed.
 */
interface Capture {
    mounts: number;
    cleanups: number;
    styleInstalls: number;
    styleReleases: number;
    container: HTMLElement | null;
    seen: boolean[];
}

function makeCapture(): Capture {
    return {
        mounts: 0,
        cleanups: 0,
        styleInstalls: 0,
        styleReleases: 0,
        container: null,
        seen: [],
    };
}

/**
 * An SDK double that records into `capture` and holds a real subscription
 * through the selector runtime, so a teardown is visible three ways: the
 * cleanup count, the released stylesheet, and the dropped subscription.
 *
 * `failFirstMount` lets one double fail its first activation and succeed on the
 * `retry()` that follows.
 */
function makeDouble(config: {
    name: string;
    capture: Capture;
    target?: 'flyout' | 'panel';
    failFirstMount?: boolean;
}): SdkPlugin {
    let mountAttempts = 0;
    const plugin = definePlugin({
        name: config.name,
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: ICON,
        target: config.target ?? 'flyout',
        dismiss: 'explicit',
        view: {
            mount(container: HTMLElement, context: PluginContext) {
                mountAttempts++;
                if (config.failFirstMount && mountAttempts === 1) {
                    throw new Error('mount boom');
                }

                const capture = config.capture;
                capture.mounts++;
                capture.container = container;
                container.textContent = 'double-content';

                capture.styleInstalls++;
                const releaseStyles = context.styles.install(
                    '.tri-identity-double { color: red }',
                    'identity-double',
                );

                const toolbarOpen = context.selectors.select(
                    (s) => s.toolbarOpen,
                );
                const unsubscribe = toolbarOpen.subscribe((value) => {
                    capture.seen.push(value);
                });

                return () => {
                    capture.cleanups++;
                    capture.styleReleases++;
                    releaseStyles();
                    unsubscribe();
                };
            },
        },
    });
    return plugin as unknown as SdkPlugin;
}

// happy-dom lacks the Web Animations API used by the docked-panel transitions.
function stubAnimate() {
    if (!('animate' in Element.prototype)) {
        (Element.prototype as unknown as Record<string, unknown>).animate =
            function () {
                const anim: Record<string, unknown> = {
                    onfinish: null,
                    cancel() {},
                    finish() {},
                    finished: Promise.resolve(),
                    playState: 'finished',
                };
                queueMicrotask(() => {
                    const cb = anim.onfinish as
                        | ((...a: unknown[]) => void)
                        | null;
                    if (typeof cb === 'function') cb();
                });
                return anim as unknown as Animation;
            };
    }
}

interface Harness {
    /** Re-supply the plugin list — the whole point of these tests. */
    plugins: SdkPlugin[];
    readonly viewerState: ViewerState;
    unmount(): Promise<void>;
}

/**
 * Mount the real viewer with a reactive but NON-PROXIED plugin list.
 *
 * `$state` deep-proxies plain objects, so a `$state`-held plugin array would
 * hand the viewer a brand-new proxy per plugin on every re-supply and destroy
 * the very identity the diff keys on. No real host does that: the custom
 * element forwards props through a coarse-grained proxy that passes values
 * through untouched. `$state.raw` behind prop getters reproduces that
 * faithfully while keeping the re-supply reactive.
 */
function mountViewer(
    target: HTMLElement,
    initialPlugins: SdkPlugin[],
    onpluginerror?: (error: PluginError) => void,
): Harness {
    let pluginList = $state.raw(initialPlugins);
    let state = $state.raw<ViewerState | undefined>(undefined);

    const app = mount(TriiiceratopsViewer, {
        target,
        props: {
            get plugins() {
                return pluginList;
            },
            get viewerState() {
                return state;
            },
            set viewerState(next: ViewerState | undefined) {
                state = next;
            },
            onpluginerror,
        },
    });

    return {
        get plugins() {
            return pluginList;
        },
        set plugins(next: SdkPlugin[]) {
            pluginList = next;
        },
        get viewerState() {
            return state!;
        },
        unmount: () => unmount(app),
    };
}

function buttonFor(root: HTMLElement, name: string) {
    return root.querySelector<HTMLElement>(`[aria-label="${name}"]`);
}

describe('SDK plugin activation is keyed to plugin identity, not list identity', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
        stubAnimate();
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('leaves every activation untouched when an equal plugin list is re-supplied', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const a = makeDouble({ name: '@t/identity-a', capture: capA });
        const b = makeDouble({ name: '@t/identity-b', capture: capB });

        const viewer = mountViewer(target, [a, b]);
        await settle();

        expect(capA.mounts).toBe(1);
        expect(capB.mounts).toBe(1);

        // Open A's flyout, so its per-plugin UI state is something a
        // re-registration would visibly destroy.
        const buttonA = buttonFor(target, '@t/identity-a');
        expect(buttonA).not.toBeNull();
        buttonA!.click();
        await settle();
        expect(buttonA!.getAttribute('aria-expanded')).toBe('true');

        const containerA = capA.container;
        const buttonB = buttonFor(target, '@t/identity-b');

        // A host re-render: a brand-new array holding the SAME plugin objects.
        viewer.plugins = [a, b];
        await settle();

        // No deactivate, no re-mount, no style churn.
        expect(capA.mounts).toBe(1);
        expect(capA.cleanups).toBe(0);
        expect(capA.styleInstalls).toBe(1);
        expect(capA.styleReleases).toBe(0);
        expect(capB.mounts).toBe(1);
        expect(capB.cleanups).toBe(0);
        expect(capB.styleInstalls).toBe(1);
        expect(capB.styleReleases).toBe(0);

        // The same activation instance still owns the same container.
        expect(capA.container).toBe(containerA);

        // Chrome was not re-registered: the same toolbar buttons, and A's
        // surface is still open (unregistering would have dropped its UI state).
        expect(buttonFor(target, '@t/identity-a')).toBe(buttonA);
        expect(buttonFor(target, '@t/identity-b')).toBe(buttonB);
        expect(buttonA!.getAttribute('aria-expanded')).toBe('true');

        // Subscriptions are intact: a real command still reaches both plugins,
        // exactly once each.
        viewer.viewerState.toggleToolbar();
        await tick();
        expect(capA.seen).toHaveLength(1);
        expect(capB.seen).toHaveLength(1);

        // Unmounting still deactivates everything.
        await viewer.unmount();
        expect(capA.cleanups).toBe(1);
        expect(capB.cleanups).toBe(1);
        expect(capA.styleReleases).toBe(1);
        expect(capB.styleReleases).toBe(1);
    });

    it('deactivates only the removed plugin and activates only the added one', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const capC = makeCapture();
        const a = makeDouble({ name: '@t/identity-a', capture: capA });
        const b = makeDouble({ name: '@t/identity-b', capture: capB });
        const c = makeDouble({ name: '@t/identity-c', capture: capC });

        const viewer = mountViewer(target, [a, b]);
        await settle();
        expect(capC.mounts).toBe(0);

        // Swap B out for C in one go.
        viewer.plugins = [a, c];
        await settle();

        // Only B was deactivated; only C was activated; A never moved.
        expect(capB.cleanups).toBe(1);
        expect(capB.styleReleases).toBe(1);
        expect(capC.mounts).toBe(1);
        expect(capA.mounts).toBe(1);
        expect(capA.cleanups).toBe(0);

        // B's chrome is gone; A's and C's are present.
        expect(buttonFor(target, '@t/identity-b')).toBeNull();
        expect(buttonFor(target, '@t/identity-a')).not.toBeNull();
        expect(buttonFor(target, '@t/identity-c')).not.toBeNull();

        // B's subscription really was dropped: a command wakes A and C only.
        viewer.viewerState.toggleToolbar();
        await tick();
        expect(capB.seen).toHaveLength(0);
        expect(capA.seen).toHaveLength(1);
        expect(capC.seen).toHaveLength(1);

        await viewer.unmount();
    });

    it('causes no activation churn when the list is reordered with unchanged membership', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const a = makeDouble({ name: '@t/identity-a', capture: capA });
        const b = makeDouble({ name: '@t/identity-b', capture: capB });

        const viewer = mountViewer(target, [a, b]);
        await settle();

        viewer.plugins = [b, a];
        await settle();

        expect(capA.mounts).toBe(1);
        expect(capA.cleanups).toBe(0);
        expect(capB.mounts).toBe(1);
        expect(capB.cleanups).toBe(0);

        await viewer.unmount();
    });

    it('retry() still fully re-activates the one plugin it names, leaving the others alone', async () => {
        const capBoom = makeCapture();
        const capOk = makeCapture();
        const boom = makeDouble({
            name: '@t/identity-boom',
            capture: capBoom,
            failFirstMount: true,
        });
        const ok = makeDouble({ name: '@t/identity-ok', capture: capOk });

        const errors: PluginError[] = [];
        const viewer = mountViewer(target, [boom, ok], (error) =>
            errors.push(error),
        );
        await settle();

        // Fail closed (ADR 0010): no button, no successful mount.
        expect(errors).toHaveLength(1);
        expect(errors[0].pluginName).toBe('@t/identity-boom');
        expect(capBoom.mounts).toBe(0);
        expect(buttonFor(target, '@t/identity-boom')).toBeNull();

        const okButton = buttonFor(target, '@t/identity-ok');
        expect(okButton).not.toBeNull();

        // Host-invoked retry: a full re-activation of that one instance.
        errors[0].retry();
        await settle();

        expect(capBoom.mounts).toBe(1);
        expect(buttonFor(target, '@t/identity-boom')).not.toBeNull();

        // The healthy plugin was not touched by the retry.
        expect(capOk.mounts).toBe(1);
        expect(capOk.cleanups).toBe(0);
        expect(buttonFor(target, '@t/identity-ok')).toBe(okButton);

        // And a later equal re-supply leaves the retried activation alone.
        viewer.plugins = [boom, ok];
        await settle();
        expect(capBoom.mounts).toBe(1);
        expect(capBoom.cleanups).toBe(0);
        expect(capOk.mounts).toBe(1);
        expect(capOk.cleanups).toBe(0);

        await viewer.unmount();
    });
});
