// SDK test-kit unit tests (ticket 14).
//
// Proves the kit against the REAL compiled headless `ViewerState`:
//  - a command notifies a plugin selector only AFTER `flush()` (real batching,
//    not fake-synchronous);
//  - the recording doubles capture style installs/releases and ui requests;
//  - `setOsdViewer` flips OSD readiness and `whenOsdReady` resolves;
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
    whenOsdReady,
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

describe('injectable OSD stub', () => {
    it('defaults to absent, then setOsdViewer flips readiness and whenOsdReady resolves', async () => {
        const tc = createTestViewerContext();
        expect(tc.viewerState.osdViewer).toBeNull();

        const pending = whenOsdReady(tc.viewerState);
        const stub = { viewport: {} };
        tc.setOsdViewer(stub);
        await flush();

        await expect(pending).resolves.toBe(stub);
        expect(tc.viewerState.osdViewer).toBe(stub);
    });

    it('whenOsdReady resolves synchronously when OSD is already present', async () => {
        const tc = createTestViewerContext();
        const stub = { viewport: {} };
        tc.setOsdViewer(stub);
        await expect(whenOsdReady(tc.viewerState)).resolves.toBe(stub);
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
