// SDK test-kit unit tests.
//
// Proves the kit against the REAL compiled headless `ViewerState`:
//  - a command notifies a plugin selector only AFTER `flush()` (real batching,
//    not fake-synchronous);
//  - the recording doubles capture style installs/releases and ui requests;
//  - `attachRenderer` flips renderer readiness and `whenRendererReady`
//    resolves, and the mounted stand-in carries the viewport queries;
//  - the conformance suite passes for a well-behaved plugin and the
//    subscription-disposal check FAILS for a deliberately-leaky one.

import { describe, expect, it } from 'vitest';

import type { PluginContext, PluginHost, SdkPlugin } from 'triiiceratops';
import {
    CORE_VERSION,
    capabilities,
    pluginApiVersion,
} from 'triiiceratops/testing';

import { activatePlugin } from '../activate.js';
import { definePlugin } from '../definePlugin.js';
import { svgIcon } from '../svgIcon.js';
import {
    conformanceCases,
    createTestViewerContext,
    flush,
    runPluginConformance,
    whenRendererReady,
} from './index.js';

const ICON = svgIcon('<svg viewBox="0 0 1 1"><path d="M0 0h1v1H0z" /></svg>');

/**
 * A well-behaved "tracer"-style plugin: it selects state, installs a style,
 * renders its icon, subscribes to the active locale, and tears every one of
 * those down in its returned cleanup. Fresh per call.
 */
function makeGoodPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-good-fixture',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        catalog: { en: { hi: 'Hello' }, de: { hi: 'Hallo' } },
        view: {
            mount(container: HTMLElement, context: PluginContext) {
                const uninstall = context.styles.install(
                    '.tri-kit-good{}',
                    'main',
                );
                context.ui.renderIcon(ICON, container);
                const selector = context.selectors.select((s) => s.toolbarOpen);
                const stopSelector = selector.subscribe(() => {});
                const stopLocale = context.locale.subscribe(() => {});
                const node = document.createElement('span');
                node.textContent = context.locale.t('hi');
                container.appendChild(node);
                return () => {
                    stopSelector();
                    stopLocale();
                    uninstall();
                    node.remove();
                };
            },
        },
    });
}

/**
 * A deliberately-leaky plugin: it subscribes to the viewer state directly and
 * forgets to unsubscribe in its cleanup — so its subscription outlives
 * deactivation. Fresh per call.
 */
function makeLeakyPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-leaky-fixture',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                // BUG: never unsubscribed.
                context.viewerState.subscribe(() => {});
                return () => {
                    /* forgot to unsubscribe */
                };
            },
        },
    });
}

/**
 * A plugin that publishes state (ADR 0018), fully classified. `paused` is the
 * observable member; `play` is the command; `currentTime` is the query-only
 * one, on its own finer cadence. Nothing here moves on its own, so it also
 * demonstrates the vacuous pass of the notification check.
 */
function makePublishingPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-publishing-fixture',
        uiId: 'kit-publishing',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                context.publishState({
                    stateInventory: {
                        play: 'command',
                        paused: 'observable',
                        currentTime: 'queryOnly',
                    },
                    play: () => {},
                    paused: true,
                    currentTime: 0,
                    subscribe: () => () => {},
                    subscribeFrame: () => () => {},
                });
                return () => {};
            },
        },
    });
}

/**
 * The shape ticket 07's `AVState` will have: a CLASS with a `#private` listener
 * set and a derived getter.
 *
 * Both are conformance traps the kit must not spring. `#listeners` is invisible
 * to reflection, so it needs no classification — where a TypeScript `private`
 * would be an ordinary own property and would have to be classified or hidden.
 * And `cues` is derived: it hands back a fresh array on every read, which an
 * identity comparison would read as "this member changes every flush".
 */
class FixtureAvState {
    #listeners = new Set<() => void>();
    #cues: readonly string[] = ['one', 'two'];

    readonly stateInventory = {
        play: 'command',
        paused: 'observable',
        cues: 'observable',
        currentTime: 'queryOnly',
    } as const;

    paused = true;
    currentTime = 0;

    get cues(): string[] {
        return [...this.#cues];
    }

    play(): void {
        this.paused = false;
        for (const listener of this.#listeners) listener();
    }

    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}

function makeClassPublishingPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-class-fixture',
        uiId: 'kit-class',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                context.publishState(new FixtureAvState());
                return () => {};
            },
        },
    });
}

