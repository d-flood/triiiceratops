<svelte:options
    customElement={{
        tag: 'triiiceratops-viewer-image',
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
        },
    }}
/>

<script lang="ts">
    import styles from '../../app.css?inline';
    import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
    import { ImageManipulationPlugin } from '../plugins/image-manipulation';
    import type { TriiiceratopsPlugin } from '../types/plugin';
    import type { DaisyUITheme, ThemeConfig } from '../theme/types';
    import { isBuiltInTheme, parseThemeConfig } from '../theme/themeManager';

    let {
        manifestId = '',
        canvasId = '',
        plugins = [new ImageManipulationPlugin()],
        theme = undefined as string | undefined,
        themeConfig = undefined as string | ThemeConfig | undefined,
    }: {
        manifestId?: string;
        canvasId?: string;
        plugins?: TriiiceratopsPlugin[];
        /**
         * Built-in DaisyUI theme name (e.g., 'light', 'dark', 'cupcake').
         * When not specified, defaults to 'light' or 'dark' based on prefers-color-scheme.
         */
        theme?: string;
        /**
         * Custom theme configuration to override the base theme.
         * Can be a JSON string (for HTML attribute) or ThemeConfig object (for JS property).
         * @example HTML: theme-config='{"primary":"#3b82f6","radiusBox":"0.5rem"}'
         * @example JS: element.themeConfig = { primary: '#3b82f6', radiusBox: '0.5rem' }
         */
        themeConfig?: string | ThemeConfig;
    } = $props();

    // Validate and convert theme string to DaisyUITheme type
    let validatedTheme = $derived.by((): DaisyUITheme | undefined => {
        if (!theme) return undefined;
        if (isBuiltInTheme(theme)) return theme;
        console.warn(
            `Invalid theme "${theme}". Using system preference fallback.`,
        );
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
</script>

{@html `<style>${styles}</style>`}

<div class="w-full h-full">
    <TriiiceratopsViewer
        {manifestId}
        {canvasId}
        {plugins}
        theme={validatedTheme}
        themeConfig={parsedThemeConfig}
    />
</div>
