import type { SdkPlugin } from '../types/plugin';
import type { ThemeConfig } from '../theme/types';
import type { ViewerConfig } from '../types/config';
import type { ViewerState } from '../state/viewer.svelte';
import type { PluginError } from '../types/plugin';
import type { ViewerError } from '../types/viewerError';
import type { SearchProvider } from '../types/config';
import type { CanvasRegion } from '../utils/contentState';
type $$ComponentProps = {
    manifestId?: string;
    manifestJson?: string | Record<string, any>;
    canvasId?: string;
    /**
     * Framework-neutral `SdkPlugin`s. A property-only input (there is no
     * supported `plugins` attribute): assign `element.plugins = [...]`,
     * before or after upgrade. The inner viewer ignores anything that is
     * not an array.
     */
    plugins?: readonly SdkPlugin[];
    /**
     * Host-supplied custom search backend (property-only input). There is
     * no supported attribute: assign `element.searchProvider = fn`, before
     * or after upgrade. Anything that is not a function is ignored.
     */
    searchProvider?: SearchProvider | null;
    /**
     * Element-property host callback for the `pluginerror` channel
     * (ticket 09). WC hosts may also listen for the bubbling, composed
     * `pluginerror` DOM event on the element.
     */
    onpluginerror?: (error: PluginError) => void;
    /**
     * Element-property host callback for the `viewererror` channel
     * (ticket 18). WC hosts may also listen for the bubbling, composed
     * `viewererror` DOM event on the element.
     */
    onviewererror?: (error: ViewerError) => void;
    /**
     * Built-in theme name (e.g., 'light', 'dark', 'teal').
     * When not specified, inherits the theme from the parent context.
     */
    theme?: string;
    /**
     * Custom theme configuration to override the base theme.
     * Can be a JSON string (for HTML attribute) or ThemeConfig object (for JS property).
     * @example HTML: theme-config='{"primary":"#3b82f6","radiusBox":"0.5rem"}'
     * @example JS: element.themeConfig = { primary: '#3b82f6', radiusBox: '0.5rem' }
     */
    themeConfig?: string | ThemeConfig;
    /**
     * Configuration options for the viewer UI.
     */
    config?: string | ViewerConfig;
    initialCanvasRegion?: string | CanvasRegion;
};
declare const TriiiceratopsViewerElement: import("svelte").Component<$$ComponentProps, {
    /**
         * The state bridge (see `../types/viewerElement`). Exporting the binding
         * makes the Svelte compiler list `viewerState` in `create_custom_element`'s
         * `exports`, which defines a GETTER-ONLY property on the element prototype
         * reading `this.$$c?.viewerState`. That is exactly the required contract
         * with no custom code: `undefined` before the inner viewer mounts,
         * `undefined` again once disconnection clears `$$c`, no setter at all, and
         * — because it lives on the prototype — the version handshake a framework
         * wrapper can probe on the registered constructor.
         */ viewerState: ViewerState | undefined;
}, "">;
type TriiiceratopsViewerElement = ReturnType<typeof TriiiceratopsViewerElement>;
export default TriiiceratopsViewerElement;
