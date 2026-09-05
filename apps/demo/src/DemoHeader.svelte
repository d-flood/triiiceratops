<script lang="ts">
    import DemoIcon from './DemoIcon.svelte';
    import LightDarkToggle from './LightDarkToggle.svelte';
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
        demoTheme = $bindable('light'),
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
        demoTheme?: 'light' | 'dark';
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
        <a href="/triiiceratops/" class="btn-link ghost brand">Triiiceratops</a>
        <a href="/triiiceratops/" class="btn-link outline primary">{m.docs()}</a
        >

        <div class="spacer"></div>

        <div class="join viewer-mode">
            <span title={m.viewer_variant_tooltip_core()}>
                <input
                    class="join-item btn-radio"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_core()}
                    value="core"
                    bind:group={viewerMode}
                />
            </span>
            <span title={m.viewer_variant_tooltip_full()}>
                <input
                    class="join-item btn-radio"
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
                        class="join-item btn-radio"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_custom_theme()}
                        value="custom-theme"
                        bind:group={viewerMode}
                    />
                </span>
                <span title={m.viewer_variant_svelte_component_tooltip()}>
                    <input
                        class="join-item btn-radio"
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
            class="lang-select"
            value={language.current}
            onchange={(e) => (language.current = e.currentTarget.value)}
            aria-label={m.language_select_label()}
        >
            {#each DEMO_LOCALES as lang (lang)}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </select>

        <LightDarkToggle bind:theme={demoTheme} />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end settings-dropdown">
            <div
                tabindex="0"
                role="button"
                class="btn-trigger"
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
                class="btn-link ghost icon-link"
            >
                <DemoIcon name="githubLogo" size={20} />
            </a>
        </span>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="bottom-row">
        <span class="controls-heading">{m.demo_header_external_controls()}</span
        >

        <!-- Manifest URL -->
        <div class="control-group manifest-group">
            <label for="manifest-input" class="manifest-label">
                {m.iiif_manifest_label()}
            </label>
            <div class="control-group manifest-controls">
                <input
                    type="text"
                    id="manifest-input"
                    class="manifest-input"
                    bind:value={manifestUrl}
                    onkeydown={handleKeydown}
                    placeholder={m.manifest_placeholder()}
                    autocomplete="off"
                />
                <button type="button" onclick={onLoad} class="load-button">
                    {m.load()}
                </button>
            </div>
        </div>

        <div class="divider"></div>

        <!-- Canvas Selector -->
        <div class="control-group canvas-group">
            <label class="canvas-label" for="canvas-id-select">
                {m.demo_header_active_canvas()}
            </label>
            <select
                id="canvas-id-select"
                class="canvas-select"
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
    /* ===== Layout shell ===== */
    .header {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        position: relative;
        z-index: 800;
        background-color: #f4f4f4;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: #d8d8d8;
    }

    .top-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 0;
        padding: 0.5rem 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: color-mix(in oklab, #d8d8d8 50%, transparent);
    }

    .bottom-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 0;
        padding: 0.5rem 1rem;
        background-color: color-mix(in oklab, #d8d8d8 30%, transparent);
    }

    .spacer {
        flex: 1 1 0%;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }

    .manifest-controls {
        flex: 1 1 auto;
    }

    .divider {
        width: 1px;
        height: 1rem;
        margin-inline: 0.5rem;
        background-color: color-mix(in oklab, currentColor 20%, transparent);
    }

    /* Visually hidden but accessible */
    .manifest-label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
    }

    /* ===== Text bits ===== */
    .controls-heading {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.7;
    }

    .canvas-label {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.7;
    }

    /* ===== Anchor "buttons" (.btn look on <a>, not real buttons) ===== */
    .btn-link {
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: 2rem;
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        touch-action: manipulation;
        border-width: 1px;
        border-style: solid;
        border-color: transparent;
        border-radius: 4px;
        color: currentColor;
        background-color: transparent;
        text-decoration: none;
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }

    /* Ghost: transparent until hover */
    .btn-link.ghost {
        background-color: transparent;
        border-color: transparent;
    }
    @media (hover: hover) {
        .btn-link.ghost:hover {
            background-color: color-mix(
                in oklab,
                currentColor 10%,
                transparent
            );
        }
    }

    /* Outline + primary (docs link) */
    .btn-link.outline.primary {
        background-color: transparent;
        color: #1a5fb4;
        border-color: #1a5fb4;
    }
    @media (hover: hover) {
        .btn-link.outline.primary:hover {
            background-color: #1a5fb4;
            color: #ffffff;
            border-color: #1a5fb4;
        }
    }

    /* Branding link extras: font-bold text-lg */
    .brand {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    /* ===== Settings trigger (div[role=button] styled as ghost btn-sm) ===== */
    .btn-trigger {
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: 2rem;
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        touch-action: manipulation;
        border-width: 1px;
        border-style: solid;
        border-color: transparent;
        border-radius: 4px;
        color: currentColor;
        background-color: transparent;
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    @media (hover: hover) {
        .btn-trigger:hover {
            background-color: color-mix(
                in oklab,
                currentColor 10%,
                transparent
            );
        }
    }

    /* ===== join (segmented control wrapper) ===== */
    .join {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
    }

    .viewer-mode {
        max-width: 100%;
    }

    /* Radio inputs drawn as a joined row of buttons. */
    .btn-radio {
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: 2rem;
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        color: currentColor;
        background-color: #f4f4f4;
        border: 1px solid #c8c8c8;
        /* Square by default; the first, last and only items round below. */
        border-radius: 0;
    }
    @media (hover: hover) {
        .btn-radio:hover {
            background-color: #e6e6e6;
        }
    }
    .btn-radio[aria-label]::after {
        content: attr(aria-label);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .btn-radio:checked {
        background-color: #1a5fb4;
        border-color: #1a5fb4;
        color: #ffffff;
        isolation: isolate;
    }
    .btn-radio:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }

    /* Join radius shaping. The radio lives inside a tooltip <span>, which is the
       direct join child, so the rounding is selected by the span's position.
       Items keep their own borders with no negative margins, so adjacent borders
       do not collapse — we intentionally add none here. */
    .join > :global(:first-child:not(:last-child) .btn-radio) {
        border-start-start-radius: 4px;
        border-end-start-radius: 4px;
    }
    .join > :global(:last-child:not(:first-child) .btn-radio) {
        border-start-end-radius: 4px;
        border-end-end-radius: 4px;
    }
    .join > :global(:only-child .btn-radio) {
        border-radius: 4px;
    }

    /* ===== Language Select width override (w-auto) ===== */
    .top-row :global(.lang-select) {
        width: auto;
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
        background-color: #ffffff;
        border-radius: 6px;
        border-width: 1px;
        border-style: solid;
        border-color: #d8d8d8;
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
    }

    /* SettingsMenu receives class="menu settings-menu". These rules give that
       panel its padding, max-height, vertical scroll, and no-wrap layout. */
    .settings-panel :global(.settings-menu) {
        padding: 0.5rem;
        max-height: 80vh;
        overflow-y: auto;
        flex-wrap: nowrap;
    }

    /* ===== Field width overrides for primitives ===== */
    .control-group :global(.manifest-input) {
        width: 300px;
    }
    .control-group :global(.canvas-select) {
        width: 200px;
    }

    @media (width < 768px) {
        .top-row {
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
        }

        .bottom-row {
            flex-wrap: wrap;
            align-items: stretch;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
        }

        .spacer,
        .divider {
            display: none;
        }

        .brand {
            justify-content: flex-start;
            margin-inline-end: auto;
            padding-inline: 0.5rem;
            font-size: 1rem;
        }

        .btn-link.outline.primary,
        .icon-link,
        .btn-trigger {
            padding-inline: 0.625rem;
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

        .viewer-mode :global(.btn-radio) {
            width: 100%;
            min-width: 0;
            padding-inline: 0.5rem;
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
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            width: 100%;
            align-items: stretch;
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

        .canvas-label {
            white-space: nowrap;
        }

        .canvas-group :global(.canvas-select) {
            width: 100%;
            min-width: 0;
        }
    }

    @media (width < 480px) {
        .top-row,
        .bottom-row {
            padding-inline: 0.5rem;
        }

        .btn-link,
        .btn-trigger,
        .btn-radio {
            height: 2rem;
        }

        .brand {
            font-size: 0.95rem;
        }

        .viewer-mode :global(.btn-radio) {
            padding-inline: 0.375rem;
            font-size: 0.6875rem;
        }

        .manifest-controls {
            grid-template-columns: minmax(0, 1fr);
        }

        .manifest-controls :global(.load-button) {
            width: 100%;
        }

        .canvas-group {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.25rem;
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