/** Publishes a `duration` member it forgot to classify. */
function makeUnclassifiedPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-unclassified-fixture',
        uiId: 'kit-unclassified',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                context.publishState({
                    stateInventory: { paused: 'observable' },
                    paused: true,
                    // BUG: published, never classified.
                    duration: 12,
                    subscribe: () => () => {},
                });
                return () => {};
            },
        },
    });
}

/**
 * Publishes a `paused` member classified with a word that is not one of the
 * three — the failure a presence-only check (`member in stateInventory`) would
 * wave through, along with `undefined` and every other stray value.
 */
function makeMisclassifiedPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-misclassified-fixture',
        uiId: 'kit-misclassified',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                context.publishState({
                    // BUG: `readonly` is not a classification.
                    stateInventory: { paused: 'readonly' } as unknown as Record<
                        string,
                        'observable'
                    >,
                    paused: true,
                    subscribe: () => () => {},
                });
                return () => {};
            },
        },
    });
}

/** Classifies a member that does not exist — a typo for `paused`. */
function makePhantomClassificationPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-phantom-fixture',
        uiId: 'kit-phantom',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                context.publishState({
                    stateInventory: {
                        paused: 'observable',
                        // BUG: nothing is named this.
                        pasued: 'observable',
                    },
                    paused: true,
                    subscribe: () => () => {},
                });
                return () => {};
            },
        },
    });
}

/**
 * Publishes an observable member that flips on its own schedule without ever
 * waking a subscriber — the silent-staleness failure the notification check
 * exists to catch.
 */
function makeSilentPlugin(): SdkPlugin {
    return definePlugin({
        name: '@triiiceratops/kit-silent-fixture',
        uiId: 'kit-silent',
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: 'panel',
        view: {
            mount(_container: HTMLElement, context: PluginContext) {
                const published = {
                    stateInventory: { paused: 'observable' } as const,
                    paused: true,
                    subscribe: () => () => {},
                };
                context.publishState(published);
                // BUG: changes the fact, notifies nobody.
                queueMicrotask(() => {
                    published.paused = false;
                });
                return () => {};
            },
        },
    });
}

function hostFor(tc: ReturnType<typeof createTestViewerContext>): PluginHost {
    return {
        container: document.createElement('div'),
        viewerState: tc.viewerState,
        coreVersion: CORE_VERSION,
        pluginApiVersion,
        capabilities,
        styles: tc.styles,
        locale: tc.locale,
        ui: tc.ui,
    };
}

describe('test viewer context: real batched notifications', () => {
    it('delivers a selector notification only after flush() (not synchronously)', async () => {
        const { context, viewerState } = createTestViewerContext();
        const open = context.selectors.select((s) => s.toolbarOpen);

        let seen = open.get();
        let calls = 0;
        const stop = open.subscribe((value) => {
            seen = value;
            calls += 1;
        });

        expect(seen).toBe(false);

        viewerState.toggleToolbar();
        // Batched: nothing delivered synchronously inside the command.
        expect(calls, 'no synchronous delivery inside the command').toBe(0);

        await flush();
        expect(seen, 'value delivered on the flush').toBe(true);
        expect(calls, 'exactly one batched notification').toBe(1);

        stop();
    });

    it('collapses multiple changes in one tick into a single notification', async () => {
        const { context, viewerState } = createTestViewerContext();
        const open = context.selectors.select((s) => s.toolbarOpen);
        let calls = 0;
        const stop = open.subscribe(() => {
            calls += 1;
        });

        viewerState.toggleToolbar(); // false -> true
        viewerState.toggleThumbnailGallery(); // unrelated, same tick
        await flush();

        expect(calls, 'one batched notification for the selected change').toBe(
            1,
        );
        stop();
    });
});

describe('recording doubles', () => {
    it('capture style installs/releases and ui requests across activation', () => {
        const tc = createTestViewerContext();
        const activation = activatePlugin(makeGoodPlugin(), hostFor(tc));

        expect(tc.styles.installed.map((s) => s.id)).toContain('main');
        expect(
            tc.styles.installed.find((s) => s.id === 'main')?.released,
            'style still installed while active',
        ).toBe(false);
        expect(tc.ui.requests, 'icon render recorded').toHaveLength(1);
        expect(tc.ui.requests[0]?.icon).toBe(ICON);

        activation.deactivate();
        expect(
            tc.styles.installed.every((s) => s.released),
            'every installed style released on deactivation',
        ).toBe(true);
    });

    it('locale double runs the real logic and records switches', async () => {
        const tc = createTestViewerContext({
            catalog: { en: { hi: 'Hello' }, de: { hi: 'Hallo' } },
        });
        expect(tc.locale.t('hi')).toBe('Hello');

        let observed: string | null = null;
        const stop = tc.locale.subscribe((locale) => {
            observed = locale;
        });

        tc.locale.setLocale('de');
        await flush();

        expect(tc.locale.current).toBe('de');
        expect(tc.locale.t('hi'), 'real catalog resolution').toBe('Hallo');
        expect(observed, 'subscriber woke on the flush').toBe('de');
        expect(tc.locale.switches).toEqual(['de']);
        stop();
    });
});

