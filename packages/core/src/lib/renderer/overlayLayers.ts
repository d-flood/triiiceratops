/**
 * The **overlay layer** registry: a DOM container a plugin registers, which core
 * places in the viewer's stage beside the renderer and the plugin renders into
 * (CONTEXT.md **Overlay layer**).
 *
 * ## Why DOM rather than the paint hook
 *
 * > The canvas paints pixels; a parallel DOM layer carries the focusable,
 * > labelled targets.
 *
 * That rule is what this module exists for. Anything a reader must perceive or
 * operate — a marker they click, a label a screen reader announces, a card they
 * tab to — has to be a real element, because canvas-drawn shapes have no focus,
 * no accessible name, no keyboard reach, and an automated accessibility scan
 * cannot report an element that does not exist. The paint hook
 * (`ViewerState.registerPaintLayer`, and the sibling registry module behind it)
 * is the other half of the pair: decoration, or a second rendering of geometry
 * the DOM already carries.
 *
 * ## What this module owns, and what it does not
 *
 * Only bookkeeping: which layers exist, in what order they were registered, and
 * what happens when one is refused. It is DOM-free and therefore unit-testable.
 * The container, its box, and the mount lifecycle belong to the render site
 * (`components/TriiiceratopsViewer.svelte`, via `components/PluginMountHost.svelte`);
 * the public registration surface belongs to `ViewerState.registerOverlayLayer`.
 *
 * ## Deliberately not the paint registry
 *
 * This is structurally the paint-layer registry minus its canvas-space maths and
 * minus ordering, and that similarity is intentional — one idiom to learn for
 * both. It is nonetheless a **separate module that does not import that one**,
 * so a change to canvas-space maths or to `PaintFrame` cannot ripple into a DOM
 * registry, and vice versa. The small overlap is duplicated on purpose; do not
 * "de-duplicate" it by importing across.
 *
 * **There is no `order` field, and adding one would be a mistake.** Cross-plugin
 * ordering cannot be coordinated — a plugin cannot know what value another chose
 * — so publishing an ordering space would imply a guarantee core cannot offer,
 * and within one plugin a single container with `z-index` on its own children is
 * strictly less work than two registered layers. The paint hook keeps explicit
 * ordering because core interleaves its own layer with consumers' inside one
 * canvas context, where there is no DOM and no `z-index` to fall back on. The
 * substrates differ; the APIs may.
 *
 * ## Ownership
 *
 * A layer id must be `<pluginId>:<name>` naming a plugin the viewer knows, which
 * buys two things a convention could not: cross-plugin id collisions are
 * impossible, and cleanup can **fail closed** — unregistering a plugin releases
 * the layers it forgot ({@link OverlayLayerRegistry.disposeOwnedBy}) instead of
 * leaving orphaned DOM on the image. The registry does not know what a plugin is,
 * so it asks: `isKnownPlugin` is injected by viewer state, which answers from
 * plugin UI state. The paint registry has no such rule on purpose — core
 * registers a paint layer of its own, so a mandatory plugin prefix there would
 * need a reserved core namespace
 * (`docs/adr/0016-overlay-layers-are-dom-and-the-paint-hook-stays.md`).
 */

import type { PluginMountThunk } from '../types/plugin.js';

/** A layer, as a plugin registers it. */
export interface OverlayLayer {
    /**
     * A stable identifier, unique within one viewer, of the form
     * `<pluginId>:<name>` — the convention chrome ids already use, here
     * **required and validated**: the prefix must name a plugin this viewer
     * knows, or the registration is refused (see
     * {@link createOverlayLayerRegistry}'s `isKnownPlugin`). It is how a refused
     * registration is reported, it is the key the render site places the
     * container under — which is what makes a surviving layer keep its own node
     * when a sibling comes or goes — and it is what makes unregistering a plugin
     * able to release the layers it forgot.
     */
    id: string;
    /**
     * The existing plugin DOM-mount thunk: core creates and places the
     * container, the plugin renders into it and returns its cleanup.
     *
     * The plugin's context is not passed in — a plugin calls
     * `registerOverlayLayer` from inside its own `view.mount`, so it already
     * holds it.
     */
    mount: PluginMountThunk;
}

/**
 * A layer the registry accepted.
 *
 * A separate type from {@link OverlayLayer} rather than an alias: what a caller
 * hands in and what the render site reads back are two contracts, and the second
 * may grow a field without that being a change to the first.
 */
export interface RegisteredOverlayLayer {
    id: string;
    mount: PluginMountThunk;
}

export interface OverlayLayerRegistry {
    /**
     * Register a layer. Returns an idempotent dispose; a refused registration
     * returns a no-op one, so a caller never has to branch.
     */
    register(layer: OverlayLayer): () => void;
    /**
     * Dispose every layer whose id carries the `` `${pluginId}:` `` prefix, by
     * the same path {@link register}'s returned dispose takes — the record
     * leaves the list, so the render site removes the container and the layer's
     * own mount cleanup runs.
     *
     * The **backstop** for a plugin whose own teardown misses its dispose, not
     * the normal way to release a layer: `unregisterPlugin` calls this so a buggy
     * plugin cannot leave orphaned DOM sitting on the image. Safe to call for a
     * plugin that registered nothing.
     */
    disposeOwnedBy(pluginId: string): void;
    /** Dispose every layer, whoever owns it. `destroyAllPlugins`'s half. */
    disposeAll(): void;
    /**
     * The layers to render, in registration order. A frozen snapshot rebuilt on
     * change, so the render site iterates a stable array rather than a live
     * collection it could mutate mid-render.
     */
    readonly layers: readonly RegisteredOverlayLayer[];
}

