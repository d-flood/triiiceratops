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
 * both. The bookkeeping the two share comes from `utils/ownedRegistry.ts`; the
 * contracts do not, and this module still **does not import the paint one**, so
 * a change to canvas-space maths or to `PaintFrame` cannot ripple into a DOM
 * registry, and vice versa.
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

import { createOwnedRegistry } from '../utils/ownedRegistry.js';
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
    const registry = createOwnedRegistry<OverlayLayer, RegisteredOverlayLayer>({
        name: 'registerOverlayLayer',
        shape: 'an { id, mount } layer: a non-empty string id and a mount function',
        validate: (layer) => typeof layer?.mount === 'function',
        project: (layer, id) => ({ id, mount: layer.mount }),
        ...options,
    });

    return {
        get layers() {
            return registry.snapshot;
        },
        register: (layer) => registry.register(layer),
        disposeOwnedBy: (pluginId) => registry.disposeOwnedBy(pluginId),
        disposeAll: () => registry.disposeAll(),
    };
}