describe('mountable renderer stand-in', () => {
    it('defaults to absent, then attachRenderer flips readiness and whenRendererReady resolves', async () => {
        const tc = createTestViewerContext();
        expect(tc.viewerState.rendererReady).toBe(false);
        // Before a renderer, the viewport answers honestly rather than making
        // every caller guard: zero scale, no centre, no bounds.
        expect(tc.viewerState.viewportScale).toBe(0);
        expect(tc.viewerState.viewportCentre).toBeNull();

        const pending = whenRendererReady(tc.viewerState);
        tc.attachRenderer({ scale: 3 });
        await flush();

        await expect(pending).resolves.toBeUndefined();
        expect(tc.viewerState.rendererReady).toBe(true);
        expect(tc.viewerState.viewportScale).toBe(3);
    });

    it('whenRendererReady resolves synchronously when a renderer is already mounted', async () => {
        const tc = createTestViewerContext();
        tc.attachRenderer();
        await expect(
            whenRendererReady(tc.viewerState),
        ).resolves.toBeUndefined();
    });

    // Readiness is not permanent: a renderer that unmounts takes the viewport
    // queries with it, and a plugin holding a stale reading would be placing
    // things over an image that is no longer there.
    it('goes back to not-ready when the renderer unmounts', async () => {
        const tc = createTestViewerContext();
        tc.attachRenderer({ scale: 2 });
        await flush();
        expect(tc.viewerState.rendererReady).toBe(true);

        tc.detachRenderer();
        await flush();

        expect(tc.viewerState.rendererReady).toBe(false);
        expect(tc.viewerState.viewportScale).toBe(0);
    });

    it('routes a viewport command to the mounted renderer', async () => {
        const tc = createTestViewerContext();
        const renderer = tc.attachRenderer({ scale: 1 });

        tc.viewerState.zoomIn();

        // Attaching replays the adjustment set, so the zoom is not the first
        // call the renderer sees — only the first COMMAND.
        expect(renderer.calls.map(([name]) => name)).toContain('zoomBy');
        expect(tc.viewerState.viewportScale).toBeGreaterThan(1);
    });

    // The abort path exists so a plugin that tears down before a renderer ever
    // mounts leaves no dangling `ViewerState.subscribe` behind. Untested, a
    // helper that resolved-instead-of-rejected, or that forgot to unsubscribe,
    // would look identical from outside.
    it('whenRendererReady rejects and unsubscribes when the wait is aborted', async () => {
        const tc = createTestViewerContext();
        const controller = new AbortController();
        const reason = new Error('plugin torn down');

        const pending = whenRendererReady(tc.viewerState, {
            signal: controller.signal,
        });
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);

        // The subscription is gone: a renderer mounting afterwards must not
        // wake a settled promise's listener.
        tc.attachRenderer();
        await flush();
        await expect(pending).rejects.toBe(reason);
    });

    it('whenRendererReady rejects immediately for an already-aborted signal', async () => {
        const tc = createTestViewerContext();
        const reason = new Error('already gone');

        await expect(
            whenRendererReady(tc.viewerState, {
                signal: AbortSignal.abort(reason),
            }),
        ).rejects.toBe(reason);
    });

    // Readiness is a state, not a one-shot event. A plugin that survives a
    // renderer swap (the development-only renderer flag, or a host remounting)
    // must be able to ask again and be answered again.
    it('resolves a SECOND whenRendererReady after an unmount and remount', async () => {
        const tc = createTestViewerContext();
        tc.attachRenderer({ scale: 2 });
        await flush();
        await expect(
            whenRendererReady(tc.viewerState),
        ).resolves.toBeUndefined();

        tc.detachRenderer();
        await flush();
        expect(tc.viewerState.rendererReady).toBe(false);

        const pending = whenRendererReady(tc.viewerState);
        const remounted = tc.attachRenderer({ scale: 5 });
        await flush();

        await expect(pending).resolves.toBeUndefined();
        expect(tc.viewerState.rendererReady).toBe(true);
        expect(tc.viewerState.viewportScale).toBe(5);
        expect(remounted.frameListenerCount).toBe(0);
    });

    // The port's honest-absence rule: a host that cannot answer for the canvas
    // asked about answers `null` rather than answering for a different one. A
    // stand-in that always answered would pass an overlay's tests and then draw
    // nothing against a real viewer in individuals or paged mode.
    it('answers null for a canvas the stand-in was not given', async () => {
        const tc = createTestViewerContext();
        tc.attachRenderer({ scale: 2, canvasIds: ['canvas-1'] });

        expect(
            tc.viewerState.canvasToScreen({ x: 0, y: 0 }, 'canvas-1'),
        ).not.toBeNull();
        expect(
            tc.viewerState.canvasToScreen({ x: 0, y: 0 }, 'canvas-9'),
        ).toBeNull();
        expect(
            tc.viewerState.screenToCanvas({ x: 0, y: 0 }, 'canvas-9'),
        ).toBeNull();
        // And the default — no `canvasIds` — still answers for anything, which
        // is what a single-canvas test wants.
        const anything = createTestViewerContext();
        anything.attachRenderer({ scale: 2 });
        expect(
            anything.viewerState.canvasToScreen({ x: 0, y: 0 }, 'canvas-9'),
        ).not.toBeNull();
    });

    // The image-adjustment command replaces reaching into the renderer's DOM
    // node, so the set has to reach a renderer that mounts AFTER it was set.
    it('replays image adjustments onto a renderer mounted later', () => {
        const tc = createTestViewerContext();
        tc.viewerState.setImageAdjustments({ brightness: 130, invert: true });

        const renderer = tc.attachRenderer();

        expect(renderer.adjustments.brightness).toBe(130);
        expect(renderer.adjustments.invert).toBe(true);
        // Unset members keep their neutral values.
        expect(renderer.adjustments.contrast).toBe(100);
    });
});

