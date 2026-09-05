<script lang="ts">
    import ThemeToggle from '$lib/ThemeToggle.svelte';
    import { DOCUMENTATION_PATH } from '$lib/site';
    import type { Theme } from '$lib/theme';

    import DemoIcon from './DemoIcon.svelte';
    import SettingsMenu from './SettingsMenu.svelte';
    import { DEMO_LOCALES, language, m } from './i18n.svelte';
    import { DEFAULT_MANIFEST_URL } from './manifestCatalog';

    import type { BuiltInTheme } from 'triiiceratops';
    // Canvases are raw IIIF JSON: `id` in v3, `@id` in v2.
    import { getCanvasId, getCanvasLabel } from 'triiiceratops/image-export';

    import { onMount } from 'svelte';

    const isDev = import.meta.env.DEV;

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
        canvasId = $bindable(''),
        canvases = [],
        config = $bindable({}),
        pageTheme = $bindable('light'),
        viewerTheme = 'light',
        onThemeChange,
        baseConfig,
        availableLocales = [],
        onReset,
        onShare,
    }: {
        manifestUrl: string;
        onLoad: () => void;
        viewerMode: string;
        canvasId: string;
        /** The active viewer's canvases, in layout order: raw IIIF JSON. */
        canvases?: any[];
        config: any;
        pageTheme?: Theme;
        viewerTheme?: BuiltInTheme;
        onThemeChange?: (theme: BuiltInTheme) => void;
        baseConfig?: any;
        availableLocales?: string[];
        onReset?: () => void;
        onShare?: () => Promise<void>;
    } = $props();

    onMount(() => {
        if (!manifestUrl) {
            manifestUrl = DEFAULT_MANIFEST_URL;
            onLoad();
        }
    });

    const languageNames: Record<string, string> = {
        en: 'English',
        de: 'Deutsch',
    };

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            onLoad();
        }
    }
</script>

