<!--
    svelte-check runs with `customElement: false` (ticket 22) so ordinary
    components are not analyzed as custom elements. This wrapper IS compiled as a
    custom element in the real element builds (vite.config.element*.ts, static
    `customElement: true`), so the customElement options below are correct there.
    svelte-check cannot apply per-file customElement, so it emits
    `options_missing_custom_element` for this one file; that single code is
    ignored via the `--compiler-warnings` flag on the `check` script and recorded
    in lint-allowlist.md (svelte-ignore does not apply to <svelte:options>).
-->
<svelte:options
    customElement={{
        shadow: 'open',
        props: {
            manifestId: {
                attribute: 'manifest-id',
                type: 'String',
                reflect: true,
            },
            manifestJson: {
                attribute: 'manifest-json',
                type: 'Object',
                reflect: false,
            },
            canvasId: {
                attribute: 'canvas-id',
                type: 'String',
                reflect: true,
            },
            theme: {
                attribute: 'theme',
                type: 'String',
                reflect: true,
            },
            themeConfig: {
                attribute: 'theme-config',
                type: 'String',
                reflect: false,
            },
            config: {
                attribute: 'config',
                type: 'String',
                reflect: false,
            },
            initialCanvasRegion: {
                attribute: 'initial-canvas-region',
                type: 'String',
                reflect: false,
            },
            // Property-only input. Declaring it here is what makes Svelte
            // define a prototype accessor for it and port a value assigned
            // BEFORE the element upgrades (`custom-element.js`
            // `connectedCallback`). Svelte derives an observed attribute from
            // every declared prop, so an inert `searchprovider` attribute
            // exists; `type: 'String'` keeps a stray attribute a harmless
            // string (an `Object` type would JSON.parse and throw), and the
            // script below ignores every non-function value.
            searchProvider: {
                attribute: 'searchprovider',
                type: 'String',
                reflect: false,
            },
        },
    }}
/>

<script lang="ts">
    import styles from '../../app.css?inline';
    import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
    import type { PluginDef } from '../types/plugin';
    import type { BuiltInTheme, ThemeConfig } from '../theme/types';
    import type { ViewerConfig } from '../types/config';
    import { isBuiltInTheme, parseThemeConfig } from '../theme/themeManager';
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
        plugins = [],
        theme = undefined as string | undefined,
        themeConfig = undefined as string | ThemeConfig | undefined,
        config = undefined as string | ViewerConfig | undefined,
        initialCanvasRegion = undefined as string | CanvasRegion | undefined,
        searchProvider = undefined as SearchProvider | null | undefined,
        onpluginerror = undefined as ((error: PluginError) => void) | undefined,
        onviewererror = undefined as ((error: ViewerError) => void) | undefined,
    }: {
        manifestId?: string;
        manifestJson?: string | Record<string, any>;
        canvasId?: string;
        plugins?: PluginDef[];
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
    } = $props();

    // Reference to host element for event dispatch
    let hostElement: HTMLElement;

    // ViewerState from the inner component (via bindable prop)
    let internalViewerState: ViewerState | undefined = $state();

    /**
     * The state bridge (see `../types/viewerElement`). Exporting the binding
     * makes the Svelte compiler list `viewerState` in `create_custom_element`'s
     * `exports`, which defines a GETTER-ONLY property on the element prototype
     * reading `this.$$c?.viewerState`. That is exactly the required contract
     * with no custom code: `undefined` before the inner viewer mounts,
     * `undefined` again once disconnection clears `$$c`, no setter at all, and
     * — because it lives on the prototype — the version handshake a framework
     * wrapper can probe on the registered constructor.
     */
    export { internalViewerState as viewerState };

    // Track if we've already wired up the event target and announced state
    // availability (only do once per mounted inner component).
    let eventTargetSet = false;

    // Wire up eventTarget when viewerState is available - only once - and
    // announce the state instance on the `viewerstateavailable` channel.
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

    // Validate and convert theme string to BuiltInTheme type
    let validatedTheme = $derived.by((): BuiltInTheme | undefined => {
        if (!theme) return undefined;
        if (isBuiltInTheme(theme)) return theme;
        logger.warn(`Invalid theme "${theme}". Using inherited theme.`);
        return undefined;
    });

    // Parse themeConfig if it's a JSON string, pass through if it's already an object
    let parsedThemeConfig = $derived.by((): ThemeConfig | undefined => {
        if (!themeConfig) return undefined;
        if (typeof themeConfig === 'string') {
            const parsed = parseThemeConfig(themeConfig);
            if (!parsed) {
                logger.warn(
                    `Invalid theme-config JSON: "${themeConfig}". Ignoring.`,
                );
            }
            return parsed ?? undefined;
        }
        return themeConfig;
    });
    // Parse config if it's a JSON string, pass through if it's already an object
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
    // attribute Svelte derives from the prop declaration can only ever deliver
    // a string, so anything that is not a function is dropped here rather than
    // reaching the search path.
    let validatedSearchProvider = $derived.by((): SearchProvider | null => {
        if (searchProvider === undefined || searchProvider === null)
            return null;
        if (typeof searchProvider !== 'function') {
            logger.warn(
                'Ignoring non-function searchProvider. It is a property-only ' +
                    'input with no supported attribute: assign ' +
                    'element.searchProvider = (query, context) => ….',
            );
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

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<style>${styles}</style>`}

<div bind:this={hostElement} class="te-root">
    <TriiiceratopsViewer
        {manifestId}
        manifestJson={parsedManifestJson}
        {canvasId}
        {plugins}
        theme={validatedTheme}
        themeConfig={parsedThemeConfig}
        config={parsedConfig}
        initialCanvasRegion={parsedInitialCanvasRegion}
        searchProvider={validatedSearchProvider}
        {onpluginerror}
        {onviewererror}
        bind:viewerState={internalViewerState}
    />
</div>

<style>
    .te-root {
        width: 100%;
        height: 100%;
    }
</style>
