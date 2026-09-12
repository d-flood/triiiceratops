/**
 * The editor's drawing layer: the DOM core places over the image for this
 * plugin to own.
 *
 * This module is only the registration — the surface itself is
 * `DrawingLayer.svelte`, mounted into the container core hands over and
 * unmounted with it, so the layer lives and dies on the same lifecycle as the
 * plugin's mount.
 *
 * The container needs no CSS from this plugin. Core's overlay-layer wrapper is
 * the positioned, click-through box, and the container itself is
 * `display: contents` — so the surface positions itself straight from a
 * `canvasToScreen` point against that wrapper, and opts into pointer events on
 * its own while a tool is armed (ADR 0020).
 */
import { mount, unmount } from 'svelte';

import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { AnnotationStore } from './AnnotationStore.svelte';
import type { DrawingSession } from './drawingSession.svelte';
import DrawingLayer from './DrawingLayer.svelte';
import type { TFn } from './i18n.svelte';
import type { MirroredViewerState } from './viewerMirror.svelte';

/** Marks the container so a spec can find it. */
export const DRAWING_LAYER_CLASS = 'tri-annotation-drawing-layer';

/** The layer's name within this plugin's id namespace. */
export const DRAWING_LAYER_NAME = 'drawing';

/**
 * Register the drawing layer with the owning viewer. Returns the registry's
 * idempotent dispose, which is a no-op if the registration was refused.
 *
 * One layer, not several: cross-plugin ordering cannot be coordinated, so
 * internal stacking is `z-index` on this container's own children.
 */
export function registerDrawingLayer(
    context: PluginContext,
    surface: {
        session: DrawingSession;
        store: AnnotationStore;
        viewerState: MirroredViewerState;
        t: TFn;
    },
): () => void {
    return context.viewerState.registerOverlayLayer({
        // The prefix is the id the viewer knows this plugin by — never a literal.
        id: `${context.surface.id}:${DRAWING_LAYER_NAME}`,
        mount: (container: HTMLElement) => {
            container.classList.add(DRAWING_LAYER_CLASS);
            const layer = mount(DrawingLayer, {
                target: container,
                props: surface,
            });
            return () => {
                void unmount(layer);
                container.classList.remove(DRAWING_LAYER_CLASS);
            };
        },
    });
}