<header class="header">
    <!-- Top Row: Branding & Global Settings -->
    <div class="top-row">
        <a href="/" class="brand">Triiiceratops</a>
        <a href={DOCUMENTATION_PATH} class="sh-btn">{m.docs()}</a>

        <div class="spacer"></div>

        <div class="sh-group viewer-mode">
            <span title={m.viewer_variant_tooltip_core()}>
                <input
                    class="sh-btn sh-segment"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_core()}
                    value="core"
                    bind:group={viewerMode}
                />
            </span>
            <span title={m.viewer_variant_tooltip_full()}>
                <input
                    class="sh-btn sh-segment"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_full()}
                    value="image"
                    bind:group={viewerMode}
                />
            </span>
            {#if isDev}
                <span title={m.viewer_variant_tooltip_custom_theme()}>
                    <input
                        class="sh-btn sh-segment"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_custom_theme()}
                        value="custom-theme"
                        bind:group={viewerMode}
                    />
                </span>
                <span title={m.viewer_variant_svelte_component_tooltip()}>
                    <input
                        class="sh-btn sh-segment"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_svelte()}
                        value="svelte"
                        bind:group={viewerMode}
                    />
                </span>
            {/if}
        </div>

        <select
            class="sh-select lang-select"
            value={language.current}
            onchange={(e) => (language.current = e.currentTarget.value)}
            aria-label={m.language_select_label()}
        >
            {#each DEMO_LOCALES as lang (lang)}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </select>

        <ThemeToggle onchange={(theme) => (pageTheme = theme)} />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end settings-dropdown">
            <div
                tabindex="0"
                role="button"
                class="sh-btn sh-btn--quiet sh-btn--icon"
                aria-label={m.settings_label()}
            >
                <DemoIcon name="gear" size={20} />
            </div>
            <div class="dropdown-content settings-panel">
                <SettingsMenu
                    bind:config
                    {viewerTheme}
                    {onThemeChange}
                    {baseConfig}
                    {availableLocales}
                    {onReset}
                    {onShare}
                    class="menu settings-menu"
                />
            </div>
        </div>

        <span title={m.github()}>
            <a
                href="https://github.com/d-flood/triiiceratops"
                class="sh-btn sh-btn--quiet sh-btn--icon icon-link"
            >
                <DemoIcon name="githubLogo" size={20} />
            </a>
        </span>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="bottom-row">
        <span class="sh-caption controls-heading">
            {m.demo_header_external_controls()}
        </span>

        <!-- Manifest URL -->
        <div class="control-group manifest-group">
            <label for="manifest-input" class="manifest-label">
                {m.iiif_manifest_label()}
            </label>
            <div class="sh-group manifest-controls">
                <input
                    type="text"
                    id="manifest-input"
                    class="sh-field manifest-input"
                    bind:value={manifestUrl}
                    onkeydown={handleKeydown}
                    placeholder={m.manifest_placeholder()}
                    autocomplete="off"
                />
                <button
                    type="button"
                    onclick={onLoad}
                    class="sh-btn load-button"
                >
                    {m.load()}
                </button>
            </div>
        </div>

        <div class="divider"></div>

        <!-- Canvas Selector -->
        <div class="control-group canvas-group">
            <label class="sh-caption canvas-label" for="canvas-id-select">
                {m.demo_header_active_canvas()}
            </label>
            <select
                id="canvas-id-select"
                class="sh-select canvas-select"
                bind:value={canvasId}
                disabled={canvases.length === 0}
            >
                {#if canvases.length === 0}
                    <option value="" disabled>{m.no_canvases_loaded()}</option>
                {:else}
                    {#each canvases as canvas, i (getCanvasId(canvas))}
                        <option value={getCanvasId(canvas)}>
                            {getCanvasLabel(canvas, i)}
                        </option>
                    {/each}
                {/if}
            </select>
        </div>
    </div>
</header>

<style>
    /* ===== Layout shell =====
       Two ruled rows on the raised ground, so the chrome reads as a band across
       the top of the page rather than as a card floating on it. */
    .header {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        position: relative;
        z-index: 800;
        background: var(--paper);
        border-bottom: 1px solid var(--rule);
    }

    .top-row {
        display: flex;
        align-items: center;
        gap: var(--s4);
        min-width: 0;
        padding: var(--s2) var(--s4);
        border-bottom: 1px solid var(--rule);
    }

    .bottom-row {
        display: flex;
        align-items: center;
        gap: var(--s4);
        min-width: 0;
        padding: var(--s2) var(--s4);
        background: var(--bench);
    }

    .spacer {
        flex: 1 1 0%;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: var(--s2);
        min-width: 0;
    }

    .divider {
        width: 1px;
        height: var(--s4);
        margin-inline: var(--s2);
        background: var(--rule-2);
    }

    /* Visually hidden but accessible */
    .manifest-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    .canvas-label,
    .controls-heading {
        white-space: nowrap;
    }

    .brand {
        display: inline-flex;
        align-items: center;
        flex: none;
        font-size: var(--t-h3);
        font-weight: 600;
        text-decoration: none;
        color: var(--ink);
    }
    .brand:hover {
        color: var(--link);
    }

    /* ===== Dropdown scaffolding ===== */
    .dropdown {
        position: relative;
        display: inline-block;
    }
    .dropdown-content {
        position: absolute;
        z-index: 999;
    }
    /* End-aligned dropdowns open to the inline-end edge. */
    .dropdown-end .dropdown-content {
        inset-inline-end: 0;
    }

    /* Settings dropdown is a <div> trigger revealed via :focus-within. The
       manifest dropdown is a native <details> and is intentionally NOT covered
       here — it opens/closes through the browser's <details>[open] mechanism. */
    .settings-dropdown {
        display: none;
    }
    @media (width < 1024px) {
        .settings-dropdown {
            display: inline-block;
        }
    }
    .settings-dropdown .dropdown-content {
        opacity: 0;
        scale: 95%;
        display: block;
        visibility: hidden;
        pointer-events: none;
        transform-origin: top;
    }
    @media (prefers-reduced-motion: no-preference) {
        .settings-dropdown .dropdown-content {
            transition-property: opacity, scale;
            transition-duration: 0.2s;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
    }
    .settings-dropdown:focus-within .dropdown-content {
        opacity: 1;
        scale: 100%;
        visibility: visible;
        pointer-events: auto;
    }

    .settings-panel {
        z-index: 20;
        width: min(20rem, calc(100vw - 1rem));
        max-height: calc(100dvh - 4rem);
        overflow: hidden;
        background: var(--paper);
        border: 1px solid var(--rule-2);
        border-radius: 2px;
        box-shadow: 0 14px 34px -24px rgb(60 40 10 / 0.55);
    }

    /* SettingsMenu receives class="menu settings-menu". These rules give that
       panel its padding, max-height, vertical scroll, and no-wrap layout. */
    .settings-panel :global(.settings-menu) {
        padding: var(--s2);
        max-height: 80vh;
        overflow-y: auto;
        flex-wrap: nowrap;
    }

    /* ===== Field widths ===== */
    .top-row :global(.lang-select) {
        width: auto;
    }
    .control-group :global(.manifest-input) {
        width: 300px;
    }
    .control-group :global(.canvas-select) {
        width: 200px;
    }
    .manifest-controls {
        flex: 1 1 auto;
    }
    .manifest-controls :global(.manifest-input) {
        flex: 1 1 auto;
    }

    @media (width < 768px) {
        .top-row {
            flex-wrap: wrap;
            gap: var(--s2);
            padding: var(--s2) var(--s3);
        }

        .bottom-row {
            flex-wrap: wrap;
            align-items: stretch;
            gap: var(--s2);
            padding: var(--s2) var(--s3);
        }

        .spacer,
        .divider {
            display: none;
        }

        .brand {
            margin-inline-end: auto;
            font-size: 1rem;
        }

        .viewer-mode {
            order: 10;
            flex: 1 0 100%;
            overflow: hidden;
        }

        .viewer-mode > :global(*) {
            flex: 1 1 0;
            min-width: 0;
        }

        .viewer-mode :global(.sh-segment) {
            width: 100%;
            min-width: 0;
            padding-inline: var(--s2);
        }

        .top-row :global(.lang-select) {
            flex: 0 1 7.5rem;
            width: 7.5rem;
        }

        .controls-heading {
            flex: 1 0 100%;
        }

        .manifest-group,
        .canvas-group {
            flex: 1 1 100%;
            align-items: stretch;
        }

        .manifest-group {
            flex-direction: column;
        }

        .manifest-controls {
            display: flex;
            width: 100%;
        }

        .manifest-controls :global(.manifest-input) {
            width: 100%;
            min-width: 0;
        }

        .manifest-controls :global(.load-button) {
            min-width: 4.5rem;
        }

        .canvas-group {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: center;
        }

        .canvas-group :global(.canvas-select) {
            width: 100%;
            min-width: 0;
        }
    }

    @media (width < 480px) {
        .top-row,
        .bottom-row {
            padding-inline: var(--s2);
        }

        .brand {
            font-size: 0.95rem;
        }

        .viewer-mode :global(.sh-segment) {
            padding-inline: var(--s1);
            font-size: var(--t-tiny);
        }

        .canvas-group {
            grid-template-columns: minmax(0, 1fr);
            gap: var(--s1);
        }
    }

    @media (width < 380px) {
        .icon-link {
            display: none;
        }

        .top-row :global(.lang-select) {
            width: 6.5rem;
        }
    }
</style>
