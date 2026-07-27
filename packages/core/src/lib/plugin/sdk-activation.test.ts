// SDK plugin activation integration tests (ticket 07).
//
// These exercise the framework-neutral seam end to end against a REAL
// `ViewerState` (real commands, real batched `subscribe` notifications): a
// vanilla-DOM `definePlugin` plugin activates on a viewer, renders into a
// core-supplied container, reads live state through a memoized selector, is
// woken by a state command, and drops its subscriptions on deactivation. Two
// viewers stay isolated, and compatibility is negotiated at activation.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    definePlugin,
    activatePlugin,
    PluginCompatibilityError,
    type PluginContext,
    type PluginHost,
} from '@triiiceratops/plugin-sdk';

import { ViewerState } from '../state/viewer.svelte';
import { CORE_VERSION, pluginApiVersion, capabilities } from './api';

vi.mock('../state/manifests.svelte', () => ({
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

const ICON = { kind: 'svg', inner: '', viewBox: '0 0 1 1' } as const;

interface Capture {
    container: HTMLElement | null;
    mountedText: string;
    initialToolbarOpen: boolean | null;
    calls: boolean[];
    cleanupRan: boolean;
}

function makeCapture(): Capture {
    return {
        container: null,
        mountedText: '',
        initialToolbarOpen: null,
        calls: [],
        cleanupRan: false,
    };
}

/**
 * A vanilla-DOM test plugin. Its view records everything a test needs into the
 * `Capture` keyed by the container it was mounted into, so a single plugin
 * object can activate on multiple viewers and each activation stays isolated.
 */
function makeTestPlugin(
    captures: Map<HTMLElement, Capture>,
    overrides: Partial<{
        coreRange: string;
        pluginApiRange: string;
        requiredCapabilities: readonly string[];
    }> = {},
) {
    return definePlugin({
        name: '@triiiceratops/plugin-test',
        version: '1.0.0',
        coreRange: overrides.coreRange ?? '>=1.0.0-rc.0',
        pluginApiRange: overrides.pluginApiRange ?? '^1.0.0',
        requiredCapabilities: overrides.requiredCapabilities ?? ['osd@5'],
        icon: ICON,
        target: 'panel',
        view: {
            mount(container: HTMLElement, context: PluginContext) {
                const capture = captures.get(container);
                if (!capture) throw new Error('no capture registered');

                container.textContent = 'sdk-plugin-mounted';
                capture.container = container;
                capture.mountedText = container.textContent;

                const selector = context.selectors.select(
                    (s) => s.toolbarOpen,
                );
                capture.initialToolbarOpen = selector.get();

                const unsubscribe = selector.subscribe((value) => {
                    capture.calls.push(value);
                });

                return () => {
                    capture.cleanupRan = true;
                    unsubscribe();
                    container.textContent = '';
                };
            },
        },
    });
}

function makeHost(container: HTMLElement, viewerState: ViewerState): PluginHost {
    return {
        container,
        // The SDK's `PluginHost.viewerState` type binds to `triiiceratops`'s
        // published (dist) `ViewerState`; this test constructs the source
        // `ViewerState`. They are structurally identical but nominally distinct
        // (ECMAScript `#private` fields make the class nominal), so we bridge the
        // two build outputs here. Real plugin authors never hit this — they
        // receive the viewer state, never construct it.
        viewerState: viewerState as unknown as PluginHost['viewerState'],
        coreVersion: CORE_VERSION,
        pluginApiVersion,
        capabilities,
    };
}

describe('SDK plugin activation on a viewer', () => {
    let state: ViewerState;
    let container: HTMLElement;
    let captures: Map<HTMLElement, Capture>;

    beforeEach(() => {
        vi.clearAllMocks();
        state = new ViewerState();
        container = document.createElement('div');
        document.body.appendChild(container);
        captures = new Map();
    });

    afterEach(() => {
        container.remove();
        state.destroy();
    });

    it('mounts into the container, reads live state, wakes on a command, and cleans up', async () => {
        const capture = makeCapture();
        captures.set(container, capture);
        const plugin = makeTestPlugin(captures);

        const activation = plugin.activate(makeHost(container, state));

        // Rendered into the core-supplied container.
        expect(capture.container).toBe(container);
        expect(container.textContent).toBe('sdk-plugin-mounted');

        // Selector get() returns current state.
        expect(capture.initialToolbarOpen).toBe(false);

        // A state command wakes the selector subscription after a tick.
        state.toggleToolbar();
        await tick();
        expect(capture.calls).toEqual([true]);

        // Deactivation runs the returned cleanup and drops subscriptions:
        // post-cleanup mutations don't call back.
        activation.deactivate();
        expect(capture.cleanupRan).toBe(true);
        expect(container.textContent).toBe('');

        state.toggleToolbar();
        await tick();
        expect(capture.calls).toEqual([true]);
    });

    it('does not propagate when the selected value fails the equality gate', async () => {
        const capture = makeCapture();
        captures.set(container, capture);
        const plugin = makeTestPlugin(captures);
        const activation = plugin.activate(makeHost(container, state));

        // A command that changes an *unselected* member must not wake a
        // selector whose value is unchanged.
        state.toggleMetadataPanel();
        await tick();
        expect(capture.calls).toEqual([]);

        activation.deactivate();
    });

    it('deactivation is idempotent', () => {
        const capture = makeCapture();
        captures.set(container, capture);
        const plugin = makeTestPlugin(captures);
        const activation = plugin.activate(makeHost(container, state));

        expect(() => {
            activation.deactivate();
            activation.deactivate();
        }).not.toThrow();
        expect(capture.cleanupRan).toBe(true);
    });
});

describe('two-viewer isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('holds independent context/subscriptions per activation of the same plugin', async () => {
        const stateA = new ViewerState();
        const stateB = new ViewerState();
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        document.body.append(containerA, containerB);

        const captures = new Map<HTMLElement, Capture>();
        const captureA = makeCapture();
        const captureB = makeCapture();
        captures.set(containerA, captureA);
        captures.set(containerB, captureB);

        // The SAME plugin object activated on two viewers.
        const plugin = makeTestPlugin(captures);
        const activationA = plugin.activate(makeHost(containerA, stateA));
        const activationB = plugin.activate(makeHost(containerB, stateB));

        // A command on viewer A wakes only A's subscription.
        stateA.toggleToolbar();
        await tick();
        expect(captureA.calls).toEqual([true]);
        expect(captureB.calls).toEqual([]);

        // A command on viewer B wakes only B's subscription.
        stateB.toggleToolbar();
        await tick();
        expect(captureA.calls).toEqual([true]);
        expect(captureB.calls).toEqual([true]);

        // Tearing down A leaves B fully functional.
        activationA.deactivate();
        stateB.toggleToolbar();
        await tick();
        expect(captureA.calls).toEqual([true]);
        expect(captureB.calls).toEqual([true, false]);

        activationB.deactivate();
        containerA.remove();
        containerB.remove();
        stateA.destroy();
        stateB.destroy();
    });
});

