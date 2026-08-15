import { describe, expect, it, vi } from 'vitest';

import {
    createTransportChromeRegistry,
    type TransportChrome,
    type TransportChromeIcons,
    type TransportChromeView,
} from './transportChrome';

const ICON = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
} as const;

const icons: TransportChromeIcons = {
    play: ICON,
    pause: ICON,
    mute: ICON,
    unmute: ICON,
    tracks: ICON,
};

/** A view nobody reads: this seam is bookkeeping, not rendering. */
const view = () => ({ present: false }) as TransportChromeView;

const port = {
    toggle() {},
    seek() {},
    setMuted() {},
    setVolume() {},
    setTrack() {},
};

function chrome(id: string, overrides: Partial<TransportChrome> = {}) {
    return {
        id,
        icons,
        view,
        port,
        subscribe: () => () => {},
        ...overrides,
    } satisfies TransportChrome;
}

describe('createTransportChromeRegistry', () => {
    it('exposes registrations in registration order', () => {
        const registry = createTransportChromeRegistry();
        registry.register(chrome('a:first'));
        registry.register(chrome('b:second'));

        // Registration order, and nothing else: there is no `order` field to
        // sort by, deliberately (see the module comment). The render site takes
        // the first, so this order IS the arbitration.
        expect(registry.entries.map((entry) => entry.id)).toEqual([
            'a:first',
            'b:second',
        ]);
    });

    it('carries the caller’s view, port and subscribe through unchanged', () => {
        const registry = createTransportChromeRegistry();
        const viewFn = vi.fn(view);
        const subscribe = vi.fn(() => () => {});
        registry.register(chrome('a:one', { view: viewFn, subscribe }));

        const entry = registry.entries[0];
        expect(entry.view).toBe(viewFn);
        expect(entry.port).toBe(port);
        expect(entry.icons).toBe(icons);
        // The registry never reads the view or opens the subscription — that is
        // the render site's job, on its own cadence.
        expect(viewFn).not.toHaveBeenCalled();
        expect(subscribe).not.toHaveBeenCalled();
    });

    it('removes a registration on dispose, and is idempotent', () => {
        const registry = createTransportChromeRegistry();
        const dispose = registry.register(chrome('a:one'));
        registry.register(chrome('a:two'));

        dispose();
        expect(registry.entries.map((entry) => entry.id)).toEqual(['a:two']);

        // A claimant releasing from both its own cleanup and a teardown path is
        // the normal case, not an abuse.
        expect(() => dispose()).not.toThrow();
        expect(registry.entries.map((entry) => entry.id)).toEqual(['a:two']);
    });

    it('reports a change on register and on dispose', () => {
        const onChange = vi.fn();
        const registry = createTransportChromeRegistry({ onChange });

        const dispose = registry.register(chrome('a:one'));
        expect(onChange).toHaveBeenCalledTimes(1);

        dispose();
        expect(onChange).toHaveBeenCalledTimes(2);

        dispose();
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('rebuilds the snapshot rather than mutating the one already handed out', () => {
        const registry = createTransportChromeRegistry();
        registry.register(chrome('a:one'));
        const before = registry.entries;

        registry.register(chrome('a:two'));

        expect(before.map((entry) => entry.id)).toEqual(['a:one']);
        expect(registry.entries).not.toBe(before);
        expect(Object.isFrozen(registry.entries)).toBe(true);
    });

    it.each([
        ['a blank id', chrome('   ')],
        ['no view function', { ...chrome('a:one'), view: undefined }],
        ['no subscribe function', { ...chrome('a:one'), subscribe: undefined }],
        ['no port', { ...chrome('a:one'), port: undefined }],
        ['no icons', { ...chrome('a:one'), icons: undefined }],
    ])('refuses chrome with %s, with a no-op dispose', (_why, candidate) => {
        const onRefused = vi.fn();
        const registry = createTransportChromeRegistry({ onRefused });

        const dispose = registry.register(candidate as never);

        expect(registry.entries).toEqual([]);
        expect(onRefused).toHaveBeenCalledTimes(1);
        expect(() => dispose()).not.toThrow();
    });

    it('refuses a duplicate id', () => {
        const onRefused = vi.fn();
        const registry = createTransportChromeRegistry({ onRefused });
        registry.register(chrome('a:same'));
        const dispose = registry.register(chrome('a:same'));

        expect(registry.entries).toHaveLength(1);
        expect(onRefused).toHaveBeenCalledTimes(1);

        // The refused registration's dispose must not take the ACCEPTED chrome
        // with it — a caller cannot tell the two apart.
        dispose();
        expect(registry.entries).toHaveLength(1);
    });

    it('frees the id once its chrome is disposed', () => {
        const registry = createTransportChromeRegistry();
        registry.register(chrome('a:same'))();

        registry.register(chrome('a:same'));
        expect(registry.entries).toHaveLength(1);
    });
});

/**
 * Ownership: an id names its plugin, so cleanup can fail closed.
 *
 * EVERY registry in this block is constructed with `isKnownPlugin`, including
 * the ones whose subject is disposal rather than validation. Omitting it turns
 * validation off, so a disposal test built without it would stay green if the
 * whole validation branch were deleted.
 */
describe('createTransportChromeRegistry ownership', () => {
    const known = (...pluginIds: string[]) => {
        const ids = new Set(pluginIds);
        return (pluginId: string) => ids.has(pluginId);
    };

    it('accepts an id whose prefix names a known plugin', () => {
        const registry = createTransportChromeRegistry({
            isKnownPlugin: known('av'),
        });

        registry.register(chrome('av:playback'));
        // A colon in the NAME is the plugin's business: the prefix is
        // everything before the first one.
        registry.register(chrome('av:playback:alt'));

        expect(registry.entries.map((entry) => entry.id)).toEqual([
            'av:playback',
            'av:playback:alt',
        ]);
    });

    it.each([
        ['an unknown plugin', 'ghost:playback'],
        ['no colon at all', 'av'],
        ['an empty prefix', ':playback'],
        ['a plugin id that merely starts the same way', 'av-extra:playback'],
    ])('refuses an id with %s, and registers nothing', (_why, id) => {
        const onRefused = vi.fn();
        const registry = createTransportChromeRegistry({
            onRefused,
            isKnownPlugin: known('av'),
        });

        const dispose = registry.register(chrome(id));

        expect(registry.entries).toEqual([]);
        expect(onRefused).toHaveBeenCalledTimes(1);
        expect(onRefused.mock.calls[0][0]).toContain(id);
        expect(() => dispose()).not.toThrow();
    });

    it('disposes only the named plugin’s chrome', () => {
        const onChange = vi.fn();
        const registry = createTransportChromeRegistry({
            onChange,
            isKnownPlugin: known('av', 'av-extra'),
        });
        registry.register(chrome('av:one'));
        registry.register(chrome('av:two'));
        registry.register(chrome('av-extra:one'));
        onChange.mockClear();

        registry.disposeOwnedBy('av');

        // `av-extra` survives: the prefix carries the trailing colon.
        expect(registry.entries.map((entry) => entry.id)).toEqual([
            'av-extra:one',
        ]);
        // Both left in ONE announcement, not one per record.
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('says nothing when the named plugin registered nothing', () => {
        const onChange = vi.fn();
        const registry = createTransportChromeRegistry({
            onChange,
            isKnownPlugin: known('av'),
        });
        registry.register(chrome('av:one'));
        onChange.mockClear();

        registry.disposeOwnedBy('ghost');

        expect(registry.entries).toHaveLength(1);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('disposes everything, whoever owns it', () => {
        const registry = createTransportChromeRegistry({
            isKnownPlugin: known('av', 'av-extra'),
        });
        registry.register(chrome('av:one'));
        registry.register(chrome('av-extra:one'));

        registry.disposeAll();

        expect(registry.entries).toEqual([]);
    });
});
