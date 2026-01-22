<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import Gear from 'phosphor-svelte/lib/Gear';
    import Copy from 'phosphor-svelte/lib/Copy';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import ThemeToggle from './ThemeToggle.svelte';

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
    ];

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
        canvasId = $bindable(''),
        config = $bindable({}),
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
        } catch (e) {
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
    import Check from 'phosphor-svelte/lib/Check';

    let copied = $state(false);

    function copyConfig() {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
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
            {#each locales as lang}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </select>

        <ThemeToggle />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end group">
            <div
                tabindex="0"
                role="button"
                class="btn btn-ghost btn-sm"
                aria-label={m.settings_label()}
            >
                <Gear size={20} />
            </div>
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <ul
                tabindex="-1"
                class="dropdown-content z-20 menu bg-base-100 rounded-box w-80 p-2 shadow border border-base-300 max-h-[80vh] overflow-y-auto block invisible pointer-events-none group-focus-within:visible group-focus-within:pointer-events-auto"
            >
                <li class="menu-title px-4 py-2">
                    {m.settings_category_general()}
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_transparent_background()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.transparentBackground}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_left_menu()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.showLeftMenu}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_right_menu()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.showRightMenu}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_canvas_nav()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.showCanvasNav}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_zoom_controls()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.showZoomControls}
                        />
                    </label>
                </li>

                <div class="divider my-1"></div>

                <li class="menu-title px-4 py-2">
                    {m.settings_category_configuration()}
                </li>

                <li>
                    <details>
                        <summary
                            >{m.settings_submenu_right_menu_items()}</summary
                        >
                        <ul>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_show_search()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.rightMenu?.showSearch ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.rightMenu)
                                                config.rightMenu = {};
                                            config.rightMenu.showSearch =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_show_gallery()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.rightMenu
                                            ?.showGallery ?? true}
                                        onchange={(e) => {
                                            if (!config.rightMenu)
                                                config.rightMenu = {};
                                            config.rightMenu.showGallery =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_show_annotations()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.rightMenu
                                            ?.showAnnotations ?? true}
                                        onchange={(e) => {
                                            if (!config.rightMenu)
                                                config.rightMenu = {};
                                            config.rightMenu.showAnnotations =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_show_fullscreen()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.rightMenu
                                            ?.showFullscreen ?? true}
                                        onchange={(e) => {
                                            if (!config.rightMenu)
                                                config.rightMenu = {};
                                            config.rightMenu.showFullscreen =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_show_info()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.rightMenu?.showInfo ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.rightMenu)
                                                config.rightMenu = {};
                                            config.rightMenu.showInfo =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_gallery()}</summary>
                        <ul>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-xs"
                                        checked={config.gallery?.open ?? false}
                                        onchange={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_draggable()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.gallery?.draggable ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.draggable =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.gallery
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.showCloseButton =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1 gap-2">
                                    <span class="label-text"
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        class="select select-bordered select-xs w-24"
                                        value={config.gallery?.dockPosition ??
                                            'bottom'}
                                        onchange={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.dockPosition = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value;
                                        }}
                                        onclick={(e) => e.stopPropagation()}
                                    >
                                        <option value="bottom"
                                            >{m.settings_position_bottom()}</option
                                        >
                                        <option value="top"
                                            >{m.settings_position_top()}</option
                                        >
                                        <option value="left"
                                            >{m.settings_position_left()}</option
                                        >
                                        <option value="right"
                                            >{m.settings_position_right()}</option
                                        >
                                        <option value="none"
                                            >{m.settings_position_floating()}</option
                                        >
                                    </select>
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_search()}</summary>
                        <ul>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-xs"
                                        checked={config.search?.open ?? false}
                                        onchange={(e) => {
                                            if (!config.search)
                                                config.search = {};
                                            config.search.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.search
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.search)
                                                config.search = {};
                                            config.search.showCloseButton =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1 gap-2">
                                    <span class="label-text"
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        class="select select-bordered select-xs w-24"
                                        value={config.search?.position ??
                                            'right'}
                                        onchange={(e) => {
                                            if (!config.search)
                                                config.search = {};
                                            config.search.position = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value;
                                        }}
                                        onclick={(e) => e.stopPropagation()}
                                    >
                                        <option value="right"
                                            >{m.settings_position_right()}</option
                                        >
                                        <option value="left"
                                            >{m.settings_position_left()}</option
                                        >
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1 gap-2">
                                    <span class="label-text"
                                        >{m.settings_panel_width()}</span
                                    >
                                    <input
                                        type="range"
                                        min="200"
                                        max="800"
                                        value={parseInt(
                                            config.search?.width ?? '320',
                                        )}
                                        class="range range-xs range-primary w-32"
                                        oninput={(e) => {
                                            if (!config.search)
                                                config.search = {};
                                            config.search.width = `${e.currentTarget.value}px`;
                                        }}
                                    />
                                    <span
                                        class="text-xs opacity-50 w-8 text-right"
                                        >{config.search?.width ?? '320px'}</span
                                    >
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_annotations()}</summary>
                        <ul>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_panel_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-xs"
                                        checked={config.annotations?.open ??
                                            false}
                                        onchange={(e) => {
                                            if (!config.annotations)
                                                config.annotations = {};
                                            config.annotations.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="label cursor-pointer py-1">
                                    <span class="label-text"
                                        >{m.settings_toggle_visible_by_default()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={config.annotations?.visible ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.annotations)
                                                config.annotations = {};
                                            config.annotations.visible =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>
                <div class="divider my-1"></div>
                <li>
                    <button
                        class="btn btn-sm btn-ghost w-full justify-start gap-2"
                        class:text-success={copied}
                        onclick={copyConfig}
                    >
                        {#if copied}
                            <Check size={16} />
                            {m.copied()}
                        {:else}
                            <Copy size={16} />
                            {m.copy_config()}
                        {/if}
                    </button>
                </li>
            </ul>
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
                    class="select select-bordered select-xs max-w-xs"
                    value={isCustom ? 'custom' : manifestUrl}
                    onchange={handleSelectChange}
                >
                    {#each SUGGESTED_MANIFESTS as manifest}
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
                    {#each canvases as canvas, i}
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
