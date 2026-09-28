/** Drawing-layer registration; surface itself is `DrawingLayer.svelte`. */
import { mount, unmount } from 'svelte';

import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { AnnotationStore } from './AnnotationStore.svelte';
import type { DrawingSession } from './drawingSession.svelte';
import DrawingLayer from './DrawingLayer.svelte';
import type { TFn } from './i18n.svelte';
import type { MirroredViewerState } from './viewerMirror.svelte';

export const DRAWING_LAYER_CLASS = 'tri-annotation-drawing-layer';

export const DRAWING_LAYER_NAME = 'drawing';

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
