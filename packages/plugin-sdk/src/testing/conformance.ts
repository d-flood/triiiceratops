/**
 * Plugin conformance suite.
 *
 * `runPluginConformance(factory)` registers a battery of vitest cases that
 * activate the plugin against a real test viewer context and assert the
 * lifecycle contracts every plugin must honor:
 *
 * - mount/cleanup symmetry — `mount` runs once, its cleanup runs once on
 *   deactivation, and deactivation is idempotent;
 * - subscription disposal — no `ViewerState` subscription leaks past
 *   deactivation (a command afterwards reaches no plugin listener);
 * - locale-change handling — an active-locale switch does not fail the plugin;
 * - style cleanup — every installed stylesheet is released on deactivation;
 * - error isolation — a sibling throwing view yields a PHASE-CORRECT failure
 *   through `host.reportError`, and the real viewer state stays live.
 *
 * The cases are exported as {@link conformanceCases} so a harness (or the kit's
 * own tests) can drive an individual check directly — e.g. to assert that a
 * deliberately-leaky plugin FAILS the subscription-disposal check.
 */

import { describe, expect, it } from 'vitest';

import type {
    PluginErrorReport,
    PluginHost,
    SdkPlugin,
    SdkPluginMeta,
    ViewerState,
} from 'triiiceratops';
import {
    CORE_VERSION,
    capabilities,
    flush,
    pluginApiVersion,
} from 'triiiceratops/testing';

import { runActivation } from '../activate.js';
import { createTestViewerContext } from './context.js';

/** A factory returning a FRESH plugin instance for each conformance case. */
export type PluginFactory = () => SdkPlugin;

/** One conformance check: a name and an async body that throws on failure. */
export interface ConformanceCase {
    readonly name: string;
    run(factory: PluginFactory): Promise<void>;
}

/**
 * A test harness around one activation: a real state whose `subscribe` is
 * instrumented to count live subscriptions, plus a `PluginHost` wired to the
 * recording doubles and an error sink.
 */
interface Harness {
    readonly state: ViewerState;
    readonly host: PluginHost;
    readonly errors: readonly PluginErrorReport[];
    /** Live (not-yet-unsubscribed) `ViewerState` subscriptions since wrapping. */
    activeSubscriptions(): number;
    /** The recording services (also referenced through `host`). */
    readonly styles: ReturnType<typeof createTestViewerContext>['styles'];
    readonly locale: ReturnType<typeof createTestViewerContext>['locale'];
    readonly surface: ReturnType<typeof createTestViewerContext>['surface'];
    attachRenderer: ReturnType<
        typeof createTestViewerContext
    >['attachRenderer'];
}

function makeHarness(): Harness {
    const tc = createTestViewerContext();
    const state = tc.viewerState;

    // Instrument `subscribe` to count live subscriptions. Wrapped AFTER the
    // context's own selector runtime subscribed (through the original), so the
    // baseline is 0 and only activation-time subscriptions are counted.
    let active = 0;
    const original = state.subscribe.bind(state);
    (state as { subscribe: ViewerState['subscribe'] }).subscribe = (
        listener,
        onError,
    ) => {
        active += 1;
        const unsubscribe = original(listener, onError);
        let done = false;
        return () => {
            if (!done) {
                done = true;
                active -= 1;
            }
            unsubscribe();
        };
    };

    const errors: PluginErrorReport[] = [];
    const host: PluginHost = {
        container: document.createElement('div'),
        viewerState: state,
        coreVersion: CORE_VERSION,
        pluginApiVersion,
        capabilities,
        styles: tc.styles,
        locale: tc.locale,
        ui: tc.ui,
        surface: tc.surface,
        reportError: (report) => errors.push(report),
    };

    return {
        state,
        host,
        errors,
        activeSubscriptions: () => active,
        styles: tc.styles,
        locale: tc.locale,
        surface: tc.surface,
        attachRenderer: tc.attachRenderer,
    };
}

/** Non-`cleanup` phase failures (cleanup failures are separately allowed). */
function primaryErrors(
    errors: readonly PluginErrorReport[],
): readonly PluginErrorReport[] {
    return errors.filter((e) => e.phase !== 'cleanup');
}

