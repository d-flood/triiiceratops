<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import Gear from 'phosphor-svelte/lib/Gear';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import ThemeToggle from './ThemeToggle.svelte';
    import SettingsMenu from './SettingsMenu.svelte';

    import { m, language } from '../state/i18n.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import { locales, setLocale } from '../paraglide/runtime.js';

    import { onMount } from 'svelte';

    const isDev = import.meta.env.DEV;

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
            label: '0005 IIIF Image Service',
            url: 'https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json',
        },
        {
            label: '0006 Internationalization and Multi-language Values',
            url: 'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json',
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
            label: '0011 Book Behavior Variations (Continuous)',
            url: 'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-continuous.json',
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
    ];

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
        canvasId = $bindable(''),
        config = $bindable({}),
        availableLocales = [],
        onReset,
        onShare,
    }: {
        manifestUrl: string;
        onLoad: () => void;
        viewerMode: string;
        canvasId: string;
        config: any;
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

    function getCanvasLabel(canvas: any, index: number) {
        try {
            if (canvas.getLabel) {
                const l = canvas.getLabel();
                if (Array.isArray(l) && l.length > 0) return l[0].value;
                if (typeof l === 'string') return l;
            } else if (canvas.label) {
                if (typeof canvas.label === 'string') return canvas.label;
                if (
                    typeof canvas.label === 'object' &&
                    !Array.isArray(canvas.label)
                ) {
                    const keys = Object.keys(canvas.label);
                    if (keys.length > 0) {
                        const val = canvas.label[keys[0]];
                        if (Array.isArray(val)) return val[0];
                        return val;
                    }
                }
            }
        } catch {
            /* ignore */
        }
        return `Canvas ${index + 1}`;
    }

    function handleSelectChange(e: Event) {
        const value = (e.currentTarget as HTMLSelectElement).value;
        if (value !== 'custom') {
            manifestUrl = value;
            onLoad();
        } else {
            manifestUrl = '';
        }
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

<header
    class="flex flex-col bg-base-200 shrink-0 border-b border-base-300 relative z-800"
>
    <!-- Top Row: Branding & Global Settings -->
    <div class="flex gap-4 items-center p-2 px-4 border-b border-base-300/50">
        <a href="/triiiceratops/" class="btn btn-sm btn-ghost font-bold text-lg"
            >Triiiceratops</a
        >
        <a href="/triiiceratops/" class="btn btn-sm btn-outline btn-primary"
            >{m.docs()}</a
        >

        <div class="flex-1"></div>

        <div class="join">
            <div
                class="tooltip tooltip-bottom"
                data-tip={m.viewer_variant_tooltip_core()}
            >
                <input
                    class="join-item btn btn-sm"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_core()}
                    value="core"
                    bind:group={viewerMode}
                />
            </div>
            <div
                class="tooltip tooltip-bottom"
                data-tip={m.viewer_variant_tooltip_full()}
            >
                <input
                    class="join-item btn btn-sm"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_full()}
                    value="image"
                    bind:group={viewerMode}
                />
            </div>
            {#if isDev}
                <div
                    class="tooltip tooltip-bottom"
                    data-tip={m.viewer_variant_tooltip_custom_theme()}
                >
                    <input
                        class="join-item btn btn-sm"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_custom_theme()}
                        value="custom-theme"
                        bind:group={viewerMode}
                    />
                </div>
                <div
                    class="tooltip tooltip-bottom"
                    data-tip={m.viewer_variant_svelte_component_tooltip()}
                >
                    <input
                        class="join-item btn btn-sm"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_svelte()}
                        value="svelte"
                        bind:group={viewerMode}
                    />
                </div>
            {/if}
        </div>

        <select
            class="select select-bordered select-sm w-auto"
            value={language.current}
            onchange={(e) => setLocale(e.currentTarget.value as any)}
            aria-label={m.language_select_label()}
        >
            {#each locales as lang (lang)}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </select>

        <ThemeToggle />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end group lg:hidden">
            <div
                tabindex="0"
                role="button"
                class="btn btn-ghost btn-sm"
                aria-label={m.settings_label()}
            >
                <Gear size={20} />
            </div>
            <SettingsMenu
                bind:config
                {availableLocales}
                {onReset}
                {onShare}
                class="dropdown-content z-20 menu bg-base-100 rounded-box w-80 p-2 shadow border border-base-300 max-h-[80vh] overflow-y-auto block invisible pointer-events-none group-focus-within:visible group-focus-within:pointer-events-auto"
            />
        </div>

        <div class="tooltip tooltip-bottom" data-tip={m.github()}>
            <a
                href="https://github.com/d-flood/triiiceratops"
                class="btn btn-ghost btn-sm"
            >
                <GithubLogo size={20} />
            </a>
        </div>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="flex gap-4 items-center p-2 px-4 bg-base-300/30">
        <span class="text-xs font-bold uppercase tracking-wider opacity-70"
            >{m.demo_header_external_controls()}</span
        >

        <!-- Manifest Selector -->
        <div class="flex gap-2 items-center">
            <label
                for="manifest-select"
                class="text-base-content text-sm whitespace-nowrap sr-only"
            >
                {m.iiif_manifest_label()}
            </label>
            <div class="flex gap-2 items-center">
                <select
                    id="manifest-select"
                    class="select select-bordered select-xs w-[28rem] max-w-[60vw]"
                    value={isCustom ? 'custom' : manifestUrl}
                    onchange={handleSelectChange}
                >
                    {#each SUGGESTED_MANIFESTS as manifest (manifest.url)}
                        <option value={manifest.url}>{manifest.label}</option>
                    {/each}
                    <option value="custom">{m.try_your_own()}</option>
                </select>

                {#if isCustom}
                    <input
                        id="manifest-input"
                        type="text"
                        bind:value={manifestUrl}
                        onkeydown={handleKeydown}
                        placeholder={m.manifest_placeholder()}
                        class="input input-bordered input-xs w-[300px] fade-in"
                        autocomplete="off"
                    />
                    <button onclick={onLoad} class="btn btn-primary btn-xs">
                        {m.load()}
                    </button>
                {/if}
            </div>
        </div>

        <div class="w-px h-4 bg-base-content/20 mx-2"></div>

        <!-- Canvas Selector -->
        <div class="flex gap-2 items-center">
            <label class="text-xs opacity-70" for="canvas-id-select">
                {m.demo_header_active_canvas()}
            </label>
            <select
                id="canvas-id-select"
                bind:value={canvasId}
                class="select select-bordered select-xs w-[200px]"
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
            </select>
        </div>

        <div class="w-px h-4 bg-base-content/20 mx-2"></div>

        <!-- Search Input -->
        <div class="flex gap-2 items-center">
            <label
                class="text-xs opacity-70 flex items-center gap-1"
                for="external-search-input"
            >
                <MagnifyingGlass size={14} />
                <span class="sr-only">{m.search()}</span>
            </label>
            {#if config.search}
                <input
                    id="external-search-input"
                    type="text"
                    placeholder={m.search_panel_placeholder()}
                    class="input input-bordered input-xs w-[150px]"
                    bind:value={activeSearchTerm}
                    onkeydown={handleSearchKeydown}
                />
            {/if}
        </div>
    </div>
</header>
