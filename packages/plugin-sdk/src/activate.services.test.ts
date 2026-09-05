// Activation service wiring + auto-cleanup tests.
//
// The SDK passes the host's style/locale/ui services through to the plugin
// context, and — regardless of whether the plugin cleaned up after itself —
// releases every style install and locale subscription it made when the
// activation is deactivated.

import { describe, expect, it, vi } from 'vitest';

import { runActivation } from './activate.js';
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
        coreRange: '*',
        pluginApiRange: '*',
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

    it('stubs a chrome-less host as ALWAYS OPEN, keyed by the plugin id', () => {
        // A bare `runActivation` has no toolbar button, panel, or flyout: the
        // caller placed the container themselves, so nothing can hide the plugin.
        // A `false` stub would silently park every plugin that gates work on
        // `surface.isOpen`, which reads as a broken plugin.
        const styles = recordingStyles();
        const locale = recordingLocale();

        const { surface, activation } = captureSurface(
            makeHost(styles.service, locale.service),
        );

        expect(surface).toBeDefined();
        expect(surface!.isOpen).toBe(true);
        expect(surface!.id).toBe('@triiiceratops/plugin-services-test');
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

    it('prefers the plugin uiId over its package name for the stub id', () => {
        const styles = recordingStyles();
        const locale = recordingLocale();
        let surface: PluginContext['surface'] | undefined;

        const activation = runActivation(
            {
                ...makeMeta({
                    mount(_container, context: PluginContext) {
                        surface = context.surface;
                        return () => {};
                    },
                }),
                uiId: 'services-test',
            },
            makeHost(styles.service, locale.service),
        );

        expect(surface!.id).toBe('services-test');
        activation.deactivate();
    });
});
