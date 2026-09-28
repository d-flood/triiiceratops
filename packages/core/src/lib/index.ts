// Framework-neutral entry: nothing reachable from here needs the optional
// `svelte` peer at runtime or type-check time. The constructible state lives
// in `./svelte.ts`; `ViewerState` stays here as a type only.
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
    ViewerConfig,
} from './types/config';

export type {
    PluginMenuButton,
    PluginPanel,
    PluginFlyout,
    PluginUiTarget,
} from './types/plugin';

// The ONE plugin path in 1.0, owned as types by core.
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

// Kept beside their subtypes so a consumer never imports a supertype from a
// different entry than its subtype.
export type {
    SelectorSource,
    SourceSelectors,
} from './state/selectors/runtime';

// Structured viewer-failure channel, mirroring the `pluginerror` shape.
export type {
    ViewerError,
    ViewerErrorScope,
    ViewerErrorSeverity,
    ViewerErrorReporter,
} from './types/viewerError';
export { VIEWER_ERROR_EVENT } from './types/viewerError';

// Canvas space and screen space cross this boundary; image space is
// core-internal and never does.
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

// Types only — the registry is core's, reached through
// `ViewerState.registerPaintLayer`.
export type {
    PaintCanvasPlacement,
    PaintFrame,
    PaintLayer,
    PaintLayerDraw,
    PaintTransform,
} from './renderer/paintLayers';

// Types only — the registry is core's, reached through
// `ViewerState.registerOverlayLayer`.
export type { OverlayLayer } from './renderer/overlayLayers';

// Types only — the registry is core's, reached through
// `ViewerState.registerTransportChrome`.
export type {
    TransportChrome,
    TransportChromeIcons,
    TransportChromeLabels,
    TransportChromePort,
    TransportChromeView,
} from './state/transportChrome';

// The custom element's state bridge: the getter-only `viewerState` property
// paired with the `viewerstateavailable` lifecycle event.
export type { TriiiceratopsViewerElement } from './types/viewerElement';
export { VIEWER_STATE_AVAILABLE_EVENT } from './types/viewerElement';

// Production is quiet by default; enable via `ViewerConfig.debug`.
export type { Logger, LogLevel, LogSink } from './logging/logger';
export { logger, configureLogging, isDebugEnabled } from './logging/logger';

// Core's declared plugin-compatibility surface.
export { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';

// Exported so the SDK test kit builds the real surface over a headless state.
export { createPluginSurface } from './plugin/surface';

// Every canvas handed out is raw IIIF Canvas JSON, v2 or v3 as authored — no
// wrapper, no accessors, typed `any`. Read it with the version-neutral helpers
// below (and `resolveCanvasImage` et al. from `triiiceratops/image-export`)
// rather than branching on version.
export { getContainerType, getPaintingAnnotations } from './utils/iiifParsing';
export type { IiifContainerType } from './utils/iiifParsing';
export { parseIiifTime, formatMediaTime } from './utils/iiifTime';

// So a Svelte or vanilla consumer can name the `initialCanvasRegion` type.
export type { CanvasRegion } from './utils/contentState';

// For a host that needs the view target itself (inspect a drop/paste, route on
// it). Pure and network-free.
export type { ContentStateTarget } from './utils/contentState';
export { parseContentState } from './utils/contentState';

// `isUnsupportedCanvas` is the whole "is this canvas mine to claim" rule,
// including its collapse: a canvas painting nothing at all is not claimable,
// and one with even one image body is core's. Exported because the claimant
// asks core's own painting question — two implementations would drift apart.
export type { ChoiceSelection } from './utils/paintingBodies';
export {
    isImageBody,
    isUnsupportedCanvas,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
} from './utils/paintingBodies';

// Whether core paints a canvas's `placeholderCanvas`/`accompanyingCanvas` —
// core's own resolution, so a second derivation cannot drift from it.
export type { CompanionProperty } from './renderer/companionCanvases';
export { companionPaintable } from './renderer/companionCanvases';

// Structures (TOC) exports
export type { StructureNode } from './utils/structures';

export type { CollectionItem } from './utils/collections';

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