describe('plugin surface: real, not a double', () => {
    it('starts open by default so a surface-gated plugin is exercised active', () => {
        const tc = createTestViewerContext();

        expect(tc.surface.id).toBe('test-plugin');
        expect(tc.surface.isOpen).toBe(true);
        expect(tc.surface.target).toBe('panel');
        expect(tc.context.surface).toBe(tc.surface);
    });

    it('honors uiId, target, and a closed-on-mount start', () => {
        const tc = createTestViewerContext({
            uiId: 'my-plugin',
            target: 'flyout',
            open: false,
        });

        expect(tc.surface.id).toBe('my-plugin');
        expect(tc.surface.target).toBe('flyout');
        expect(tc.surface.isOpen).toBe(false);
    });

    it('lets a fixture config override the default open state', () => {
        const tc = createTestViewerContext({
            uiId: 'my-plugin',
            fixtures: { config: { plugins: { 'my-plugin': { open: false } } } },
        });

        expect(tc.surface.isOpen).toBe(false);
    });

    it('drives a plugin selector through the real batched flush', async () => {
        // The surface is the real projection over the real state, so a plugin
        // observing `surface.isOpen` reacts on production timing — the same
        // batched flush every other viewer change lands on.
        const tc = createTestViewerContext({ open: false });
        const open = tc.context.selectors.select(
            () => tc.context.surface.isOpen,
        );

        const seen: boolean[] = [open.get()];
        const stop = open.subscribe((value) => seen.push(value));

        tc.surface.open();
        expect(seen, 'no synchronous delivery').toEqual([false]);
        await flush();
        expect(seen).toEqual([false, true]);

        tc.surface.toggle();
        await flush();
        expect(seen).toEqual([false, true, false]);

        // Driving the viewer directly reaches the plugin identically — the
        // surface is not a separate channel.
        tc.viewerState.togglePluginOpen('test-plugin');
        await flush();
        expect(seen).toEqual([false, true, false, true]);

        stop();
        tc.dispose();
    });

    it('reflects a target change made after mount', async () => {
        const tc = createTestViewerContext({ uiId: 'movable' });
        expect(tc.surface.target).toBe('panel');

        tc.viewerState.setPluginTarget('movable', 'flyout');
        await flush();

        expect(tc.surface.target).toBe('flyout');
        tc.dispose();
    });
});

