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

    let {
        manifestId = '',
        canvasId = '',
        plugins = [],
        theme = undefined as string | undefined,
        themeConfig = undefined as string | ThemeConfig | undefined,
        config = undefined as string | ViewerConfig | undefined,
    }: {
        manifestId?: string;
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
            try {
                return JSON.parse(config);
            } catch {
                console.warn(`Invalid config JSON: "${config}". Ignoring.`);
                return undefined;
            }
        }
        return config;
    });
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<style>${styles}</style>`}

<div bind:this={hostElement} class="w-full h-full">
    <TriiiceratopsViewer
        {manifestId}
        {canvasId}
        {plugins}
        theme={validatedTheme}
        themeConfig={parsedThemeConfig}
        config={parsedConfig}
        bind:viewerState={internalViewerState}
    />
</div>