describe('compatibility negotiation at activation', () => {
    let state: ViewerState;
    let container: HTMLElement;
    let captures: Map<HTMLElement, Capture>;

    beforeEach(() => {
        vi.clearAllMocks();
        state = new ViewerState();
        container = document.createElement('div');
        captures = new Map();
        captures.set(container, makeCapture());
    });

    afterEach(() => {
        state.destroy();
    });

    it('fails with a structured error when coreRange cannot be satisfied', () => {
        const plugin = makeTestPlugin(captures, { coreRange: '^99.0.0' });

        let thrown: unknown;
        try {
            plugin.activate(makeHost(container, state));
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(PluginCompatibilityError);
        const err = thrown as PluginCompatibilityError;
        expect(err.code).toBe('PLUGIN_INCOMPATIBLE');
        expect(err.pluginName).toBe('@triiiceratops/plugin-test');
        expect(err.reasons.some((r) => r.kind === 'core')).toBe(true);
        expect(err.message).toContain('^99.0.0');
        expect(err.message).toContain(CORE_VERSION);

        // No side effects for an incompatible plugin: nothing was mounted.
        expect(container.textContent).toBe('');
    });

    it('reports a missing required capability', () => {
        const plugin = makeTestPlugin(captures, {
            requiredCapabilities: ['osd@5', 'does-not-exist@1'],
        });

        expect(() => plugin.activate(makeHost(container, state))).toThrow(
            PluginCompatibilityError,
        );
    });

    it('activates a compatible plugin', () => {
        const plugin = makeTestPlugin(captures);
        const activation = plugin.activate(makeHost(container, state));
        expect(container.textContent).toBe('sdk-plugin-mounted');
        activation.deactivate();
    });

    it('activatePlugin() is equivalent to the plugin.activate() method', () => {
        const plugin = makeTestPlugin(captures);
        const activation = activatePlugin(plugin, makeHost(container, state));
        expect(container.textContent).toBe('sdk-plugin-mounted');
        activation.deactivate();
    });
});
