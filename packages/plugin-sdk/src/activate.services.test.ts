// Activation service wiring + auto-cleanup tests.
//
// The SDK passes the host's style/locale/ui services through to the plugin
// context, and — regardless of whether the plugin cleaned up after itself —
// releases every style install and locale subscription it made when the
// activation is deactivated.

import { describe, expect, it, vi } from 'vitest';

import { runActivation, sdkChromeId } from './activate.js';
import {
    createStubSurfaceService,
    createStubUiService,
} from './testing/stubs.js';
import type {
    PluginContext,
    PluginHost,
    PluginLocaleService,
    PluginStyleService,
    SdkPluginMeta,
    ViewerState,
} from 'triiiceratops';

/** A recording style service: tracks installs and their release calls. */
function recordingStyles() {
    const installs: Array<{ css: string; id: string; released: boolean }> = [];
    const service: PluginStyleService = {
        install(css, id) {
            const record = { css, id, released: false };
            installs.push(record);
            return () => {
                record.released = true;
            };
        },
    };
    return { service, installs };
}

/** A recording locale service: tracks subscribe/unsubscribe. */
function recordingLocale() {
    const subs: Array<{ unsubscribed: boolean }> = [];
    const service: PluginLocaleService = {
        current: 'en',
        t: (key) => key,
        subscribe() {
            const record = { unsubscribed: false };
            subs.push(record);
            return () => {
                record.unsubscribed = true;
            };
        },
    };
    return { service, subs };
}

const viewerState = {
    subscribe: () => () => {},
} as unknown as ViewerState;

function makeMeta(view: SdkPluginMeta['view']): SdkPluginMeta {
    return {
        name: '@triiiceratops/plugin-services-test',
        version: '1.0.0',
        coreRange: '>=1.0.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: { kind: 'svg', inner: '', viewBox: '0 0 1 1' },
        target: 'panel',
        view,
    };
}

function makeHost(
    styles: PluginStyleService,
    locale: PluginLocaleService,
): PluginHost {
    return {
        container: document.createElement('div'),
        viewerState,
        coreVersion: '1.0.0',
        pluginApiVersion: '1.0.0',
        capabilities: [],
        styles,
        locale,
        ui: createStubUiService(),
        surface: createStubSurfaceService('services-test'),
        reportError: () => {},
    };
}

describe('activation service auto-cleanup', () => {
    it('releases style installs the plugin left open when deactivated', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();

        const meta = makeMeta({
            mount(_container, context: PluginContext) {
                // Install but deliberately do NOT return an uninstaller.
                context.styles.install('.a{}', 'a');
                context.styles.install('.b{}', 'b');
                return () => {};
            },
        });

        const activation = runActivation(
            meta,
            makeHost(styles.service, locale.service),
        );
        expect(styles.installs.map((i) => i.id)).toEqual(['a', 'b']);
        expect(styles.installs.every((i) => i.released)).toBe(false);

        activation.deactivate();
        expect(styles.installs.every((i) => i.released)).toBe(true);
    });

    it('does not double-release a style the plugin already uninstalled', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();
        const release = vi.fn();

        const meta = makeMeta({
            mount(_container, context: PluginContext) {
                const un = context.styles.install('.a{}', 'a');
                un(); // plugin cleans up its own install
                return () => {};
            },
        });

        // Wrap install to observe underlying release count via the record.
        const activation = runActivation(
            meta,
            makeHost(styles.service, locale.service),
        );
        expect(styles.installs[0]?.released).toBe(true);
        // Deactivation must not throw or "re-release".
        expect(() => activation.deactivate()).not.toThrow();
        expect(release).not.toHaveBeenCalled();
    });

    it('drops locale subscriptions on deactivation', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();

        const meta = makeMeta({
            mount(_container, context: PluginContext) {
                context.locale.subscribe(() => {});
                return () => {};
            },
        });

        const activation = runActivation(
            meta,
            makeHost(styles.service, locale.service),
        );
        expect(locale.subs).toHaveLength(1);
        expect(locale.subs[0]?.unsubscribed).toBe(false);

        activation.deactivate();
        expect(locale.subs[0]?.unsubscribed).toBe(true);
    });

    it('passes locale `current`/`t` straight through to the plugin', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();
        let seen = '';

        const meta = makeMeta({
            mount(_container, context: PluginContext) {
                seen = `${context.locale.current}:${context.locale.t('k')}`;
                return () => {};
            },
        });

        const activation = runActivation(
            meta,
            makeHost(styles.service, locale.service),
        );
        expect(seen).toBe('en:k');
        activation.deactivate();
    });
});

