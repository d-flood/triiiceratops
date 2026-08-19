// This entry is FRAMEWORK-NEUTRAL: nothing reachable from here requires the
// optional `svelte` peer, at runtime or at type-check time. The Svelte component
// and the constructible rune-backed state classes live in `./svelte.ts`
// (`triiiceratops/svelte`), which re-exports everything below as a superset.
//
// `ViewerState` stays here as a TYPE — its declaration is Svelte-free by
// construction, and `@triiiceratops/plugin-sdk` imports it from this entry — but
// the constructible class needs `svelte/reactivity` at runtime, so it is only
// exported from `triiiceratops/svelte`. For a constructible state with no Svelte
// installed, use `triiiceratops/testing`.
export type {
    CompanionPhase,
    ViewerState,
    ViewerStateSnapshot,
} from './state/viewer.svelte';
export type {
    SearchHit,
    SearchProvider,
    SearchProviderContext,
    SearchResultGroup,
} from './types/config';

// Plugin chrome records — the panel, flyout, and toolbar-button entries core
// registers for a plugin and renders from.
export type {
    PluginMenuButton,
    PluginPanel,
    PluginFlyout,
    PluginUiTarget,
} from './types/plugin';

// SDK plugin seam — the framework-neutral authoring contract that
// `@triiiceratops/plugin-sdk` implements against, and the ONE plugin path in
// 1.0. Core owns the types and mounts SDK plugins through this structural seam.
export type {
    Selector,
    ViewerSelectors,
    PluginStyleService,
    PluginLocaleService,
    LocaleCatalog,
    IconDescriptor,
    PluginIcon,
    PluginUiService,
    PluginSurface,
    PluginContext,
    PublishedState,
    PublishedStateClassification,
    PluginView,
    PluginHost,
    PluginActivation,
    SdkPluginMeta,
    SdkPlugin,
    PluginErrorPhase,
    PluginError,
    PluginErrorReport,
} from './types/plugin';
export {
    SDK_PLUGIN_KIND,
    isSdkPlugin,
    PLUGIN_ERROR_EVENT,
} from './types/plugin';

// What the selector runtime needs of the state it projects. `PublishedState`
// above is one of these, and `ViewerSelectors` is `SourceSelectors<ViewerState>`
// — so both live here beside them, rather than only on the `triiiceratops/
// selectors` subpath, where a consumer typing a published state would have to
// import a supertype from a different entry than its subtype.
export type {
    SelectorSource,
    SourceSelectors,
} from './state/selectors/runtime';

// Structured viewer-failure channel — mirrors the `pluginerror` shape for
// viewer-level configuration, content, and operation failures. Delivered as a
// bubbling, composed `viewererror` CustomEvent from the
// viewer root and the `onviewererror` host callback.
export type {
    ViewerError,
    ViewerErrorScope,
    ViewerErrorSeverity,
    ViewerErrorReporter,
} from './types/viewerError';
export { VIEWER_ERROR_EVENT } from './types/viewerError';

// The viewport's public vocabulary (SPEC.md §Public API). Coordinates on this
// boundary are canvas space (the IIIF Canvas's own dimensions, already the
// persistence format for annotation geometry) and screen space; image space is
// core-internal and never crosses it. Nothing here is a renderer object.
export type {
    CanvasSize,
    ContainerSize,
    ImageAdjustments,
    ViewportBox,
    ViewportInset,
    ViewportPoint,
} from './types/viewport';
export {
    NEUTRAL_IMAGE_ADJUSTMENTS,
    ZERO_VIEWPORT_INSET,
    imageAdjustmentsToCssFilter,
    isNeutralImageAdjustments,
} from './types/viewport';

// The **paint hook**'s vocabulary: what `registerPaintLayer` takes,
// and what a layer is handed each frame. Types only — the registry itself is
// core's, reached through `ViewerState.registerPaintLayer`.
export type {
    PaintCanvasPlacement,
    PaintFrame,
    PaintLayer,
    PaintLayerDraw,
    PaintTransform,
} from './renderer/paintLayers';

// The **overlay layer**'s vocabulary: what `registerOverlayLayer` takes. Types
// only — the registry is core's, reached through
// `ViewerState.registerOverlayLayer`. `mount` is the same `PluginMountThunk` a
// plugin's chrome already uses; a layer is a DOM container over the image, which
// is where anything a reader must perceive or operate belongs.
export type { OverlayLayer } from './renderer/overlayLayers';