export const conformanceCases: readonly ConformanceCase[] = [
    {
        name: 'mounts once and runs its cleanup exactly once on deactivation (symmetry)',
        async run(factory) {
            const h = makeHarness();
            const plugin = factory();

            let mounts = 0;
            let cleanups = 0;
            let returnedCleanup = false;
            const instrumented: SdkPluginMeta = {
                ...plugin,
                view: {
                    mount(container, context) {
                        mounts += 1;
                        const cleanup = plugin.view.mount(container, context);
                        if (typeof cleanup === 'function') {
                            returnedCleanup = true;
                            return () => {
                                cleanups += 1;
                                cleanup();
                            };
                        }
                        return cleanup;
                    },
                },
            };

            const activation = runActivation(instrumented, h.host);
            expect(mounts, 'mount() runs exactly once').toBe(1);
            expect(
                primaryErrors(h.errors),
                'activation reports no setup/mount failure',
            ).toEqual([]);

            activation.deactivate();
            if (returnedCleanup) {
                expect(
                    cleanups,
                    'the view cleanup runs exactly once on deactivate',
                ).toBe(1);
            }

            activation.deactivate();
            if (returnedCleanup) {
                expect(cleanups, 'deactivate is idempotent').toBe(1);
            }
        },
    },
    {
        name: 'disposes every viewer-state subscription on deactivation',
        async run(factory) {
            const h = makeHarness();
            const baseline = h.activeSubscriptions();

            const activation = runActivation(factory(), h.host);
            expect(primaryErrors(h.errors), 'activation succeeds').toEqual([]);

            activation.deactivate();

            // A command after teardown must reach no plugin listener.
            h.state.toggleToolbar();
            await flush();

            expect(
                h.activeSubscriptions(),
                'no viewer-state subscription leaks past deactivation',
            ).toBe(baseline);
            expect(
                h.errors.filter(
                    (e) => e.phase === 'subscription' || e.phase === 'command',
                ),
                'no listener/command failure fires after teardown',
            ).toEqual([]);
        },
    },
    {
        name: 'handles an active-locale change without failing',
        async run(factory) {
            const h = makeHarness();
            const activation = runActivation(factory(), h.host);
            expect(primaryErrors(h.errors), 'activation succeeds').toEqual([]);

            const before = h.locale.current;
            const next = before === 'de' ? 'fr' : 'de';
            h.locale.setLocale(next);
            await flush();

            expect(
                h.locale.current,
                'the locale service reflects the new active locale',
            ).toBe(next);
            expect(h.locale.switches, 'the switch is recorded').toContain(next);
            expect(
                h.errors.filter((e) => e.phase === 'subscription'),
                'no locale-subscription failure',
            ).toEqual([]);

            activation.deactivate();
        },
    },
    {
        name: 'releases every installed stylesheet on deactivation',
        async run(factory) {
            const h = makeHarness();
            const activation = runActivation(factory(), h.host);
            expect(primaryErrors(h.errors), 'activation succeeds').toEqual([]);

            activation.deactivate();

            const leaked = h.styles.installed.filter((s) => !s.released);
            expect(
                leaked,
                'no plugin stylesheet is left installed after deactivation',
            ).toEqual([]);
        },
    },
    {
        name: 'isolates a failing sibling: a throwing view yields a phase-correct failure and the viewer stays live',
        async run(factory) {
            const h = makeHarness();

            // The author's plugin activates cleanly...
            const good = runActivation(factory(), h.host);
            expect(
                primaryErrors(h.errors),
                'the good plugin activates',
            ).toEqual([]);

            // ...a sibling whose view throws is isolated to a `mount` failure.
            const boom = new Error('conformance: mount boom');
            const throwing: SdkPluginMeta = {
                name: '@triiiceratops/conformance-throwing',
                version: '0.0.0',
                coreRange: '>=1.0.0-rc.0',
                pluginApiRange: '^1.0.0',
                requiredCapabilities: [],
                icon: { kind: 'svg', inner: '', viewBox: '0 0 1 1' },
                target: 'panel',
                view: {
                    mount() {
                        throw boom;
                    },
                },
            };
            const throwingErrors: PluginErrorReport[] = [];
            runActivation(throwing, {
                ...h.host,
                container: document.createElement('div'),
                reportError: (report) => throwingErrors.push(report),
            });

            expect(
                throwingErrors,
                'the throwing view is reported once as a `mount` failure',
            ).toEqual([{ phase: 'mount', error: boom }]);

            // The real viewer state is still live: a fresh subscriber wakes on
            // the next flush after a command.
            let woke = false;
            const unsubscribe = h.state.subscribe(() => {
                woke = true;
            });
            h.state.toggleToolbar();
            await flush();
            expect(
                woke,
                'the real viewer state still notifies after a plugin failure',
            ).toBe(true);
            unsubscribe();

            good.deactivate();
        },
    },
];

/**
 * Register the conformance suite as vitest cases for a plugin factory. Call it
 * at the top level of a `*.test.ts` file:
 *
 *   import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';
 *   import { createMyPlugin } from '../src/plugin.js';
 *   runPluginConformance(() => createMyPlugin());
 */
export function runPluginConformance(factory: PluginFactory): void {
    describe('plugin conformance', () => {
        for (const conformanceCase of conformanceCases) {
            it(conformanceCase.name, () => conformanceCase.run(factory));
        }
    });
}
