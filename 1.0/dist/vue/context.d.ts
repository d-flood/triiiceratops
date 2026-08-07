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
import type { PropType, VNode } from 'vue';
import { type ViewerHandleRef } from './handle.js';
/** Props of {@link ViewerProvider}. */
export interface ViewerProviderProps {
    /** The template ref of the `<TriiiceratopsViewer>` this subtree reads. */
    value: ViewerHandleRef;
}
export declare const ViewerProvider: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    value: {
        type: PropType<ViewerHandleRef>;
        required: true;
    };
}>, () => VNode[], {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    value: {
        type: PropType<ViewerHandleRef>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
