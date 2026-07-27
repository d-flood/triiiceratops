// Plugin failure isolation & retry (ticket 09), tested at the SDK contract
// against a LIVE `ViewerState` (real commands, real batched notifications).
//
// For every guarded phase — setup, mount, command, subscription, cleanup — a
// failing plugin A is isolated: plugin B and core stay fully functional, and the
// failure is reported through the host `reportError` channel with the correct
// phase and attribution. Retry re-activates a now-succeeding plugin and the
// failed instance's subscriptions are dead.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    definePlugin,
    activatePlugin,
    type PluginContext,
    type PluginHost,
    type PluginErrorReport,
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

type ThrowPhase = 'mount' | 'command' | 'subscription' | 'cleanup';

interface Capture {
    mounted: boolean;
    calls: boolean[];
    cleanupRan: number;
}

function makeCapture(): Capture {
    return { mounted: false, calls: [], cleanupRan: 0 };
}

/**
 * A configurable test plugin. `throwPhase` selects which guarded phase throws;
 * `coreRange` can be set incompatible to force a `setup` failure.
 */
function makePlugin(opts: {
    name: string;
    capture: Capture;
    throwPhase?: ThrowPhase;
    coreRange?: string;
}) {
    return definePlugin({
        name: opts.name,
        version: '1.2.3',
        coreRange: opts.coreRange ?? '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: ['osd@5'],
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                if (opts.throwPhase === 'mount') {
                    throw new Error(`${opts.name} mount boom`);
                }
                opts.capture.mounted = true;

                const selector = context.selectors.select((s) => {
                    // A projection that throws only once state has changed is a
                    // `command`-phase failure (it recomputes on the flush a
                    // command triggers, not at subscribe time).
                    if (opts.throwPhase === 'command' && s.toolbarOpen) {
                        throw new Error(`${opts.name} command boom`);
                    }
                    return s.toolbarOpen;
                });

                const unsubscribe = selector.subscribe((value) => {
                    if (opts.throwPhase === 'subscription') {
                        throw new Error(`${opts.name} subscription boom`);
                    }
                    opts.capture.calls.push(value);
                });

                return () => {
                    opts.capture.cleanupRan++;
                    unsubscribe();
                    if (opts.throwPhase === 'cleanup') {
                        throw new Error(`${opts.name} cleanup boom`);
                    }
                };
            },
        },
    });
}

function makeHost(
    container: HTMLElement,
    state: ViewerState,
    reportError?: (report: PluginErrorReport) => void,
): PluginHost {
    return {
        container,
        viewerState: state as unknown as PluginHost['viewerState'],
        coreVersion: CORE_VERSION,
        pluginApiVersion,
        capabilities,
        reportError,
    };
}

