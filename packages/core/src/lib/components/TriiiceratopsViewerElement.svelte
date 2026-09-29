<script lang="ts">
    import styles from '../../app.css?inline';
    import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
    import type { SdkPlugin } from '../types/plugin';
    import type { BuiltInTheme, ThemeConfig } from '../theme/types';
    import type { ViewerConfig } from '../types/config';
    import type { LocaleCatalog } from '../types/plugin';
    import { isBuiltInTheme } from '../theme/themeManager';
    import type { ViewerState } from '../state/viewer.svelte';
    import type { PluginError } from '../types/plugin';
    import type { ViewerError } from '../types/viewerError';
    import type { SearchProvider } from '../types/config';
    import { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement';
    import type { CanvasRegion } from '../utils/contentState';
    import { parseJsonProp } from '../utils/jsonProp';
    import { logger } from '../logging/logger';

    let {
        manifestId = '',
        manifestJson = undefined as string | Record<string, any> | undefined,
        canvasId = '',
        contentState = '',
        readContentStateFromUrl = false,
        acceptDroppedContentState = false,
        plugins = [],
        theme = undefined as string | undefined,
        themeConfig = undefined as string | ThemeConfig | undefined,
        config = undefined as string | ViewerConfig | undefined,
        initialCanvasRegion = undefined as string | CanvasRegion | undefined,
        messages = undefined as string | LocaleCatalog | undefined,
        loadMessages = undefined as ViewerConfig['loadMessages'],
        searchProvider = undefined as SearchProvider | null | undefined,
        onpluginerror = undefined as ((error: PluginError) => void) | undefined,
        onviewererror = undefined as ((error: ViewerError) => void) | undefined,
    }: {
        manifestId?: string;
        manifestJson?: string | Record<string, any>;
        canvasId?: string;
        /**
         * A IIIF Content State naming the view to open (ADR 0006): a bare IIIF
         * URI, an Annotation as JSON, or that Annotation base64url-encoded.
         * Ignored whenever `manifest-id` or `manifest-json` is set.
         */
        contentState?: string;
        /**
         * Opt in to reading the `iiif-content` parameter from the host's
         * address, once on mount (ADR 0006). A boolean attribute: presence opts
         * in. Off by default, lowest precedence, and the address bar is never
         * mutated.
         */
        readContentStateFromUrl?: boolean;
        acceptDroppedContentState?: boolean;
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
         * Element-property host callback for the `pluginerror` channel. WC
         * hosts may also listen for the bubbling, composed
         * `pluginerror` DOM event on the element.
         */
        onpluginerror?: (error: PluginError) => void;
        /**
         * Element-property host callback for the `viewererror` channel. WC
         * hosts may also listen for the bubbling, composed
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
        /**
         * Chrome translations, as a JSON string (HTML attribute) or the parsed
         * catalog (JS property). A convenience spelling of `config.messages`,
         * which it overrides when both are given.
         */
        messages?: string | LocaleCatalog;
        /**
         * On-demand catalog loader (property-only input). There is no supported
         * attribute: assign `element.loadMessages = fn`, before or after
         * upgrade. Anything that is not a function is ignored. Overrides
         * `config.loadMessages`.
         */
        loadMessages?: ViewerConfig['loadMessages'];
    } = $props();

    let hostElement: HTMLElement;

    let internalViewerState: ViewerState | undefined = $state();

    // Read by `viewerElement.svelte.ts`: `viewerState` is the state bridge,
    // and the props report their resolved values, defaults included, for the
    // element's getters and reflection.
    export { internalViewerState as viewerState };
    export {
        manifestId,
        manifestJson,
        canvasId,
        contentState,
        readContentStateFromUrl,
        acceptDroppedContentState,
        plugins,
        theme,
        themeConfig,
        config,
        initialCanvasRegion,
        messages,
        loadMessages,
        searchProvider,
        onpluginerror,
        onviewererror,
    };

    let eventTargetSet = false;

    $effect(() => {
        if (!internalViewerState || !hostElement || eventTargetSet) return;
        eventTargetSet = true;
        const state = internalViewerState;
        const target = hostElement;
        state.setEventTarget(target);
        // Dispatched asynchronously, like the other channels, so a host
        // listener never runs inside the reactive cycle that mounted the
        // viewer. Bubbling + composed so it escapes the shadow root. The
        // property is already readable by now, which is what makes
        // listen-then-check race-free for hosts that initialize late.
        queueMicrotask(() => {
            target.dispatchEvent(
                new CustomEvent(VIEWER_STATE_AVAILABLE_EVENT, {
                    detail: state,
                    bubbles: true,
                    composed: true,
                }),
            );
        });
    });

    let validatedTheme = $derived.by((): BuiltInTheme | undefined => {
        if (!theme) return undefined;
        if (isBuiltInTheme(theme)) return theme;
        logger.warn(`bad theme ${theme}; inherited`);
        return undefined;
    });

    let parsedThemeConfig = $derived.by((): ThemeConfig | undefined => {
        if (!themeConfig) return undefined;
        if (typeof themeConfig === 'string') {
            const parsed = parseJsonProp<ThemeConfig | undefined>(themeConfig, {
                fallback: undefined,
                label: 'theme-config',
                onError: logger.warn,
            });

            return parsed && typeof parsed === 'object' ? parsed : undefined;
        }
        return themeConfig;
    });
    let parsedConfig = $derived.by((): ViewerConfig | undefined => {
        if (!config) return undefined;
        if (typeof config === 'string') {
            return parseJsonProp<ViewerConfig | undefined>(config, {
                fallback: undefined,
                label: 'config',
                onError: logger.warn,
            });
        }
        return config;
    });

    let parsedMessages = $derived.by((): LocaleCatalog | undefined => {
        if (!messages) return undefined;
        if (typeof messages === 'string') {
            const parsed = parseJsonProp<LocaleCatalog | undefined>(messages, {
                fallback: undefined,
                label: 'messages',
                onError: logger.warn,
            });

            return parsed && typeof parsed === 'object' ? parsed : undefined;
        }
        return messages;
    });

    // `loadMessages` is property-only: the inert `loadmessages` observed
    // attribute can only ever deliver a string, so anything that is not a
    // function is dropped here.
    let validatedLoadMessages = $derived.by(
        (): ViewerConfig['loadMessages'] => {
            if (loadMessages === undefined || loadMessages === null) {
                return undefined;
            }
            if (typeof loadMessages !== 'function') {
                logger.warn('loadMessages is not a function; ignored');
                return undefined;
            }
            return loadMessages;
        },
    );

    /**
     * The config the inner viewer sees. The element's own `messages` and
     * `loadMessages` are a convenience for hosts driving it through attributes
     * and properties — framework wrappers pass both on `config` — so they are
     * folded in here, winning over a `config` that names them too.
     */
    let mergedConfig = $derived.by((): ViewerConfig | undefined => {
        if (!parsedMessages && !validatedLoadMessages) return parsedConfig;
        return {
            ...parsedConfig,
            ...(parsedMessages ? { messages: parsedMessages } : {}),
            ...(validatedLoadMessages
                ? { loadMessages: validatedLoadMessages }
                : {}),
        };
    });

    let parsedManifestJson = $derived.by(
        (): Record<string, any> | undefined => {
            if (!manifestJson) return undefined;
            if (typeof manifestJson === 'string') {
                const parsed = parseJsonProp<Record<string, any> | undefined>(
                    manifestJson,
                    {
                        fallback: undefined,
                        label: 'manifest-json',
                        onError: logger.warn,
                    },
                );

                return parsed && typeof parsed === 'object'
                    ? parsed
                    : undefined;
            }
            return manifestJson;
        },
    );

    // `searchProvider` is property-only: the inert `searchprovider` observed
    // attribute can only ever deliver a string, so anything that is not a
    // function is dropped here rather than reaching the search path.
    let validatedSearchProvider = $derived.by((): SearchProvider | null => {
        if (searchProvider === undefined || searchProvider === null)
            return null;
        if (typeof searchProvider !== 'function') {
            logger.warn('searchProvider is not a function; ignored');
            return null;
        }
        return searchProvider;
    });

    let parsedInitialCanvasRegion = $derived.by(
        (): CanvasRegion | null | undefined => {
            if (!initialCanvasRegion) return null;
            if (typeof initialCanvasRegion === 'string') {
                return parseJsonProp<CanvasRegion | null>(initialCanvasRegion, {
                    fallback: null,
                    label: 'initial-canvas-region',
                    onError: logger.warn,
                });
            }
            return initialCanvasRegion;
        },
    );
</script>

<!-- The wrapper's rule rides in the shadow root's one sheet. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<style>${styles}.te-root{width:100%;height:100%}</style>`}

<div bind:this={hostElement} class="te-root">
    <TriiiceratopsViewer
        {manifestId}
        manifestJson={parsedManifestJson}
        {canvasId}
        {contentState}
        readContentStateFromUrl={!!readContentStateFromUrl}
        acceptDroppedContentState={!!acceptDroppedContentState}
        {plugins}
        theme={validatedTheme}
        themeConfig={parsedThemeConfig}
        config={mergedConfig}
        initialCanvasRegion={parsedInitialCanvasRegion}
        searchProvider={validatedSearchProvider}
        {onpluginerror}
        {onviewererror}
        bind:viewerState={internalViewerState}
    />
</div>
