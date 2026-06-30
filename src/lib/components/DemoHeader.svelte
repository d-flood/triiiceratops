<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import Gear from 'phosphor-svelte/lib/Gear';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import ThemeToggle from './ThemeToggle.svelte';
    import SettingsMenu from './SettingsMenu.svelte';
    import { Button, Select, TextInput, Tooltip } from './ui';

    import { m, language } from '../state/i18n.svelte';
    import type { BuiltInTheme } from '../theme/types';
    import { manifestsState } from '../state/manifests.svelte';
    import { locales, setLocale } from '../paraglide/runtime.js';
    import { getCanvasLabel } from '../utils/canvasLabels';

    import { onMount } from 'svelte';

    const isDev = import.meta.env.DEV;
    const multiTargetDemoManifestUrl = `${import.meta.env.BASE_URL}demo-manifests/multi-target-array/manifest.json`;

    const SUGGESTED_MANIFESTS = [
        {
            label: 'Wellcome Collection (b18035723)',
            url: 'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
        },
        {
            label: 'Self-Portrait Dedicated to Paul Gauguin',
            url: 'https://iiif.harvardartmuseums.org/manifests/object/299843',
        },
        {
            label: 'CSNTM (MNTGRCP40)',
            url: 'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
        },
        {
            label: 'Bodleian Library MS. Ind. Inst. Misc. 22',
            url: 'https://iiif.bodleian.ox.ac.uk/iiif/manifest/e32a277e-91e2-4a6d-8ba6-cc4bad230410.json',
        },
        {
            label: 'Yugoslavia',
            url: 'https://zavicajna.digitalna.rs/iiif/api/presentation/3/96571949-03d6-478e-ab44-a2d5ad68f935%252F00000001%252Fostalo01%252F00000071/manifest',
        },
        {
            label: '0001 Simplest Manifest - Single Image',
            url: 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json',
        },
        {
            label: '0004 Image and Canvas with Differing Dimensions',
            url: 'https://iiif.io/api/cookbook/recipe/0004-canvas-size/manifest.json',
        },
        {
            label: '0005 IIIF Image Service',
            url: 'https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json',
        },
        {
            label: '0006 Internationalization and Multi-language Values',
            url: 'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json',
        },
        {
            label: '0007 Embedding HTML in Descriptive Properties',
            url: 'https://iiif.io/api/cookbook/recipe/0007-string-formats/manifest.json',
        },
        {
            label: '0008 Rights Statement',
            url: 'https://iiif.io/api/cookbook/recipe/0008-rights/manifest.json',
        },
        {
            label: '0009 Simple Manifest - Book',
            url: 'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
        },
        {
            label: '0010 Viewing Direction (RTL)',
            url: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
        },
        {
            label: '0010 Viewing Direction (TTB)',
            url: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-ttb.json',
        },
        {
            label: '0011 Book Behavior Variations (Continuous)',
            url: 'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-continuous.json',
        },
        {
            label: '0011 Book Behavior Variations (Individuals)',
            url: 'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-individuals.json',
        },
        {
            label: '0019 HTML in Annotations',
            url: 'https://iiif.io/api/cookbook/recipe/0019-html-in-annotations/manifest.json',
        },
        {
            label: '0021 Simple Annotation - Tagging',
            url: 'https://iiif.io/api/cookbook/recipe/0021-tagging/manifest.json',
        },
        {
            label: '0024 Table of Contents',
            url: 'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
        },
        {
            label: '0027 Alternative Page Sequences',
            url: 'https://iiif.io/api/cookbook/recipe/0027-alternative-page-order/manifest.json',
        },
        {
            label: '0029 Metadata on Any Resource',
            url: 'https://iiif.io/api/cookbook/recipe/0029-metadata-anywhere/manifest.json',
        },
        {
            label: '0030 Multi-volume Work',
            url: 'https://iiif.io/api/cookbook/recipe/0030-multi-volume/collection.json',
        },
        {
            label: '0031 Multiple Volumes in a Single Bound Volume',
            url: 'https://iiif.io/api/cookbook/recipe/0031-bound-multivolume/manifest.json',
        },
        {
            label: '0032 Simple Collection',
            url: 'https://iiif.io/api/cookbook/recipe/0032-collection/collection.json',
        },
        {
            label: '0033 Multiple Choice of Images',
            url: 'https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json',
        },
        {
            label: '0035 Foldouts, Flaps, and Maps',
            url: 'https://iiif.io/api/cookbook/recipe/0035-foldouts/manifest.json',
        },
        {
            label: '0036 Composition from Multiple Images',
            url: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
        },
        {
            label: '0046 Alternative Representations',
            url: 'https://iiif.io/api/cookbook/recipe/0046-rendering/manifest.json',
        },
        {
            label: '0047 Homepage',
            url: 'https://iiif.io/api/cookbook/recipe/0047-homepage/manifest.json',
        },
        {
            label: '0053 seeAlso',
            url: 'https://iiif.io/api/cookbook/recipe/0053-seeAlso/manifest.json',
        },
        {
            label: '0117 Manifest Thumbnail',
            url: 'https://iiif.io/api/cookbook/recipe/0117-add-image-thumbnail/manifest.json',
        },
        {
            label: '0118 Multiple Values with Language Maps',
            url: 'https://iiif.io/api/cookbook/recipe/0118-multivalue/manifest.json',
        },
        {
            label: '0135 Annotating a Specific Point',
            url: 'https://iiif.io/api/cookbook/recipe/0135-annotating-point-in-canvas/manifest.json',
        },
        {
            label: 'Multi-Target Annotation Array',
            url: multiTargetDemoManifestUrl,
        },
        {
            label: '0202 Start Canvas',
            url: 'https://iiif.io/api/cookbook/recipe/0202-start-canvas/manifest.json',
        },
        {
            label: '0230 Navigation by Chronology',
            url: 'https://iiif.io/api/cookbook/recipe/0230-navdate/navdate-collection.json',
        },
        {
            label: '0234 Provider',
            url: 'https://iiif.io/api/cookbook/recipe/0234-provider/manifest.json',
        },
        {
            label: '0261 Non-Rectangular Polygon Annotation',
            url: 'https://iiif.io/api/cookbook/recipe/0261-non-rectangular-commenting/manifest.json',
        },
        {
            label: '0266 Full-Canvas Annotation',
            url: 'https://iiif.io/api/cookbook/recipe/0266-full-canvas-annotation/manifest.json',
        },
        {
            label: '0269 Embedded or Referenced Annotations',
            url: 'https://iiif.io/api/cookbook/recipe/0269-embedded-or-referenced-annotations/manifest.json',
        },
        {
            label: '0283 Missing Images in a Sequence',
            url: 'https://iiif.io/api/cookbook/recipe/0283-missing-image/manifest.json',
        },
        {
            label: '0299 Addressing a Spatial Region',
            url: 'https://iiif.io/api/cookbook/recipe/0299-region/manifest.json',
        },
    ];

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
        canvasId = $bindable(''),
        config = $bindable({}),
        selectedTheme = $bindable('light'),
        availableLocales = [],
        onReset,
        onShare,
    }: {
        manifestUrl: string;
        onLoad: () => void;
        viewerMode: string;
        canvasId: string;
        config: any;
        selectedTheme?: BuiltInTheme;
        availableLocales?: string[];
        onReset?: () => void;
        onShare?: () => Promise<void>;
    } = $props();

    onMount(() => {
        if (!manifestUrl) {
            manifestUrl = SUGGESTED_MANIFESTS[0].url;
            onLoad();
        }
    });

    let isCustom = $derived(
        !SUGGESTED_MANIFESTS.some((m) => m.url === manifestUrl),
    );

    let canvases = $derived(
        manifestUrl ? manifestsState.getCanvases(manifestUrl) : [],
    );
    let selectedManifestLabel = $derived(
        SUGGESTED_MANIFESTS.find((manifest) => manifest.url === manifestUrl)
            ?.label ?? m.try_your_own(),
    );
    let manifestDropdownOpen = $state(false);

    function selectManifest(value: string) {
        manifestUrl = value;
        manifestDropdownOpen = false;
        onLoad();
    }

    function selectCustomManifest() {
        manifestUrl = '';
        manifestDropdownOpen = false;
    }

    const languageNames: Record<string, string> = {
        en: 'English',
        de: 'Deutsch',
    };

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            onLoad();
        }
    }

    // Initialize from config
    let activeSearchTerm = $state(config.search?.query || '');
    let searchInitialized = false;

    $effect(() => {
        // Only update if not yet initialized and config has a value (e.g. from URL load)
        if (!searchInitialized && config.search?.query) {
            activeSearchTerm = config.search.query;
            searchInitialized = true;
        }
    });

    function handleSearchKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && config.search) {
            config.search.query = activeSearchTerm;
        }
    }