describe('conformance: a well-behaved plugin passes every case', () => {
    for (const conformanceCase of conformanceCases) {
        it(conformanceCase.name, async () => {
            await conformanceCase.run(makeGoodPlugin);
        });
    }
});

describe('conformance: a deliberately-leaky plugin is caught', () => {
    it('fails the subscription-disposal case', async () => {
        const subscriptionCase = conformanceCases.find((c) =>
            c.name.startsWith('disposes every viewer-state subscription'),
        );
        expect(
            subscriptionCase,
            'subscription-disposal case exists',
        ).toBeDefined();
        await expect(subscriptionCase!.run(makeLeakyPlugin)).rejects.toThrow();
    });

    it('still passes mount/cleanup symmetry (leak is isolated to subscriptions)', async () => {
        const symmetryCase = conformanceCases.find((c) =>
            c.name.startsWith('mounts once'),
        );
        await expect(
            symmetryCase!.run(makeLeakyPlugin),
        ).resolves.toBeUndefined();
    });
});

describe('conformance: published state (ADR 0018)', () => {
    function caseNamed(prefix: string) {
        const found = conformanceCases.find((c) => c.name.startsWith(prefix));
        expect(found, `conformance case "${prefix}" exists`).toBeDefined();
        return found!;
    }

    for (const conformanceCase of conformanceCases) {
        it(`a publishing plugin passes: ${conformanceCase.name}`, async () => {
            await conformanceCase.run(makePublishingPlugin);
        });
    }

    // A published state is as often a class as an object literal, and ticket
    // 07's `AVState` is one. Its `#private` bookkeeping is invisible to
    // reflection, so it needs no classification; its derived `cues` getter hands
    // back a fresh array on every read and must not read as a change.
    for (const conformanceCase of conformanceCases) {
        it(`a class-based publishing plugin passes: ${conformanceCase.name}`, async () => {
            await conformanceCase.run(makeClassPublishingPlugin);
        });
    }

    it('rejects a published member with no classification, and says how to hide it', async () => {
        const failure = caseNamed('classifies every member').run(
            makeUnclassifiedPlugin,
        );
        await expect(failure).rejects.toThrow(
            /every published member is classified/,
        );
        // The actionable half: a TypeScript `private` field is an ordinary own
        // property at runtime and lands here, so the message has to name the
        // fix rather than only the symptom.
        await expect(failure).rejects.toThrow(/#private/);
    });

    it('rejects a classification that is not one of the three', async () => {
        await expect(
            caseNamed('classifies every member').run(makeMisclassifiedPlugin),
        ).rejects.toThrow(/paused: readonly/);
    });

    it('rejects a classification naming a member that does not exist', async () => {
        await expect(
            caseNamed('classifies every member').run(
                makePhantomClassificationPlugin,
            ),
        ).rejects.toThrow(/every classified name is a member/);
    });

    it('rejects an observable member that changes without notifying', async () => {
        await expect(
            caseNamed('wakes published-state subscribers').run(
                makeSilentPlugin,
            ),
        ).rejects.toThrow(/paused.*NO published-state subscriber was woken/s);
    });

    it('reads the published state back through viewer state, and only while active', async () => {
        const tc = createTestViewerContext({ uiId: 'kit-publishing' });
        const activation = activatePlugin(makePublishingPlugin(), {
            ...hostFor(tc),
            surface: tc.surface,
        });

        const published = tc.viewerState.getPluginState('kit-publishing');
        expect(
            published,
            'a host reaches it through viewerState',
        ).not.toBeNull();
        expect(tc.viewerState.getPluginState('other')).toBeNull();

        activation.deactivate();
        expect(tc.viewerState.getPluginState('kit-publishing')).toBeNull();
    });

    it('notifies viewer-state subscribers when a plugin publishes and retires', async () => {
        const tc = createTestViewerContext({ uiId: 'kit-publishing' });
        let notifications = 0;
        const unsubscribe = tc.viewerState.subscribe(() => {
            notifications += 1;
        });

        const activation = activatePlugin(makePublishingPlugin(), {
            ...hostFor(tc),
            surface: tc.surface,
        });
        await flush();
        expect(notifications, 'publishing wakes the state watcher').toBe(1);

        activation.deactivate();
        await flush();
        expect(notifications, 'retiring wakes it again').toBe(2);

        unsubscribe();
    });
});

// Smoke-check that the public registrar wires vitest cases without throwing at
// registration time (the individual cases are exercised above).
runPluginConformance(makeGoodPlugin);
