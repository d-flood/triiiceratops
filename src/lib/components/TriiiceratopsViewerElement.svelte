<svelte:options
    customElement={{
        tag: 'triiiceratops-viewer',
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
        },
    }}
/>

<script lang="ts">
    import styles from '../../app.css?inline';
    import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
    import type { PluginDef } from '../types/plugin';
    import type { DaisyUITheme, ThemeConfig } from '../theme/types';
    import type { ViewerConfig } from '../types/config';
    import { isBuiltInTheme, parseThemeConfig } from '../theme/themeManager';
    import type { ViewerState } from '../state/viewer.svelte';
    import type { CanvasRegion } from '../utils/contentState';
    import { parseJsonProp } from '../utils/jsonProp';

    let {
        manifestId = '',
        manifestJson = undefined as string | Record<string, any> | undefined,
        canvasId = '',
        plugins = [],
        theme = undefined as string | undefined,
        themeConfig = undefined as string | ThemeConfig | undefined,
        config = undefined as string | ViewerConfig | undefined,
        initialCanvasRegion = undefined as string | CanvasRegion | undefined,
    }: {
        manifestId?: string;
        manifestJson?: string | Record<string, any>;
        canvasId?: string;
        plugins?: PluginDef[];
        /**
         * Built-in DaisyUI theme name (e.g., 'light', 'dark', 'cupcake').
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

    // Track if we've already wired up the event target (only do once)
    let eventTargetSet = false;

    // Wire up eventTarget when viewerState is available - only once
    $effect(() => {
        if (internalViewerState && hostElement && !eventTargetSet) {
            eventTargetSet = true;
            internalViewerState.setEventTarget(hostElement);
        }
    });

    // Validate and convert theme string to DaisyUITheme type
    let validatedTheme = $derived.by((): DaisyUITheme | undefined => {
        if (!theme) return undefined;
        if (isBuiltInTheme(theme)) return theme;
        console.warn(`Invalid theme "${theme}". Using inherited theme.`);
        return undefined;
    });

    // Parse themeConfig if it's a JSON string, pass through if it's already an object
    let parsedThemeConfig = $derived.by((): ThemeConfig | undefined => {
        if (!themeConfig) return undefined;
        if (typeof themeConfig === 'string') {
            const parsed = parseThemeConfig(themeConfig);
            if (!parsed) {
                console.warn(
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
                onError: console.warn,
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
                        onError: console.warn,
                    },
                );

                return parsed && typeof parsed === 'object' ? parsed : undefined;
            }
            return manifestJson;
        },
    );

    let parsedInitialCanvasRegion = $derived.by(
        (): CanvasRegion | null | undefined => {
            if (!initialCanvasRegion) return null;
            if (typeof initialCanvasRegion === 'string') {
                return parseJsonProp<CanvasRegion | null>(initialCanvasRegion, {
                    fallback: null,
                    label: 'initial-canvas-region',
                    onError: console.warn,
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
        bind:viewerState={internalViewerState}
    />
</div>

<style>
    .te-root {
        width: 100%;
        height: 100%;
    }
</style>