// The **transport chrome** seam's vocabulary: what `registerTransportChrome`
// takes. Types only — the registry is core's, reached through
// `ViewerState.registerTransportChrome`. The seam is media-agnostic on purpose:
// a claimant hands core playback facts and playback commands, and core renders
// the controls in its own bar, in its own theme.
export type {
    TransportChrome,
    TransportChromeIcons,
    TransportChromeLabels,
    TransportChromePort,
    TransportChromeView,
} from './state/transportChrome';

// The custom element's state bridge: the
// getter-only `viewerState` property paired with the `viewerstateavailable`
// lifecycle event. This is how a Web Component host binds to the live
// `ViewerState` a given element owns.
export type { TriiiceratopsViewerElement } from './types/viewerElement';
export { VIEWER_STATE_AVAILABLE_EVENT } from './types/viewerElement';

// Opt-in developer diagnostics. Production is quiet by default;
// consumers enable logging through `ViewerConfig.debug`. `configureLogging`
// additionally allows a host to inject a custom log sink.
export type { Logger, LogLevel, LogSink } from './logging/logger';
export { logger, configureLogging, isDebugEnabled } from './logging/logger';

// Core's declared plugin-compatibility surface.
export { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';

// The plugin's own panel/flyout chrome, handed to it as `PluginContext.surface`.
// Exported so the SDK test kit can build the REAL surface over a headless state
// rather than re-implement it.
export { createPluginSurface } from './plugin/surface';

// IIIF reading surface.
//
// **The canvas contract.** Every canvas the viewer hands out — `viewerState.
// canvases`, `ViewerState.getCanvases()`, and every canvas passed to a plugin —
// is **raw IIIF Canvas JSON, v2 or v3 exactly as the manifest authored it**.
// There is no wrapper object and there are no accessor methods. A v2 canvas
// spells its identifier `@id` and its images `images[]`; a v3 canvas spells them
// `id` and `items[]`. All of it is typed `any`, so TypeScript will not tell you
// which one you are holding.
//
// Rather than branch on version, read them with core's version-neutral helpers:
// `getPaintingAnnotations` below, and `getCanvasId`, `getCanvasLabel`,
// `getThumbnailSrc`, `resolveCanvasImage`, and `resolveAllCanvasImages` from
// `triiiceratops/image-export`. The manifest itself is available as raw JSON
// through `viewerState.manifestEntry?.json`.
export { getPaintingAnnotations } from './utils/iiifParsing';

// The painting-body classifier, in the minimum that answers "is this canvas
// mine to claim" (ADR 0017).
//
// `isUnsupportedCanvas` IS that question: a canvas core cannot paint any of, and
// which therefore gets the unsupported presentation a claim suppresses. It is
// the whole of the classification rule, including the collapse a claimant would
// otherwise have to restate — a canvas that paints nothing at all is not
// claimable, because core drops it from layout entirely, and a canvas with even
// one image body is core's to paint. `isImageBody` and
// `paintingBodyAlternatives` are the rungs beneath it, for a claimant that has
// to look at the individual bodies (which medium, which alternative) rather than
// merely decide the canvas.
//
// Exported because the claimant asks core's own painting question, and two
// implementations of one classification rule would drift apart silently — the
// exact failure this seam exists to prevent. These are the very functions core
// paints with, not a public restatement of them.
// `isUnsupportedCanvasFor` is the form every caller in this repo wants: the
// classification rule and the Choice-selection lookup it must be asked with,
// kept together so no site can learn about selection while another does not.
// It accepts the viewer state itself or a bare `getSelectedChoice` callback.
export type { ChoiceSelection } from './utils/paintingBodies';
export {
    isImageBody,
    isUnsupportedCanvas,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
} from './utils/paintingBodies';

// The claimant's companion question, on the same terms and for the same reason:
// whether core will paint the `placeholderCanvas` or `accompanyingCanvas` a
// canvas carries. A claimant sets a **companion phase** on that answer, and only
// core's own resolution can give it — a second derivation of the same refusals
// is a blank stage waiting for the two to drift apart.
export type { CompanionProperty } from './renderer/companionCanvases';
export { companionPaintable } from './renderer/companionCanvases';

// Structures (TOC) exports
export type { StructureNode } from './utils/structures';

// Collections exports
export type { CollectionItem } from './utils/collections';

// Theme customization exports
export type { ThemeConfig, BuiltInTheme } from './theme/types';
export { BUILTIN_THEMES } from './theme/types';
export {
    applyTheme,
    applyBuiltInTheme,
    applyThemeConfig,
    clearThemeConfig,
    isBuiltInTheme,
    parseThemeConfig,
} from './theme/themeManager';
export { hexToOklch, normalizeColor } from './theme/colorUtils';
