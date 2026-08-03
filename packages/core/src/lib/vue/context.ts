/**
 * `<ViewerProvider>` — the component form of {@link provideViewer}.
 *
 * Vue needs no provider component: `provideViewer(viewer)` in `setup` already
 * publishes the handle to the whole subtree. This exists for consumers who
 * prefer the boundary to be visible in the template, and for parity with
 * `triiiceratops/react`, where a provider component is the only option.
 *
 * It is a trivial value provider. It gates nothing, renders its default slot
 * unconditionally, and has no fallback — reads through the handle are nullable
 * until the viewer's state exists, which is the honest state of the world.
 */

import { computed, defineComponent } from 'vue';
import type { PropType, VNode } from 'vue';

import {
    provideViewer,
    type TriiiceratopsViewerInstance,
    type ViewerHandleRef,
} from './handle.js';

/** Props of {@link ViewerProvider}. */
export interface ViewerProviderProps {
    /** The template ref of the `<TriiiceratopsViewer>` this subtree reads. */
    value: ViewerHandleRef;
}

export const ViewerProvider = defineComponent({
    name: 'ViewerProvider',
    props: {
        value: {
            type: Object as PropType<ViewerHandleRef>,
            required: true,
        },
    },
    setup(props, { slots }) {
        // Provide a stable indirection rather than `props.value` itself: a
        // consumer that swaps which viewer this subtree reads changes the REF
        // OBJECT, and `provide` runs once. The computed forwards whichever ref
        // is current, so every reader rewires.
        const forwarded = computed<TriiiceratopsViewerInstance | null>(
            () => props.value?.value ?? null,
        );
        provideViewer(forwarded);
        return (): VNode[] => slots.default?.() ?? [];
    },
});
