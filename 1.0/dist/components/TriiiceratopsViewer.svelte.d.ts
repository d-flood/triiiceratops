import { ViewerState } from '../state/viewer.svelte';
import type { BuiltInTheme, ThemeConfig } from '../theme/types';
import type { SearchProvider, ViewerConfig } from '../types/config';
import type { SdkPlugin, PluginError } from '../types/plugin';
import type { ViewerError } from '../types/viewerError';
import type { CanvasRegion } from '../utils/contentState';
interface Props {
    manifestId?: string;
    manifestJson?: any;
    canvasId?: string;
    plugins?: readonly SdkPlugin[] | null | boolean;
    /** Built-in theme name. Defaults to 'light' or 'dark' based on prefers-color-scheme. */
    theme?: BuiltInTheme;
    /** Custom theme configuration to override the base theme's values. */
    themeConfig?: ThemeConfig;
    /** Configuration options for the viewer UI */
    config?: ViewerConfig;
    searchProvider?: SearchProvider | null;
    /** Bindable viewer state instance for external access (Svelte consumers) */
    viewerState?: ViewerState;
    initialCanvasRegion?: CanvasRegion | null;
    /**
     * Host callback for the structured plugin-failure channel (ticket 09).
     * Called with the SAME {@link PluginError} object dispatched as the
     * bubbling, composed `pluginerror` CustomEvent from the viewer root, so
     * a host can present or report the failure and call `retry()`.
     */
    onpluginerror?: (error: PluginError) => void;
    /**
     * Host callback for the structured viewer-failure channel (ticket 18).
     * Called with the SAME {@link ViewerError} object dispatched as the
     * bubbling, composed `viewererror` CustomEvent from the viewer root, so a
     * host can present or report actionable configuration, content, and
     * operation failures without scraping the console.
     */
    onviewererror?: (error: ViewerError) => void;
}
declare const TriiiceratopsViewer: import("svelte").Component<Props, {}, "viewerState">;
type TriiiceratopsViewer = ReturnType<typeof TriiiceratopsViewer>;
export default TriiiceratopsViewer;