/**
 * The registry behind `ViewerState.registerOverlayLayer`.
 *
 * It lives in viewer state rather than in the render site for two reasons: a
 * plugin may register before any renderer has mounted, and a renderer remount
 * must not silently drop every layer.
 *
 * `onChange` is how the render site learns a layer arrived or left — viewer
 * state turns it into exactly one reactive write.
 */
export function createOverlayLayerRegistry(options?: {
    onChange?: () => void;
    /** Told why a registration was refused, for the developer's console. */
    onRefused?: (message: string) => void;
    /**
     * Whether `pluginId` names a plugin of this viewer — how an id's prefix is
     * validated. Viewer state answers from plugin UI state, which is seeded
     * before a plugin's `view.mount` runs and therefore already populated when
     * the plugin registers a layer from inside it; the plugin's *chrome* is not,
     * so answering from the chrome records would refuse every legitimate layer.
     *
     * Omitted, ids are not checked against any owner — the registry's own unit
     * tests have no viewer to ask.
     */
    isKnownPlugin?: (pluginId: string) => boolean;
}): OverlayLayerRegistry {
    // A plain Set, deliberately not a `SvelteSet`: the reactive signal is the
    // `onChange` callback, which viewer state turns into exactly one state
    // write. A reactive collection here would additionally wake the batched
    // state watcher for every internal read the rebuild does.
    const held = new Set<RegisteredOverlayLayer>();
    let snapshot: readonly RegisteredOverlayLayer[] = [];

    function rebuild(): void {
        snapshot = Object.freeze([...held]);
        options?.onChange?.();
    }

    /**
     * Drop every matching record and announce once.
     *
     * The same path a returned dispose takes — leaving the list is what makes the
     * render site remove the container and run the layer's mount cleanup — so a
     * layer released here and then released again by its own dispose tears down
     * exactly once.
     */
    function disposeWhere(matches: (id: string) => boolean): void {
        let removed = false;
        for (const layer of [...held]) {
            if (!matches(layer.id)) continue;
            held.delete(layer);
            removed = true;
        }
        if (removed) rebuild();
    }

    return {
        get layers() {
            return snapshot;
        },

        disposeOwnedBy(pluginId: string): void {
            const prefix = `${pluginId}:`;
            // The trailing colon is load-bearing: without it, unregistering
            // `notes` would also evict `notes-extra`'s layers.
            disposeWhere((id) => id.startsWith(prefix));
        },

        disposeAll(): void {
            disposeWhere(() => true);
        },

        register(layer: OverlayLayer): () => void {
            const id = typeof layer?.id === 'string' ? layer.id.trim() : '';
            if (!id || typeof layer?.mount !== 'function') {
                options?.onRefused?.(
                    'registerOverlayLayer needs an { id, mount } layer: a non-empty string id and a mount function.',
                );
                return () => {};
            }

            // The prefix is everything before the FIRST colon, so a `<name>`
            // containing one is the plugin's business. An id with no colon has
            // no prefix, which no plugin id matches, so it lands here too.
            const separator = id.indexOf(':');
            const owner = separator > 0 ? id.slice(0, separator) : '';
            if (options?.isKnownPlugin && !options.isKnownPlugin(owner)) {
                // Loud at development time rather than a leak later: an id core
                // cannot attribute is an id core cannot release when its plugin
                // goes away.
                options?.onRefused?.(
                    `registerOverlayLayer ignored the layer id "${id}": an id must be \`<pluginId>:<name>\` naming a plugin of this viewer, so the layer is released when that plugin is.`,
                );
                return () => {};
            }

            // Refused rather than allowed to shadow. Two reasons, and the
            // second is load-bearing: the id names this layer in a refusal
            // report, and it is also the render site's key — two containers
            // under one key is a duplicate-key error in a keyed `{#each}`, so a
            // second registration under a taken name would take the whole
            // overlay down rather than merely being confusing.
            for (const existing of held) {
                if (existing.id === id) {
                    options?.onRefused?.(
                        `registerOverlayLayer ignored a second layer with id "${id}"; ids are unique within a viewer.`,
                    );
                    return () => {};
                }
            }

            const registered: RegisteredOverlayLayer = {
                id,
                mount: layer.mount,
            };
            held.add(registered);
            rebuild();

            // Idempotent, and keyed on the record still being held rather than on
            // a "released" flag of its own: a layer already dropped by
            // `disposeOwnedBy` must make this a no-op too, so a plugin that both
            // releases its layer and is unregistered does not announce a second,
            // empty change.
            return () => {
                if (!held.delete(registered)) return;
                rebuild();
            };
        },
    };
}
