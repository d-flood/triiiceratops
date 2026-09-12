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
 *   through `host.reportError`, and the real viewer state stays live;
 * - published state (ADR 0018), for a plugin that publishes any — every member
 *   carrying a real classification (and every classification naming a real
 *   member), an observable member seen to change waking subscribers by the next
 *   flush, and the publication retired with the activation. A plugin that
 *   publishes nothing passes these vacuously.
 *
 * The cases are exported as {@link conformanceCases} so a harness (or the kit's
 * own tests) can drive an individual check directly — e.g. to assert that a
 * deliberately-leaky plugin FAILS the subscription-disposal check.
 */

import { describe, expect, it } from 'vitest';

import type {
    PluginErrorReport,
    PluginHost,
    PublishedState,
    PublishedStateClassification,
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

import { runActivation, sdkChromeId } from '../activate.js';
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
    /** The chrome id this viewer knows the plugin by — its publication key. */
    readonly pluginId: string;
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

/**
 * @param uiId the chrome id to build the viewer context around. Pass the
 * plugin's own ({@link sdkChromeId}) whenever a check reads something core keys
 * to the plugin id — published state, overlay layers — so the harness agrees
 * with the plugin about who it is, as a real core host does.
 */
function makeHarness(uiId?: string): Harness {
    const tc = createTestViewerContext(uiId === undefined ? {} : { uiId });
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
        pluginId: tc.surface.id,
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

/**
 * The published-state SEAM — the contract itself, not state the plugin exposes,
 * so it carries no classification.
 */
const PUBLISHED_STATE_SEAM = new Set([
    'subscribe',
    'subscribeFrame',
    'stateInventory',
]);

/**
 * Activate `factory()` against a harness that knows the plugin by its own id,
 * and hand back whatever it published (`null` when it published nothing —
 * publishing is optional, so every published-state check passes vacuously for a
 * plugin with no external control surface).
 */
function activatePublishing(factory: PluginFactory): {
    harness: Harness;
    activation: ReturnType<typeof runActivation>;
    published: PublishedState | null;
} {
    const plugin = factory();
    const harness = makeHarness(sdkChromeId(plugin));
    const activation = runActivation(plugin, harness.host);
    expect(primaryErrors(harness.errors), 'activation succeeds').toEqual([]);
    return {
        harness,
        activation,
        published: harness.state.getPluginState(
            harness.pluginId,
        ) as PublishedState | null,
    };
}

/**
 * Every member a published state exposes: own properties plus inherited
 * accessors and methods (a published state is as often a class instance as an
 * object literal), minus the seam. Commands are members too — `play()` is
 * exactly the kind of thing the classification exists to declare.
 *
 * This is reflection, so it sees exactly what a host sees. A TypeScript
 * `private` field is an ordinary own property at runtime and shows up here; a
 * `#private` field or a closure variable does not.
 */
function publishedMembers(published: object): string[] {
    const members = new Set(Object.keys(published));
    let proto: object | null = Object.getPrototypeOf(published) as
        | object
        | null;
    while (proto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            if (name !== 'constructor') members.add(name);
        }
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return [...members].filter((m) => !PUBLISHED_STATE_SEAM.has(m)).sort();
}

/** The three classifications a published member may declare. */
const CLASSIFICATIONS: ReadonlySet<string> =
    new Set<PublishedStateClassification>([
        'command',
        'observable',
        'queryOnly',
    ]);

/** Current values of the members the plugin declared `observable`. */
function readObservables(published: PublishedState): Map<string, unknown> {
    const values = new Map<string, unknown>();
    for (const [member, classification] of Object.entries(
        published.stateInventory ?? {},
    )) {
        if (classification !== 'observable') continue;
        values.set(
            member,
            (published as unknown as Record<string, unknown>)[member],
        );
    }
    return values;
}

/** How deep {@link sameObservedValue} compares before falling back to identity. */
const COMPARE_DEPTH = 8;

/**
 * Whether two successive reads of an observable member are the same VALUE.
 *
 * Reference identity alone is the wrong test: a derived member (`get
 * activeCues() { return this.#cues.filter(...) }`) hands back a fresh array on
 * every read, so a state that never moved would look like it changed on every
 * flush. Structural for arrays and plain objects, identity for everything else
 * — and identity again past {@link COMPARE_DEPTH}, so a self-referential value
 * cannot hang the suite.
 */
function sameObservedValue(a: unknown, b: unknown, depth = 0): boolean {
    if (Object.is(a, b)) return true;
    if (depth >= COMPARE_DEPTH) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
        return (
            a.length === b.length &&
            a.every((item, i) => sameObservedValue(item, b[i], depth + 1))
        );
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);
        return (
            keys.length === Object.keys(b).length &&
            keys.every(
                (key) =>
                    key in b && sameObservedValue(a[key], b[key], depth + 1),
            )
        );
    }
    return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
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
    {
        name: 'classifies every member of the state it publishes',
        async run(factory) {
            const { activation, published } = activatePublishing(factory);
            if (published) {
                expect(
                    typeof published.subscribe,
                    'published state exposes a batched, payload-free subscribe',
                ).toBe('function');
                expect(
                    published.stateInventory,
                    'published state declares a stateInventory classifying its members',
                ).toBeTypeOf('object');

                const inventory: Record<string, unknown> =
                    published.stateInventory;

                const unclassified = publishedMembers(published).filter(
                    (member) => !(member in inventory),
                );
                expect(
                    unclassified,
                    `every published member is classified command | observable | queryOnly. Unclassified: ${unclassified.join(', ')}. Everything reflection can see is part of the published contract, so internal bookkeeping (a listener set, a media element, a timer id) must be UNREACHABLE rather than merely undocumented: use a \`#private\` field or a closure variable. A TypeScript \`private\` is erased at compile time and stays visible here.`,
                ).toEqual([]);

                // A classification is only worth checking if it says something:
                // a typo'd value, or a key naming a member that does not exist,
                // would otherwise satisfy a presence-only test forever.
                const invalid = Object.entries(inventory)
                    .filter(
                        ([, value]) => !CLASSIFICATIONS.has(value as string),
                    )
                    .map(([member, value]) => `${member}: ${String(value)}`);
                expect(
                    invalid,
                    'every classification is one of command | observable | queryOnly',
                ).toEqual([]);

                const phantom = Object.keys(inventory).filter(
                    (member) => !(member in published),
                );
                expect(
                    phantom,
                    'every classified name is a member the state actually exposes',
                ).toEqual([]);
            }
            activation.deactivate();
        },
    },
    {
        name: 'wakes published-state subscribers when an observable member is seen to change (spot check: the kit cannot drive the plugin, and does not attribute the wake-up to a member)',
        async run(factory) {
            const { activation, published } = activatePublishing(factory);
            if (published) {
                let notifications = 0;
                const unsubscribe = published.subscribe(() => {
                    notifications += 1;
                });

                // What this DOES check: an observable member that moves on the
                // plugin's own schedule (a timer, a media element's events)
                // while its subscribers sleep — the silent-staleness failure
                // with no other detector.
                //
                // What it does NOT check, and cannot: the kit has no way to
                // drive a plugin's own state, so a state that stays still in
                // this window passes vacuously; and it counts notifications
                // without attributing them, so a state noisy for an unrelated
                // reason passes while one of its members is stale. Per-member
                // correlation is the publishing plugin's own test to write.
                const before = readObservables(published);
                await flush();
                const changed = [...readObservables(published)]
                    .filter(
                        ([member, value]) =>
                            !sameObservedValue(before.get(member), value),
                    )
                    .map(([member]) => member);

                if (changed.length > 0) {
                    expect(
                        notifications,
                        `observable member(s) ${changed.join(
                            ', ',
                        )} changed value across one flush and NO published-state subscriber was woken. (This check only proves that something woke them — it does not verify which member the notification was for.)`,
                    ).toBeGreaterThan(0);
                }

                unsubscribe();
            }
            activation.deactivate();
        },
    },
    {
        name: 'retires its published state when the activation ends',
        async run(factory) {
            const { harness, activation } = activatePublishing(factory);

            activation.deactivate();

            expect(
                harness.state.getPluginState(harness.pluginId),
                'no published state outlives its activation',
            ).toBeNull();
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
