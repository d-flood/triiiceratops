// SDK test-kit unit tests (ticket 14).
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

// Smoke-check that the public registrar wires vitest cases without throwing at
// registration time (the individual cases are exercised above).
runPluginConformance(makeGoodPlugin);