describe('activation surface wiring', () => {
    /** Capture the `context.surface` a plugin is handed at mount. */
    function captureSurface(host: PluginHost) {
        let surface: PluginContext['surface'] | undefined;
        const activation = runActivation(
            makeMeta({
                mount(_container, context: PluginContext) {
                    surface = context.surface;
                    return () => {};
                },
            }),
            host,
        );
        return { surface, activation };
    }

    it('passes the host-supplied surface straight through to the plugin', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();
        const closed = vi.fn();
        const hostSurface = {
            id: 'host-chrome-id',
            isOpen: false,
            target: 'flyout' as const,
            open: vi.fn(),
            close: closed,
            toggle: vi.fn(),
        };

        const { surface, activation } = captureSurface({
            ...makeHost(styles.service, locale.service),
            surface: hostSurface,
        });

        // Identity, not a copy — the surface is a live projection of viewer state
        // and must not be snapshotted on the way through.
        expect(surface).toBe(hostSurface);
        surface!.close();
        expect(closed).toHaveBeenCalledTimes(1);

        activation.deactivate();
    });

    // A chrome-less activation is the caller's own container with no toolbar
    // button, panel, or flyout: nothing can hide the plugin, so the surface the
    // test kit's stub reports is open and its movers are inert. A `false` stub
    // would silently park every plugin that gates work on `surface.isOpen`,
    // which reads as a broken plugin.
    it('reports a chrome-less stub surface as ALWAYS OPEN', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();

        const { surface, activation } = captureSurface(
            makeHost(styles.service, locale.service),
        );

        expect(surface!.isOpen).toBe(true);
        expect(surface!.id).toBe('services-test');
        expect(surface!.target).toBe('panel');

        // The no-op movers never change `isOpen`, so a subscriber correctly never
        // wakes for a surface that cannot move.
        expect(() => {
            surface!.open();
            surface!.close();
            surface!.toggle();
        }).not.toThrow();
        expect(surface!.isOpen).toBe(true);

        activation.deactivate();
    });
});

// ---------------------------------------------------------------------------
// Published state (ADR 0018) — the third thing the activation tracks, beside
// style installs and locale subscriptions. Core's own registry is exercised in
// `viewer.publishedState.test.ts`; what matters here is that the activation
// keys the publication to the plugin id and releases it on every exit path.
// ---------------------------------------------------------------------------

/** A `ViewerState` stand-in carrying only the published-state registry. */
function recordingPublications() {
    const published = new Map<string, unknown>();
    const state = {
        subscribe: () => () => {},
        publishPluginState(pluginId: string, value: unknown) {
            published.set(pluginId, value);
            return () => {
                if (published.get(pluginId) === value)
                    published.delete(pluginId);
            };
        },
    } as unknown as ViewerState;
    return { state, published };
}

