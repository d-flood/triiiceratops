/**
 * `<TriiiceratopsViewer>` — the Vue 3.5 framework wrapper.
 *
 * It hosts the existing `<triiiceratops-viewer>` custom element and translates
 * its lifecycle, properties, events, and viewer state into Vue idioms. It does
 * not implement or own a second viewer, and it renders exactly ONE element: no
 * layout wrapper, no slot content, nothing projected into light or shadow DOM.
 * Adopting the wrapper therefore changes no sizing or CSS.
 *
 * Authored as a plain `.ts` render function with `h()` and `defineComponent` —
 * no single-file component, no `.vue` file, and no extra build step.
 * `build:lib`'s `svelte-package` step copies unknown file types verbatim, so a
 * `.vue` here would ship broken. Because the component is a render function,
 * the raw custom-element tag never reaches Vue's template compiler and a
 * consumer needs no `compilerOptions.isCustomElement` configuration.
 *
 * ## The three prop tiers
 *
 * - **Attribute tier** (`manifestId`, `canvasId`, `theme`) is rendered
 *   declaratively as kebab-case attributes, identically on the server and on
 *   the client's first render, so hydration reuses and upgrades the same host.
 *   Each key is `^`-prefixed, which is Vue's own "force this to be an
 *   attribute" marker: without it `shouldSetAsProp`'s `key in el` test would
 *   route `theme` through `el.theme = …` once the element happened to be
 *   upgraded, and through `setAttribute` when it happened not to be.
 * - **Property tier** (`manifestJson`, `themeConfig`, `config`,
 *   `initialCanvasRegion`, `plugins`, `searchProvider`) goes through the shared
 *   applier, NEVER through vnode props. Vue's `shouldSetAsProp` falls back to
 *   `setAttribute(key, String(value))` on an element that is not yet defined,
 *   which would stringify a manifest object or a search function into an
 *   attribute.
 * - **Host attributes** (`class`, `style`, `id`, `data-*`, `aria-*`, ordinary
 *   DOM attributes and listeners) are forwarded deliberately. `inheritAttrs` is
 *   disabled and `attrs` is spread onto the element by the render function, so
 *   attribute inheritance stays predictable even though the component renders a
 *   single element.
 *
 * ## The template ref belongs to one viewer
 *
 * The handle is an ordinary template ref rather than a wrapper-owned prop, so
 * nothing about the component's signature says a ref may not be reused. The
 * mount hook therefore claims the BOX the ref writes into, through the same
 * substrate slot React's `handle` prop claims: one ref put on two viewers
 * raises `TriiiceratopsHandleConflictError` naming both elements instead of
 * silently making every read follow whichever mounted last. See
 * `templateRefOwnership.ts` for which ref shapes own a box and which (a
 * callback ref, a ref inside `v-for`) deliberately do not.
 *
 * `manifestId` and `canvasId` are one-way, UNCONTROLLED inputs: they are an
 * instruction to the viewer, not a continuously enforced binding, so
 * re-asserting an unchanged value after the user navigates internally writes
 * nothing and the wrapper never fights the viewer. No `v-model` is offered.
 * Observe where the viewer actually is with `useViewerSelector` or the
 * `canvas-change` / `manifest-change` emits.
 */
import type { PropType, VNode } from 'vue';
import { type ViewerElementProps } from '../framework/index.js';
import type { SearchProvider, ViewerConfig } from '../types/config.js';
import type { SdkPlugin } from '../types/plugin.js';
import type { PluginError } from '../types/plugin.js';
import type { ThemeConfig } from '../theme/types.js';
import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import type { ViewerError } from '../types/viewerError.js';
import type { CanvasRegion } from '../utils/contentState.js';
/**
 * Every viewer input `<TriiiceratopsViewer>` accepts, across the attribute and
 * property tiers. Ordinary host attributes are not props — they arrive as
 * `attrs` and are forwarded, which is Vue's normal contract for them.
 */
export type TriiiceratopsViewerProps = ViewerElementProps;
/**
 * The component's typed emits. Each carries the custom element's event DETAIL
 * directly — never a `CustomEvent` — so application code is independent of the
 * DOM event envelope, and the error channels carry the exact objects core
 * dispatched, including a callable `PluginError.retry()`.
 *
 * Usable with Vue's normal template casing: `@state-change`, `@canvas-change`,
 * `@manifest-change`, `@choice-change`, `@plugin-error`, `@viewer-error`.
 */
export interface ViewerEmits {
    /** Any inventoried viewer-state change, batched. */
    stateChange: [snapshot: ViewerStateSnapshot];
    /** The displayed canvas changed. */
    canvasChange: [snapshot: ViewerStateSnapshot];
    /** The loaded manifest changed. */
    manifestChange: [snapshot: ViewerStateSnapshot];
    /** A IIIF `Choice` selection changed. */
    choiceChange: [snapshot: ViewerStateSnapshot];
    /** A plugin failed. The exact `PluginError`, with a callable `retry()`. */
    pluginError: [error: PluginError];
    /** The viewer failed. The exact typed `ViewerError`. */
    viewerError: [error: ViewerError];
}
export declare const TriiiceratopsViewer: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    readonly manifestId: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly canvasId: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly theme: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly manifestJson: {
        readonly type: PropType<string | Record<string, any>>;
        readonly required: false;
    };
    readonly themeConfig: {
        readonly type: PropType<string | ThemeConfig>;
        readonly required: false;
    };
    readonly config: {
        readonly type: PropType<string | ViewerConfig>;
        readonly required: false;
    };
    readonly initialCanvasRegion: {
        readonly type: PropType<string | CanvasRegion>;
        readonly required: false;
    };
    readonly plugins: {
        readonly type: PropType<readonly SdkPlugin[]>;
        readonly required: false;
    };
    readonly searchProvider: {
        readonly type: PropType<SearchProvider | null>;
        readonly required: false;
    };
}>, () => VNode, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    stateChange: (snapshot: ViewerStateSnapshot) => boolean;
    canvasChange: (snapshot: ViewerStateSnapshot) => boolean;
    manifestChange: (snapshot: ViewerStateSnapshot) => boolean;
    choiceChange: (snapshot: ViewerStateSnapshot) => boolean;
    pluginError: (error: PluginError) => boolean;
    viewerError: (error: ViewerError) => boolean;
}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    readonly manifestId: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly canvasId: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly theme: {
        readonly type: StringConstructor;
        readonly required: false;
    };
    readonly manifestJson: {
        readonly type: PropType<string | Record<string, any>>;
        readonly required: false;
    };
    readonly themeConfig: {
        readonly type: PropType<string | ThemeConfig>;
        readonly required: false;
    };
    readonly config: {
        readonly type: PropType<string | ViewerConfig>;
        readonly required: false;
    };
    readonly initialCanvasRegion: {
        readonly type: PropType<string | CanvasRegion>;
        readonly required: false;
    };
    readonly plugins: {
        readonly type: PropType<readonly SdkPlugin[]>;
        readonly required: false;
    };
    readonly searchProvider: {
        readonly type: PropType<SearchProvider | null>;
        readonly required: false;
    };
}>> & Readonly<{
    onStateChange?: ((snapshot: ViewerStateSnapshot) => any) | undefined;
    onCanvasChange?: ((snapshot: ViewerStateSnapshot) => any) | undefined;
    onManifestChange?: ((snapshot: ViewerStateSnapshot) => any) | undefined;
    onChoiceChange?: ((snapshot: ViewerStateSnapshot) => any) | undefined;
    onPluginError?: ((error: PluginError) => any) | undefined;
    onViewerError?: ((error: ViewerError) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
