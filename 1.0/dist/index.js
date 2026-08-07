export { SDK_PLUGIN_KIND, isSdkPlugin, PLUGIN_ERROR_EVENT, } from './types/plugin';
export { VIEWER_ERROR_EVENT } from './types/viewerError';
export { VIEWER_STATE_AVAILABLE_EVENT } from './types/viewerElement';
export { logger, configureLogging, isDebugEnabled } from './logging/logger';
// Core's declared plugin-compatibility surface (ticket 07).
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
export { BUILTIN_THEMES } from './theme/types';
export { applyTheme, applyBuiltInTheme, applyThemeConfig, clearThemeConfig, isBuiltInTheme, parseThemeConfig, } from './theme/themeManager';
export { hexToOklch, normalizeColor } from './theme/colorUtils';
