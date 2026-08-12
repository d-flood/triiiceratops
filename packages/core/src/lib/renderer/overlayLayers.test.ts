import { describe, expect, it, vi } from 'vitest';

import { createOverlayLayerRegistry } from './overlayLayers';

/** A mount thunk that records nothing: this seam is bookkeeping, not DOM. */
const mount = () => () => {};

describe('createOverlayLayerRegistry', () => {
    it('exposes layers in registration order', () => {
        const registry = createOverlayLayerRegistry();
        registry.register({ id: 'a:first', mount });
        registry.register({ id: 'a:second', mount });
        registry.register({ id: 'b:third', mount });

        // Registration order, and nothing else: there is no `order` field to
        // sort by, deliberately (see the module comment).
        expect(registry.layers.map((entry) => entry.id)).toEqual([
            'a:first',
            'a:second',
            'b:third',
        ]);
    });

    it('carries the caller’s mount thunk through unchanged', () => {
        const registry = createOverlayLayerRegistry();
        const thunk = vi.fn(() => () => {});
        registry.register({ id: 'a:one', mount: thunk });

        expect(registry.layers[0].mount).toBe(thunk);
        // The registry never calls it — mounting is the render site's job.
        expect(thunk).not.toHaveBeenCalled();
    });

    it('removes a layer on dispose, and is idempotent', () => {
        const registry = createOverlayLayerRegistry();
        const dispose = registry.register({ id: 'a:one', mount });
        registry.register({ id: 'a:two', mount });

        dispose();
        expect(registry.layers.map((entry) => entry.id)).toEqual(['a:two']);

        // A second call must not remove somebody else's layer, which is what a
        // non-idempotent implementation keyed on position would do — and a
        // plugin releasing from both its own cleanup and a teardown path is the
        // normal case, not an abuse.
        expect(() => dispose()).not.toThrow();
        expect(registry.layers.map((entry) => entry.id)).toEqual(['a:two']);
    });

    it('reports a change on register and on dispose', () => {
        const onChange = vi.fn();
        const registry = createOverlayLayerRegistry({ onChange });

        const dispose = registry.register({ id: 'a:one', mount });
        expect(onChange).toHaveBeenCalledTimes(1);

        dispose();
        expect(onChange).toHaveBeenCalledTimes(2);

        // A released layer is gone: releasing again changes nothing, so nothing
        // is announced and the render site is not woken.
        dispose();
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('rebuilds the snapshot rather than mutating the one already handed out', () => {
        const registry = createOverlayLayerRegistry();
        registry.register({ id: 'a:one', mount });
        const before = registry.layers;

        registry.register({ id: 'a:two', mount });

        expect(before.map((entry) => entry.id)).toEqual(['a:one']);
        expect(registry.layers).not.toBe(before);
    });

    it('refuses a layer with no id or no mount function, with a no-op dispose', () => {
        const onRefused = vi.fn();
        const registry = createOverlayLayerRegistry({ onRefused });

        const dispose = registry.register({ id: '   ', mount });
        registry.register({ id: 'a:nope' } as never);

        expect(registry.layers).toEqual([]);
        expect(onRefused).toHaveBeenCalledTimes(2);
        expect(() => dispose()).not.toThrow();
    });

    it('refuses a duplicate id rather than placing two containers under one key', () => {
        const onRefused = vi.fn();
        const registry = createOverlayLayerRegistry({ onRefused });
        registry.register({ id: 'a:same', mount });
        const dispose = registry.register({ id: 'a:same', mount });

        expect(registry.layers).toHaveLength(1);
        expect(onRefused).toHaveBeenCalledTimes(1);

        // The refused registration's dispose must not take the ACCEPTED layer
        // with it — a caller cannot tell the two apart.
        dispose();
        expect(registry.layers).toHaveLength(1);
    });

    it('frees the id once its layer is disposed', () => {
        const registry = createOverlayLayerRegistry();
        const dispose = registry.register({ id: 'a:same', mount });
        dispose();

        registry.register({ id: 'a:same', mount });
        expect(registry.layers).toHaveLength(1);
    });
});

/**
 * Ownership: an id names its plugin, so cleanup can fail closed.
 *
 * `isKnownPlugin` stands in for viewer state's plugin UI state — the registry
 * itself has no idea what a plugin is, which is what keeps it DOM-free and
 * unit-testable.
 *
 * EVERY registry in this block is constructed with it, including the ones whose
 * subject is disposal rather than validation. Omitting it turns validation off
 * (see `createOverlayLayerRegistry`), so a disposal test built without it would
 * stay green if the whole validation branch were deleted — it would be asserting
 * prefix matching against a registry that no longer has an ownership rule.
 */
describe('createOverlayLayerRegistry ownership', () => {
    const known = (...pluginIds: string[]) => {
        const ids = new Set(pluginIds);
        return (pluginId: string) => ids.has(pluginId);
    };

    it('accepts an id whose prefix names a known plugin', () => {
        const registry = createOverlayLayerRegistry({
            isKnownPlugin: known('notes'),
        });

        registry.register({ id: 'notes:markers', mount });
        // A colon in the NAME is the plugin's business: the prefix is everything
        // before the first one.
        registry.register({ id: 'notes:markers:hover', mount });

        expect(registry.layers.map((layer) => layer.id)).toEqual([
            'notes:markers',
            'notes:markers:hover',
        ]);
    });

    it.each([
        ['an unknown plugin', 'ghost:markers'],
        ['no colon at all', 'notes'],
        ['an empty prefix', ':markers'],
        // `notes-extra` is not `notes`, however much it looks like it.
        ['a plugin id that merely starts the same way', 'notes-extra:markers'],
    ])('refuses an id with %s, and registers nothing', (_why, id) => {
        const onRefused = vi.fn();
        const registry = createOverlayLayerRegistry({
            onRefused,
            isKnownPlugin: known('notes'),
        });

        const dispose = registry.register({ id, mount });

        expect(registry.layers).toEqual([]);
        expect(onRefused).toHaveBeenCalledTimes(1);
        expect(onRefused.mock.calls[0][0]).toContain(id);
        // The no-op dispose a refused caller gets back never throws.
        expect(() => dispose()).not.toThrow();
    });

    it('disposes only the named plugin’s layers', () => {
        const onChange = vi.fn();
        const registry = createOverlayLayerRegistry({
            onChange,
            isKnownPlugin: known('notes', 'notes-extra'),
        });
        registry.register({ id: 'notes:one', mount });
        registry.register({ id: 'notes:two', mount });
        registry.register({ id: 'notes-extra:one', mount });
        onChange.mockClear();

        registry.disposeOwnedBy('notes');

        // `notes-extra` survives: the prefix carries the trailing colon.
        expect(registry.layers.map((layer) => layer.id)).toEqual([
            'notes-extra:one',
        ]);
        // Both layers left in ONE announcement, not one per record.
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('says nothing when the named plugin has no layers', () => {
        const onChange = vi.fn();
        const registry = createOverlayLayerRegistry({
            onChange,
            isKnownPlugin: known('notes'),
        });
        registry.register({ id: 'notes:one', mount });
        onChange.mockClear();

        registry.disposeOwnedBy('nobody');

        expect(registry.layers).toHaveLength(1);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('disposes every layer on disposeAll, once', () => {
        const onChange = vi.fn();
        const registry = createOverlayLayerRegistry({
            onChange,
            isKnownPlugin: known('a', 'b'),
        });
        registry.register({ id: 'a:one', mount });
        registry.register({ id: 'b:one', mount });
        onChange.mockClear();

        registry.disposeAll();

        expect(registry.layers).toEqual([]);
        expect(onChange).toHaveBeenCalledTimes(1);

        // And an empty registry announces nothing.
        registry.disposeAll();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('does not tear a layer down twice when its dispose and prefix disposal both run', () => {
        const onChange = vi.fn();
        const registry = createOverlayLayerRegistry({
            onChange,
            isKnownPlugin: known('a'),
        });
        const dispose = registry.register({ id: 'a:one', mount });
        registry.register({ id: 'a:two', mount });
        onChange.mockClear();

        dispose();
        expect(registry.layers.map((layer) => layer.id)).toEqual(['a:two']);
        expect(onChange).toHaveBeenCalledTimes(1);

        // Prefix disposal takes the survivor and leaves the already-released one
        // alone; the released layer is gone, not removed a second time.
        registry.disposeOwnedBy('a');
        expect(registry.layers).toEqual([]);
        expect(onChange).toHaveBeenCalledTimes(2);

        // The other order, too: a plugin's own cleanup running after core's
        // backstop is a no-op rather than a second teardown.
        expect(() => dispose()).not.toThrow();
        expect(onChange).toHaveBeenCalledTimes(2);
    });
});