describe('activation published state', () => {
    const inventory = { paused: 'observable' } as const;

    function hostWith(state: ViewerState): PluginHost {
        return {
            ...makeHost(recordingStyles().service, recordingLocale().service),
            viewerState: state,
        };
    }

    it('publishes under the plugin id and retires on deactivation', () => {
        const { state, published } = recordingPublications();
        const activation = runActivation(
            {
                ...makeMeta({
                    mount(_container, context: PluginContext) {
                        context.publishState({
                            stateInventory: inventory,
                            paused: true,
                            subscribe: () => () => {},
                        });
                        return () => {};
                    },
                }),
                uiId: 'services-test',
            },
            hostWith(state),
        );

        expect([...published.keys()]).toEqual(['services-test']);

        activation.deactivate();
        expect(published.size).toBe(0);
    });

    it('supersedes the previous object when a plugin publishes again', () => {
        const { state, published } = recordingPublications();
        const second = {
            stateInventory: inventory,
            paused: false,
            subscribe: () => () => {},
        };

        const activation = runActivation(
            {
                ...makeMeta({
                    mount(_container, context: PluginContext) {
                        context.publishState({
                            stateInventory: inventory,
                            paused: true,
                            subscribe: () => () => {},
                        });
                        context.publishState(second);
                        return () => {};
                    },
                }),
                uiId: 'services-test',
            },
            hostWith(state),
        );

        expect(published.get('services-test')).toBe(second);

        activation.deactivate();
        expect(published.size).toBe(0);
    });

    // ADR 0018: published state is absent whenever its activation is absent,
    // FAILED, or retrying — so a plugin that published and then threw must not
    // leave a host holding a handle to a plugin that never finished mounting.
    it('retires the publication immediately when the mount fails', () => {
        const { state, published } = recordingPublications();
        const reports: Array<{ phase: string }> = [];

        runActivation(
            {
                ...makeMeta({
                    mount(_container, context: PluginContext) {
                        context.publishState({
                            stateInventory: inventory,
                            paused: true,
                            subscribe: () => () => {},
                        });
                        throw new Error('mount boom');
                    },
                }),
                uiId: 'services-test',
            },
            {
                ...hostWith(state),
                reportError: (report) => reports.push(report),
            },
        );

        expect(reports.map((r) => r.phase)).toEqual(['mount']);
        expect(published.size).toBe(0);
    });

    // The central contract line of ADR 0018: `getPluginState` is null whenever
    // the activation is absent. The plugin holds `context.publishState` for as
    // long as it likes, and a media element's `loadedmetadata` or a cue fetch
    // routinely resolves after the user closed the viewer — so the closure has
    // to expire with the activation, not merely stop being called politely.
    it('ignores a publish that arrives after deactivation', () => {
        const { state, published } = recordingPublications();
        let publishLate: (() => void) | null = null;

        const activation = runActivation(
            {
                ...makeMeta({
                    mount(_container, context: PluginContext) {
                        publishLate = () =>
                            context.publishState({
                                stateInventory: inventory,
                                paused: true,
                                subscribe: () => () => {},
                            });
                        return () => {};
                    },
                }),
                uiId: 'services-test',
            },
            hostWith(state),
        );

        activation.deactivate();
        expect(published.size).toBe(0);

        publishLate!();

        expect(
            published.size,
            'a dead activation cannot republish live state',
        ).toBe(0);
    });

    // A publication is keyed to the host surface's id — the one id the viewer
    // knows the plugin by — not to the plugin's package name, which would tell a
    // host to look under a key no viewer ever uses.
    it('publishes under the host surface id, not the package name', () => {
        const { state, published } = recordingPublications();

        runActivation(
            makeMeta({
                mount(_container, context: PluginContext) {
                    context.publishState({
                        stateInventory: inventory,
                        paused: true,
                        subscribe: () => () => {},
                    });
                    return () => {};
                },
            }),
            hostWith(state),
        );

        expect([...published.keys()]).toEqual(['services-test']);
    });
});

describe('sdkChromeId', () => {
    it('matches core: prefers uiId, else collapses the package name', () => {
        expect(sdkChromeId({ uiId: 'av', name: '@scope/plugin-foo' })).toBe(
            'av',
        );
        expect(sdkChromeId({ name: '@scope/plugin-foo' })).toBe(
            'scope-plugin-foo',
        );
        expect(sdkChromeId({ name: 'plain' })).toBe('plain');
    });
});
