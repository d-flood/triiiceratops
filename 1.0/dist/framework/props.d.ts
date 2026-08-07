/**
 * The shared, framework-neutral prop metadata every viewer input is classified
 * by, and the change detection the applier uses.
 *
 * Three tiers, and the tier is a property of the INPUT, never of the runtime
 * value it happens to carry:
 *
 * - **Attribute tier** (`manifestId`, `canvasId`, `theme`) — rendered
 *   declaratively as kebab-case attributes by each wrapper, on the server and
 *   on the client's first render alike, so hydration reuses the same host with
 *   no mismatch. {@link viewerElementAttributes} builds that record; it is a
 *   pure function of the props, which is exactly why server and client agree.
 * - **Property tier** (`manifestJson`, `themeConfig`, `config`,
 *   `initialCanvasRegion`, `plugins`, `searchProvider`) — assigned imperatively
 *   as element properties by the applier, never server-rendered. The four
 *   inputs that accept a string OR an object route here UNCONDITIONALLY:
 *   assignment must never branch on the runtime type of a value, or the same
 *   prop would take different paths on different renders.
 * - **Host attributes** (`class`/`className`, `style`, `id`, `data-*`,
 *   `aria-*`, ordinary DOM attributes) — forwarded declaratively by each
 *   wrapper. They need no metadata here; they are simply not viewer inputs.
 *
 * `viewerState` is never a prop and never assigned (it is getter-only anyway).
 */
import type { SdkPlugin } from '../types/plugin.js';
import type { SearchProvider, ViewerConfig } from '../types/config.js';
import type { ThemeConfig } from '../theme/types.js';
import type { CanvasRegion } from '../utils/contentState.js';
/** Viewer inputs rendered as kebab-case attributes. */
export interface ViewerAttributeProps {
    /**
     * IIIF Manifest URL to load. A one-way, UNCONTROLLED input: it is an
     * instruction to the viewer, not a continuously enforced binding, so the
     * wrapper never fights the user's own navigation. Observe where the viewer
     * actually is through a selector or the `manifestchange` channel.
     */
    manifestId?: string;
    /**
     * Canvas to show. Uncontrolled, exactly like {@link manifestId}: after the
     * user navigates internally, re-asserting the same value writes nothing.
     */
    canvasId?: string;
    /** Built-in theme name (`light`, `dark`, …). Unknown names are ignored. */
    theme?: string;
}
/** Viewer inputs assigned imperatively as element properties. */
export interface ViewerPropertyProps {
    /** Inline IIIF Manifest — a JSON string or the parsed object. */
    manifestJson?: string | Record<string, any>;
    /** Theme overrides — a JSON string or the parsed object. */
    themeConfig?: string | ThemeConfig;
    /** Viewer configuration — a JSON string or the parsed object. */
    config?: string | ViewerConfig;
    /** Initial canvas region — a JSON string or the parsed object. */
    initialCanvasRegion?: string | CanvasRegion;
    /**
     * Framework-neutral SDK plugins — the one plugin path.
     *
     * Activation lifetime is keyed to PLUGIN identity, not list identity:
     * re-supplying an equal list leaves running plugins untouched.
     */
    plugins?: readonly SdkPlugin[];
    /** Host-supplied custom search backend, or `null` for the built-in path. */
    searchProvider?: SearchProvider | null;
}
/** Every viewer input a framework wrapper accepts, across both written tiers. */
export interface ViewerElementProps extends ViewerAttributeProps, ViewerPropertyProps {
}
/** Which tier an input belongs to. */
export type ViewerPropTier = 'attribute' | 'property';
export type ViewerAttributePropName = keyof ViewerAttributeProps;
export type ViewerPropertyPropName = keyof ViewerPropertyProps;
export type ViewerPropName = keyof ViewerElementProps;
/**
 * Attribute-tier inputs and the kebab-case attribute each renders as. Iteration
 * order is the render order, so the two wrappers emit attributes identically.
 */
export declare const VIEWER_ATTRIBUTE_PROPS: {
    readonly manifestId: "manifest-id";
    readonly canvasId: "canvas-id";
    readonly theme: "theme";
};
/** Property-tier inputs, in the order the applier writes them. */
export declare const VIEWER_PROPERTY_PROPS: readonly ["manifestJson", "themeConfig", "config", "initialCanvasRegion", "plugins", "searchProvider"];
/** The tier of a viewer input, or `undefined` if it is not a viewer input. */
export declare function viewerPropTier(name: string): ViewerPropTier | undefined;
/**
 * Build the attribute-tier record a wrapper renders declaratively. Pure: the
 * same props always produce the same record, which is what makes the server's
 * markup and the client's first render agree with no readiness special case.
 *
 * Absent inputs are omitted rather than rendered empty, so a viewer configured
 * only by properties emits a bare host.
 */
export declare function viewerElementAttributes(props: Readonly<ViewerAttributeProps>): Record<string, string>;
/**
 * The ONE change-detection rule for property-tier inputs: one uniform,
 * one-level shallow comparison.
 *
 * Equal when the values are identical by `Object.is`; or both arrays of equal
 * length whose elements are identical by `Object.is`; or both plain objects
 * with equal own-key sets whose values are identical by `Object.is`. Everything
 * else is unequal.
 *
 * Deep equality, serialization comparison, and value-specific identity
 * heuristics are deliberately excluded: they make write suppression depend on
 * the SHAPE of a consumer's data, which is unpredictable and expensive. A
 * consumer whose object is nested and freshly built each render gets a write,
 * and — after enough of them — a development warning naming the prop.
 */
export declare function shallowEqual(a: unknown, b: unknown): boolean;