</script>

<header class="header">
    <!-- Top Row: Branding & Global Settings -->
    <div class="top-row">
        <a href="/triiiceratops/" class="btn-link ghost brand">Triiiceratops</a>
        <a href="/triiiceratops/" class="btn-link outline primary">{m.docs()}</a>

        <div class="spacer"></div>

        <div class="join">
            <Tooltip
                tip={m.viewer_variant_tooltip_core()}
                placement="bottom"
            >
                <input
                    class="join-item btn-radio"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_core()}
                    value="core"
                    bind:group={viewerMode}
                />
            </Tooltip>
            <Tooltip
                tip={m.viewer_variant_tooltip_full()}
                placement="bottom"
            >
                <input
                    class="join-item btn-radio"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_full()}
                    value="image"
                    bind:group={viewerMode}
                />
            </Tooltip>
            {#if isDev}
                <Tooltip
                    tip={m.viewer_variant_tooltip_custom_theme()}
                    placement="bottom"
                >
                    <input
                        class="join-item btn-radio"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_custom_theme()}
                        value="custom-theme"
                        bind:group={viewerMode}
                    />
                </Tooltip>
                <Tooltip
                    tip={m.viewer_variant_svelte_component_tooltip()}
                    placement="bottom"
                >
                    <input
                        class="join-item btn-radio"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_svelte()}
                        value="svelte"
                        bind:group={viewerMode}
                    />
                </Tooltip>
            {/if}
        </div>

        <Select
            size="sm"
            class="lang-select"
            value={language.current}
            onchange={(e) => setLocale(e.currentTarget.value as any)}
            aria-label={m.language_select_label()}
        >
            {#each locales as lang (lang)}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </Select>

        <ThemeToggle bind:theme={selectedTheme} />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end settings-dropdown">
            <div
                tabindex="0"
                role="button"
                class="btn-trigger"
                aria-label={m.settings_label()}
            >
                <Gear size={20} />
            </div>
            <div class="dropdown-content settings-panel">
                <SettingsMenu
                    bind:config
                    {availableLocales}
                    {onReset}
                    {onShare}
                    class="menu settings-menu"
                />
            </div>
        </div>

        <Tooltip tip={m.github()} placement="bottom">
            <a
                href="https://github.com/d-flood/triiiceratops"
                class="btn-link ghost icon-link"
            >
                <GithubLogo size={20} />
            </a>
        </Tooltip>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="bottom-row">
        <span class="controls-heading">{m.demo_header_external_controls()}</span>

        <!-- Manifest Selector -->
        <div class="control-group">
            <label for="manifest-select" class="manifest-label">
                {m.iiif_manifest_label()}
            </label>
            <div class="control-group">
                <details
                    class="dropdown"
                    bind:open={manifestDropdownOpen}
                    id="manifest-select"
                >
                    <summary class="manifest-summary">
                        {selectedManifestLabel}
                    </summary>
                    <div class="dropdown-content manifest-panel">
                        <ul class="menu menu-xs manifest-menu">
                            {#each SUGGESTED_MANIFESTS as manifest (manifest.url)}
                                <li>
                                    <button
                                        type="button"
                                        class:active={manifest.url ===
                                            manifestUrl}
                                        onclick={() => selectManifest(manifest.url)}
                                    >
                                        {manifest.label}
                                    </button>
                                </li>
                            {/each}
                            <li>
                                <button
                                    type="button"
                                    class:active={isCustom}
                                    onclick={selectCustomManifest}
                                >
                                    {m.try_your_own()}
                                </button>
                            </li>
                        </ul>
                    </div>
                </details>

                {#if isCustom}
                    <TextInput
                        id="manifest-input"
                        size="xs"
                        class="manifest-input"
                        bind:value={manifestUrl}
                        onkeydown={handleKeydown}
                        placeholder={m.manifest_placeholder()}
                        autocomplete="off"
                    />
                    <Button onclick={onLoad} variant="primary" size="xs">
                        {m.load()}
                    </Button>
                {/if}
            </div>
        </div>

        <div class="divider"></div>

        <!-- Canvas Selector -->
        <div class="control-group">
            <label class="canvas-label" for="canvas-id-select">
                {m.demo_header_active_canvas()}
            </label>
            <Select
                id="canvas-id-select"
                size="xs"
                class="canvas-select"
                bind:value={canvasId}
                disabled={canvases.length === 0}
            >
                {#if canvases.length === 0}
                    <option value="" disabled>{m.no_canvases_loaded()}</option>
                {:else}
                    {#each canvases as canvas, i (canvas.id)}
                        <option value={canvas.id}>
                            {getCanvasLabel(canvas, i)}
                        </option>
                    {/each}
                {/if}
            </Select>
        </div>

        <div class="divider"></div>

        <!-- Search Input -->
        <div class="control-group">
            <label class="search-label" for="external-search-input">
                <MagnifyingGlass size={14} />
                <span class="sr-only">{m.search()}</span>
            </label>
            {#if config.search}
                <TextInput
                    id="external-search-input"
                    size="xs"
                    class="search-input"
                    placeholder={m.search_panel_placeholder()}
                    bind:value={activeSearchTerm}
                    onkeydown={handleSearchKeydown}
                />
            {/if}
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
        background-color: var(--panel-bg);
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--surface-border);
    }

    .top-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: color-mix(
            in oklab,
            var(--surface-border) 50%,
            transparent
        );
    }

    .bottom-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        background-color: color-mix(
            in oklab,
            var(--surface-border) 30%,
            transparent
        );
    }

    .spacer {
        flex: 1 1 0%;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .divider {
        width: 1px;
        height: 1rem;
        margin-inline: 0.5rem;
        background-color: color-mix(
            in oklab,
            var(--content) 20%,
            transparent
        );
    }

    /* Visually hidden but accessible */
    .manifest-label,
    .sr-only {
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

    .search-label {
        display: flex;
        align-items: center;
        gap: 0.25rem;
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
        height: calc(var(--size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        border-width: var(--border);
        border-style: solid;
        border-color: transparent;
        border-radius: var(--radius-field);
        color: var(--content);
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
                var(--content) 10%,
                transparent
            );
        }
    }

    /* Outline + primary (docs link) */
    .btn-link.outline.primary {
        background-color: transparent;
        color: var(--color-primary);
        border-color: var(--color-primary);
    }
    @media (hover: hover) {
        .btn-link.outline.primary:hover {
            background-color: var(--color-primary);
            color: var(--color-primary-content);
            border-color: var(--color-primary);
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
        height: calc(var(--size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        border-width: var(--border);
        border-style: solid;
        border-color: transparent;
        border-radius: var(--radius-field);
        color: var(--content);
        background-color: transparent;
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    @media (hover: hover) {
        .btn-trigger:hover {
            background-color: color-mix(
                in oklab,
                var(--content) 10%,
                transparent
            );
        }
    }

    /* ===== join (segmented control wrapper) ===== */
    .join {
        display: inline-flex;
        align-items: stretch;
    }

    /* Radio inputs styled as joined buttons (.btn-sm look) */
    .btn-radio {
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: calc(var(--size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        --btn-bg: var(--btn-color, var(--panel-bg));
        --btn-fg: var(--content);
        --btn-border: color-mix(
            in oklab,
            var(--btn-bg),
            #000 calc(var(--depth) * 5%)
        );
        --btn-shadow:
            0 3px 2px -2px
                color-mix(in oklab, var(--btn-bg) calc(var(--depth) * 30%), #0000),
            0 4px 3px -2px
                color-mix(in oklab, var(--btn-bg) calc(var(--depth) * 30%), #0000);
        color: var(--btn-fg);
        background-color: var(--btn-bg);
        border-width: var(--border);
        border-style: solid;
        border-color: var(--btn-border);
        text-shadow: 0 0.5px oklch(100% 0 0 / calc(var(--depth) * 0.15));
        box-shadow:
            0 0.5px 0 0.5px oklch(100% 0 0 / calc(var(--depth) * 6%)) inset,
            var(--btn-shadow);
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
        /* join radii: default square (0); first/last/only override below. */
        border-start-start-radius: var(--join-ss, 0);
        border-start-end-radius: var(--join-se, 0);
        border-end-end-radius: var(--join-ee, 0);
        border-end-start-radius: var(--join-es, 0);
    }
    @media (hover: hover) {
        .btn-radio:hover {
            background-color: color-mix(
                in oklab,
                var(--btn-bg, var(--panel-bg)),
                #000 7%
            );
        }
    }
    .btn-radio[aria-label]::after {
        content: attr(aria-label);
    }
    .btn-radio:checked {
        --btn-color: var(--color-primary);
        --btn-fg: var(--color-primary-content);
        isolation: isolate;
    }

    /* Join radius shaping. The radio lives inside a Tooltip <span>, which is the
       direct join child, so we set join vars on the inner .btn-radio based on the
       span's position. Items keep their own borders with no negative margins, so
       adjacent borders do not collapse — we intentionally add none here. */
    .join > :global(:first-child:not(:last-child) .btn-radio) {
        --join-ss: var(--radius-field);
        --join-se: 0;
        --join-es: var(--radius-field);
        --join-ee: 0;
    }
    .join > :global(:last-child:not(:first-child) .btn-radio) {
        --join-ss: 0;
        --join-se: var(--radius-field);
        --join-es: 0;
        --join-ee: var(--radius-field);
    }
    .join > :global(:only-child .btn-radio) {
        --join-ss: var(--radius-field);
        --join-se: var(--radius-field);
        --join-es: var(--radius-field);
        --join-ee: var(--radius-field);
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

    /* Settings dropdown is a <div> trigger revealed via :focus-within
       (mirrors the original group-focus-within:visible behavior). The manifest
       dropdown is a native <details> and is intentionally NOT covered here —
       it opens/closes through the browser's <details>[open] mechanism. */
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
        width: 20rem;
        overflow: hidden;
        background-color: var(--viewer-bg);
        border-radius: var(--radius-box);
        border-width: 1px;
        border-style: solid;
        border-color: var(--surface-border);
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

    /* ===== Manifest selector ===== */
    /* <summary> styled like select select-bordered select-xs */
    .manifest-summary {
        --input-color: color-mix(
            in oklab,
            var(--content) 20%,
            #0000
        );
        --size: calc(var(--size-field, 0.25rem) * 6);
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        width: 28rem;
        max-width: 60vw;
        height: var(--size);
        padding-inline: 0.75rem 1.75rem;
        font-size: 0.875rem;
        color: inherit;
        vertical-align: middle;
        cursor: pointer;
        position: relative;
        list-style: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        appearance: none;
        background-color: var(--viewer-bg);
        border: var(--border) solid var(--input-color);
        border-radius: var(--radius-field);
        box-shadow:
            0 1px
                color-mix(
                    in oklab,
                    var(--input-color) calc(var(--depth) * 10%),
                    #0000
                )
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        background-image: linear-gradient(45deg, #0000 50%, currentColor 50%),
            linear-gradient(135deg, currentColor 50%, #0000 50%);
        background-position:
            calc(100% - 20px) calc(1px + 50%),
            calc(100% - 16.1px) calc(1px + 50%);
        background-repeat: no-repeat;
        background-size:
            4px 4px,
            4px 4px;
    }
    .manifest-summary::-webkit-details-marker {
        display: none;
    }
    .manifest-summary:focus {
        outline: none;
    }

    .manifest-panel {
        z-index: 30;
        margin-top: 0.25rem;
        width: 28rem;
        max-width: 60vw;
        overflow: hidden;
        background-color: var(--viewer-bg);
        border-radius: var(--radius-box);
        border-width: 1px;
        border-style: solid;
        border-color: var(--surface-border);
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
    }

    /* Menu styling for the manifest list */
    .menu {
        --menu-active-fg: var(--color-neutral-content);
        --menu-active-bg: var(--color-neutral);
        display: flex;
        flex-flow: column wrap;
        width: fit-content;
        padding: 0.5rem;
        font-size: 0.875rem;
    }
    .manifest-menu {
        width: 100%;
        max-height: 60vh;
        overflow-y: auto;
        flex-wrap: nowrap;
    }
    .menu :global(li) {
        display: flex;
        flex-flow: column wrap;
        flex-shrink: 0;
        align-items: stretch;
        position: relative;
    }
    .menu :global(li > button) {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(auto, max-content) auto max-content;
        align-content: flex-start;
        align-items: center;
        gap: 0.5rem;
        text-align: start;
        text-wrap: balance;
        user-select: none;
        border-radius: var(--radius-field);
        /* menu-xs sizing */
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
        font-size: 0.6875rem;
        background-color: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        transition-property: color, background-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    .menu :global(li > button:hover) {
        cursor: pointer;
        background-color: color-mix(
            in oklab,
            var(--content) 10%,
            transparent
        );
        box-shadow:
            inset 0 1px oklch(0% 0 0 / 0.01),
            inset 0 -1px oklch(100% 0 0 / 0.01);
    }
    .menu :global(li > button:active) {
        color: var(--menu-active-fg);
        background-color: var(--menu-active-bg);
    }
    .menu :global(li > button:focus-visible) {
        cursor: pointer;
        background-color: color-mix(
            in oklab,
            var(--content) 10%,
            transparent
        );
        color: var(--content);
        outline: none;
    }

    /* ===== Field width overrides for primitives ===== */
    .control-group :global(.manifest-input) {
        width: 300px;
    }
    .control-group :global(.canvas-select) {
        width: 200px;
    }
    .control-group :global(.search-input) {
        width: 150px;
    }
</style>