describe('plugin failure isolation (SDK contract on a live ViewerState)', () => {
    let state: ViewerState;
    let containerA: HTMLElement;
    let containerB: HTMLElement;
    let reports: PluginErrorReport[];
    let attributions: string[];

    beforeEach(() => {
        vi.clearAllMocks();
        state = new ViewerState();
        containerA = document.createElement('div');
        containerB = document.createElement('div');
        document.body.append(containerA, containerB);
        reports = [];
        attributions = [];
    });

    afterEach(() => {
        containerA.remove();
        containerB.remove();
        state.destroy();
        vi.restoreAllMocks();
    });

    /** Report collector that also records which plugin was attributed. */
    function reporterFor(name: string) {
        return (report: PluginErrorReport) => {
            reports.push(report);
            attributions.push(name);
        };
    }

    it('setup: an incompatible plugin reports phase setup; core and plugin B keep working', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const pluginA = makePlugin({
            name: '@t/a',
            capture: capA,
            coreRange: '^99.0.0',
        });
        const pluginB = makePlugin({ name: '@t/b', capture: capB });

        const coreListener = vi.fn();
        state.subscribe(coreListener);

        activatePlugin(pluginA, makeHost(containerA, state, reporterFor('@t/a')));
        activatePlugin(pluginB, makeHost(containerB, state, reporterFor('@t/b')));

        expect(reports).toHaveLength(1);
        expect(reports[0].phase).toBe('setup');
        expect(attributions[0]).toBe('@t/a');
        // Plugin A never mounted; plugin B did.
        expect(capA.mounted).toBe(false);
        expect(capB.mounted).toBe(true);

        // Core and plugin B still react to a command.
        state.toggleToolbar();
        await tick();
        expect(capB.calls).toEqual([true]);
        expect(coreListener).toHaveBeenCalled();
    });

    it('mount: a throwing view reports phase mount; plugin B still mounts and reacts', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const pluginA = makePlugin({
            name: '@t/a',
            capture: capA,
            throwPhase: 'mount',
        });
        const pluginB = makePlugin({ name: '@t/b', capture: capB });

        activatePlugin(pluginA, makeHost(containerA, state, reporterFor('@t/a')));
        activatePlugin(pluginB, makeHost(containerB, state, reporterFor('@t/b')));

        expect(reports).toHaveLength(1);
        expect(reports[0].phase).toBe('mount');
        expect(attributions[0]).toBe('@t/a');
        expect(capB.mounted).toBe(true);

        state.toggleToolbar();
        await tick();
        expect(capB.calls).toEqual([true]);
    });

    it('command: a throwing selector projection reports phase command; other selectors still recompute', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const pluginA = makePlugin({
            name: '@t/a',
            capture: capA,
            throwPhase: 'command',
        });
        const pluginB = makePlugin({ name: '@t/b', capture: capB });

        activatePlugin(pluginA, makeHost(containerA, state, reporterFor('@t/a')));
        activatePlugin(pluginB, makeHost(containerB, state, reporterFor('@t/b')));

        // Both mounted fine; the projection only throws once toolbarOpen flips.
        expect(capA.mounted).toBe(true);
        expect(capB.mounted).toBe(true);
        expect(reports).toHaveLength(0);

        state.toggleToolbar();
        await tick();

        expect(reports).toHaveLength(1);
        expect(reports[0].phase).toBe('command');
        expect(attributions[0]).toBe('@t/a');
        // Plugin B's selector still recomputed and delivered in the same flush.
        expect(capB.calls).toEqual([true]);
    });

    it('subscription: a throwing listener reports phase subscription; plugin B runs in the same flush', async () => {
        const capA = makeCapture();
        const capB = makeCapture();
        const pluginA = makePlugin({
            name: '@t/a',
            capture: capA,
            throwPhase: 'subscription',
        });
        const pluginB = makePlugin({ name: '@t/b', capture: capB });

        const coreListener = vi.fn();
        state.subscribe(coreListener);

        activatePlugin(pluginA, makeHost(containerA, state, reporterFor('@t/a')));
        activatePlugin(pluginB, makeHost(containerB, state, reporterFor('@t/b')));

        state.toggleToolbar();
        await tick();

        expect(reports).toHaveLength(1);
        expect(reports[0].phase).toBe('subscription');
        expect(attributions[0]).toBe('@t/a');
        // Plugin B's callback still ran, and core's own reaction fired.
        expect(capB.calls).toEqual([true]);
        expect(coreListener).toHaveBeenCalled();
    });

    it('cleanup: a throwing cleanup reports phase cleanup and does not block the other cleanups', async () => {
        const capA = makeCapture();
        const pluginA = makePlugin({
            name: '@t/a',
            capture: capA,
            throwPhase: 'cleanup',
        });

        const activation = activatePlugin(
            pluginA,
            makeHost(containerA, state, reporterFor('@t/a')),
        );
        expect(capA.mounted).toBe(true);

        activation.deactivate();

        // The throwing view cleanup was reported as `cleanup`...
        expect(reports).toHaveLength(1);
        expect(reports[0].phase).toBe('cleanup');
        expect(attributions[0]).toBe('@t/a');
        expect(capA.cleanupRan).toBe(1);

        // ...and the OTHER cleanups still ran: the subscription is dropped, so a
        // later command delivers nothing to the failed instance.
        state.toggleToolbar();
        await tick();
        expect(capA.calls).toEqual([]);
    });

    it('retry: re-activates a now-succeeding plugin; the failed instance is dead', async () => {
        const capFail = makeCapture();
        const capOk = makeCapture();

        // First activation throws in mount; retry uses a healthy plugin.
        const failing = makePlugin({
            name: '@t/a',
            capture: capFail,
            throwPhase: 'mount',
        });

        let activation = activatePlugin(
            failing,
            makeHost(containerA, state, reporterFor('@t/a')),
        );
        expect(reports.at(-1)?.phase).toBe('mount');

        // Manual retry (full re-activation): tear the failed instance down, then
        // activate a now-succeeding plugin.
        activation.deactivate();
        const healthy = makePlugin({ name: '@t/a', capture: capOk });
        activation = activatePlugin(
            healthy,
            makeHost(containerA, state, reporterFor('@t/a')),
        );

        expect(capOk.mounted).toBe(true);

        state.toggleToolbar();
        await tick();
        // The re-activated plugin reacts; the failed instance registered no live
        // subscription (its calls stay empty).
        expect(capOk.calls).toEqual([true]);
        expect(capFail.calls).toEqual([]);

        activation.deactivate();
    });
});
