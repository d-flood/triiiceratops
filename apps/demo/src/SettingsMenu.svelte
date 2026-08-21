<script lang="ts">
    import DemoIcon from './DemoIcon.svelte';
    import { m } from './i18n.svelte';
    import { BUILTIN_THEMES, type BuiltInTheme } from 'triiiceratops';

    /*
     * The viewer's own default for `renderer.zoomPerWheelNotch`, restated so the
     * slider can mark it. Core does not export the constant; keep it in step
     * with `packages/core/src/lib/renderer/rendererDefaults.ts` if that default
     * ever changes.
     */
    const DEFAULT_ZOOM_PER_WHEEL_NOTCH = 1.15;

    let {
        config = $bindable(),
        viewerTheme = 'light',
        onThemeChange,
        baseConfig,
        availableLocales = [],
        class: className = '',
        onReset,
        onShare,
    }: {
        config: any;
        viewerTheme?: BuiltInTheme;
        onThemeChange?: (theme: BuiltInTheme) => void;
        baseConfig?: any;
        availableLocales?: string[];
        class?: string;
        onReset?: () => void;
        onShare?: () => Promise<void>;
    } = $props();

    // When the demo is loaded via an `iiif-content` state URL, the "Docked rail"
    // preset starts with the toolbar already open rather than collapsed.
    const hasIiifContent =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('iiif-content');

    // Each preset is a layout only — the independent chrome knobs (controls /
    // nav / toolbar). Selecting one applies that layout without touching the
    // viewer theme. The final "Custom" entry reveals the full configuration UI.
    type Preset = {
        id: string;
        label: string;
        config: Record<string, any>;
    };

    const PRESETS: Preset[] = [
        {
            id: 'docked',
            label: 'Docked rail',
            config: {
                controls: 'split',
                toolbarOpen: hasIiifContent,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'bottom', align: 'center' },
                toolbar: { side: 'left', anchor: 'center' },
            },
        },
        {
            id: 'unified',
            label: 'Unified bar',
            config: {
                controls: 'unified',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'bottom', align: 'center' },
            },
        },
        {
            id: 'floating',
            label: 'Floating',
            config: {
                controls: 'unified',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'floating', edge: 'bottom', align: 'center' },
            },
        },
        {
            id: 'top',
            label: 'Top bar',
            config: {
                controls: 'unified',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'top', align: 'center' },
            },
        },
        {
            id: 'corners',
            label: 'Opposite corners',
            config: {
                controls: 'split',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'floating', edge: 'bottom', align: 'end' },
                toolbar: { side: 'left', anchor: 'top' },
            },
        },
        {
            id: 'traditional',
            label: 'Traditional',
            config: {
                controls: 'split',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'bottom', align: 'center' },
                toolbar: { side: 'left', anchor: 'center' },
                information: { open: false, position: 'right' },
                gallery: { open: true, dockPosition: 'bottom' },
            },
        },
        {
            id: 'unified-top-right',
            label: 'Top-right',
            config: {
                controls: 'unified',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'top', align: 'end' },
                information: { open: false },
                gallery: { open: false },
            },
        },
        {
            id: 'gallery-left',
            label: 'Gallery on left',
            config: {
                controls: 'split',
                toolbarOpen: true,
                showCanvasNav: true,
                showZoomControls: true,
                nav: { style: 'docked', edge: 'bottom', align: 'center' },
                toolbar: { side: 'right', anchor: 'center' },
                gallery: { open: true, dockPosition: 'left' },
            },
        },
        {
            id: 'minimal',
            label: 'Minimal',
            config: {
                controls: 'split',
                showCanvasNav: false,
                showZoomControls: false,
                showToggle: true,
                toolbarOpen: false,
                toolbar: {
                    side: 'left',
                    anchor: 'top',
                    showSearch: false,
                    showGallery: false,
                    showAnnotations: false,
                    showFullscreen: true,
                    showInfo: true,
                    showViewingMode: false,
                    showStructures: false,
                    showCollection: false,
                },
            },
        },
        {
            id: 'plain',
            label: 'Plain',
            config: {
                showCanvasNav: false,
                showToggle: false,
                toolbarOpen: false,
                showZoomControls: false,
            },
        },
    ];

    // 'presets' shows the vertical button group; 'custom' expands the full
    // configuration UI and collapses the presets into a dropdown.
    let mode = $state<'presets' | 'custom'>('presets');
    let activePreset = $state<string | null>('docked');

    function applyPreset(preset: Preset) {
        const base = structuredClone(baseConfig ?? config ?? {});
        config = {
            ...base,
            ...preset.config,
            nav: { ...base.nav, ...preset.config.nav },
            toolbar: { ...base.toolbar, ...preset.config.toolbar },
            gallery: { ...base.gallery, ...preset.config.gallery },
            information: { ...base.information, ...preset.config.information },
        };
        activePreset = preset.id;
        mode = 'presets';
    }

    function enterCustom() {
        activePreset = null;
        mode = 'custom';
    }

    let copied = $state(false);
    let shared = $state(false);
    let viewerLocaleOptions = $derived.by(() => {
        return [...new Set(availableLocales)].sort((a, b) =>
            a.localeCompare(b),
        );
    });

    function copyConfig() {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }

    async function shareState() {
        if (onShare) {
            await onShare();
            shared = true;
            setTimeout(() => {
                shared = false;
            }, 2000);
        }
    }
</script>

<div class="config-pane {className}">
    <!-- Viewer theme picker: the four built-in themes. Choosing one decouples
         the viewer theme from the demo's light/dark toggle. -->
    <div class="theme-group">
        <span class="group-label">Viewer theme Examples</span>
        <div class="theme-grid">
            {#each BUILTIN_THEMES as t (t)}
                <button
                    type="button"
                    data-theme={t}
                    class="theme-chip"
                    class:active={viewerTheme === t}
                    aria-pressed={viewerTheme === t}
                    onclick={() => onThemeChange?.(t)}
                >
                    <span class="chip-icon"
                        ><DemoIcon name="paletteFill" size={16} /></span
                    >
                    <span class="chip-name">{t}</span>
                </button>
            {/each}
        </div>
    </div>

    <div class="divider"></div>

    <!-- Config presets. Always a vertical button group; the "Custom" entry
         reveals the full configuration UI below instead of applying a layout. -->
    <div class="preset-group">
        <span class="group-label">Custom Layout Examples</span>
        <div class="preset-list">
            {#each PRESETS as preset (preset.id)}
                <button
                    type="button"
                    class="preset-btn"
                    class:active={activePreset === preset.id}
                    aria-pressed={activePreset === preset.id}
                    onclick={() => applyPreset(preset)}
                >
                    {preset.label}
                </button>
            {/each}
            <button
                type="button"
                class="preset-btn preset-btn--custom"
                class:active={mode === 'custom'}
                aria-pressed={mode === 'custom'}
                onclick={enterCustom}
            >
                Make your own
            </button>
        </div>
    </div>

    <div class="detail-collapse" class:open={mode === 'custom'}>
        <div class="detail-inner">
            <ul class="settings-menu-root">
                <li class="menu-title">
                    {m.settings_category_general()}
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_transparent_background()}</span>
                        <input
                            type="checkbox"
                            bind:checked={config.transparentBackground}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_canvas_nav()}</span>
                        <input
                            type="checkbox"
                            bind:checked={config.showCanvasNav}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_zoom_controls()}</span>
                        <input
                            type="checkbox"
                            bind:checked={config.showZoomControls}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>Preserve authored canvas scale</span>
                        <input
                            type="checkbox"
                            bind:checked={config.preserveCanvasScale}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label settings-label--gap2">
                        <span>Left panel width</span>
                        <input
                            type="range"
                            style="width:8rem"
                            min="200"
                            max="800"
                            value={parseInt(config.leftPanelWidth ?? '320')}
                            oninput={(e) => {
                                config.leftPanelWidth = `${e.currentTarget.value}px`;
                            }}
                        />
                        <span class="value-readout"
                            >{config.leftPanelWidth ?? '320px'}</span
                        >
                    </label>
                </li>
                <li>
                    <label class="settings-label settings-label--gap2">
                        <span>Right panel width</span>
                        <input
                            type="range"
                            style="width:8rem"
                            min="200"
                            max="800"
                            value={parseInt(config.rightPanelWidth ?? '320')}
                            oninput={(e) => {
                                config.rightPanelWidth = `${e.currentTarget.value}px`;
                            }}
                        />
                        <span class="value-readout"
                            >{config.rightPanelWidth ?? '320px'}</span
                        >
                    </label>
                </li>
                <div class="divider"></div>

                <li class="menu-title">Viewer Language</li>
                <li>
                    <div class="locale-block">
                        <label
                            class="settings-label settings-label--static"
                            for="viewer-locale-select"
                        >
                            <span>Viewer locale (IIIF)</span>
                        </label>
                        <select
                            id="viewer-locale-select"
                            style="width:100%"
                            value={config.locale ?? ''}
                            onchange={(e) => {
                                const value = (
                                    e.currentTarget as HTMLSelectElement
                                ).value;
                                config.locale = value || undefined;
                            }}
                            aria-label="Viewer locale"
                        >
                            <option value="">Follow app</option>
                            {#each viewerLocaleOptions as locale (locale)}
                                <option value={locale}>{locale}</option>
                            {/each}
                        </select>
                    </div>
                </li>

                <div class="divider"></div>

                <li class="menu-title">
                    {m.settings_category_configuration()}
                </li>

                <li>
                    <details>
                        <summary>Nav</summary>
                        <ul>
                            <li>
                                <label
                                    class="settings-label settings-label--static"
                                    for="controls-select"
                                >
                                    <span>Controls</span>
                                    <select
                                        id="controls-select"
                                        value={config.controls ?? 'split'}
                                        onchange={(e) => {
                                            config.controls = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value as any;
                                        }}
                                    >
                                        <option value="split">Split</option>
                                        <option value="unified">Unified</option>
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--static"
                                    for="nav-select"
                                >
                                    <span>Style</span>
                                    <select
                                        id="nav-select"
                                        value={config.nav?.style ?? 'docked'}
                                        onchange={(e) => {
                                            config.nav = {
                                                ...config.nav,
                                                style: (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value as any,
                                            };
                                        }}
                                    >
                                        <option value="docked">Docked</option>
                                        <option value="floating"
                                            >Floating</option
                                        >
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--static"
                                    for="nav-edge-select"
                                >
                                    <span>Edge</span>
                                    <select
                                        id="nav-edge-select"
                                        value={config.nav?.edge ?? 'bottom'}
                                        onchange={(e) => {
                                            config.nav = {
                                                ...config.nav,
                                                edge: (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value as any,
                                            };
                                        }}
                                    >
                                        <option value="top">Top</option>
                                        <option value="bottom">Bottom</option>
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--static"
                                    for="nav-align-select"
                                >
                                    <span>Align</span>
                                    <select
                                        id="nav-align-select"
                                        value={config.nav?.align ?? 'center'}
                                        onchange={(e) => {
                                            config.nav = {
                                                ...config.nav,
                                                align: (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value as any,
                                            };
                                        }}
                                    >
                                        <option value="start">Start</option>
                                        <option value="center">Center</option>
                                        <option value="end">End</option>
                                    </select>
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_toolbar()}</summary>
                        <ul>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_toggle()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.showToggle !== false}
                                        onchange={(e) => {
                                            config.showToggle =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        bind:checked={config.toolbarOpen}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toolbar_position()}</span>
                                    <select
                                        style="width:6rem"
                                        value={config.toolbar?.side ?? 'left'}
                                        onchange={(e) => {
                                            config.toolbar = {
                                                ...config.toolbar,
                                                side: (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value as any,
                                            };
                                        }}
                                    >
                                        <option value="left"
                                            >{m.settings_position_left()}</option
                                        >
                                        <option value="right"
                                            >{m.settings_position_right()}</option
                                        >
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>Toolbar anchor</span>
                                    <select
                                        style="width:6rem"
                                        value={config.toolbar?.anchor ??
                                            'center'}
                                        onchange={(e) => {
                                            config.toolbar = {
                                                ...config.toolbar,
                                                anchor: (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value as any,
                                            };
                                        }}
                                    >
                                        <option value="center">Sides</option>
                                        <option value="top">Top</option>
                                    </select>
                                </label>
                            </li>
                            <div class="divider"></div>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_search()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar?.showSearch ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showSearch =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_gallery()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar?.showGallery ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showGallery =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_annotations()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar
                                            ?.showAnnotations ?? true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showAnnotations =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_fullscreen()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar
                                            ?.showFullscreen ?? true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showFullscreen =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toggle_show_info()}</span>
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar?.showInfo ??
                                            true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showInfo =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_viewing_mode()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar
                                            ?.showViewingMode ?? true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showViewingMode =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_structures()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar
                                            ?.showStructures ?? true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showStructures =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_collection()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.toolbar
                                            ?.showCollection ?? true}
                                        onchange={(e) => {
                                            if (!config.toolbar)
                                                config.toolbar = {};
                                            config.toolbar.showCollection =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>{m.viewing_mode_label()}</span>
                                    <select
                                        value={config.viewingMode ??
                                            'individuals'}
                                        onchange={(e) => {
                                            config.viewingMode = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value as
                                                | 'individuals'
                                                | 'paged'
                                                | 'continuous';
                                        }}
                                    >
                                        <option value="individuals"
                                            >{m.viewing_mode_individuals()}</option
                                        >
                                        <option value="paged"
                                            >{m.viewing_mode_paged()}</option
                                        >
                                        <option value="continuous"
                                            >{m.viewing_mode_continuous()}</option
                                        >
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>{m.viewing_direction_label()}</span>
                                    <select
                                        value={config.viewingDirection ??
                                            'left-to-right'}
                                        onchange={(e) => {
                                            config.viewingDirection = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value as
                                                | 'left-to-right'
                                                | 'right-to-left'
                                                | 'top-to-bottom'
                                                | 'bottom-to-top';
                                        }}
                                    >
                                        <option value="left-to-right"
                                            >{m.viewing_direction_ltr()}</option
                                        >
                                        <option value="right-to-left"
                                            >{m.viewing_direction_rtl()}</option
                                        >
                                        <option value="top-to-bottom"
                                            >{m.viewing_direction_ttb()}</option
                                        >
                                        <option value="bottom-to-top"
                                            >{m.viewing_direction_btt()}</option
                                        >
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_paged_view_offset()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.pagedViewOffset ?? true}
                                        onchange={(e) => {
                                            config.pagedViewOffset =
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
                                <label class="settings-label">
                                    <span>{m.settings_toggle_open()}</span>
                                    <input
                                        type="checkbox"
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
                                <label class="settings-label">
                                    <span>{m.settings_toggle_expanded()}</span>
                                    <input
                                        type="checkbox"
                                        checked={config.gallery?.expanded ??
                                            false}
                                        onchange={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.expanded =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
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
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        style="width:6rem"
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
                                    </select>
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span>{m.settings_gallery_size()}</span>
                                    <!-- The gallery's own thickness: the band's
                                         height or the rail's width, whichever axis
                                         its position commits to. A thumbnail's
                                         chrome is paid for out of this number, so
                                         the floor leaves room for one — see
                                         `galleryGeometry`. -->
                                    <input
                                        type="range"
                                        style="width:6rem"
                                        min="90"
                                        max="340"
                                        value={config.gallery?.size ?? 100}
                                        oninput={(e) => {
                                            if (!config.gallery)
                                                config.gallery = {};
                                            config.gallery.size = parseInt(
                                                e.currentTarget.value,
                                            );
                                        }}
                                    />
                                    <span class="value-readout"
                                        >{config.gallery?.size ?? 100}px</span
                                    >
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
                                <label class="settings-label">
                                    <span>{m.settings_toggle_open()}</span>
                                    <input
                                        type="checkbox"
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
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
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
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        style="width:6rem"
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
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_annotations()}</summary>
                        <ul>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toggle_panel_open()}</span
                                    >
                                    <input
                                        type="checkbox"
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
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.annotations
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.annotations)
                                                config.annotations = {};
                                            config.annotations.showCloseButton =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        style="width:6rem"
                                        value={config.annotations?.position ??
                                            'right'}
                                        onchange={(e) => {
                                            if (!config.annotations)
                                                config.annotations = {};
                                            config.annotations.position = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value as 'left' | 'right';
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
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_information()}</summary>
                        <ul>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toggle_panel_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.information?.open ??
                                            false}
                                        onchange={(e) => {
                                            if (!config.information)
                                                config.information = {};
                                            config.information.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.information
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.information)
                                                config.information = {};
                                            config.information.showCloseButton =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_show_canvas_info_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.information
                                            ?.showButton ?? true}
                                        onchange={(e) => {
                                            if (!config.information)
                                                config.information = {};
                                            config.information.showButton =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_select_dock_position()}</span
                                    >
                                    <select
                                        style="width:6rem"
                                        value={config.information?.position ??
                                            'right'}
                                        onchange={(e) => {
                                            if (!config.information)
                                                config.information = {};
                                            config.information.position = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value as 'left' | 'right';
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
                        </ul>
                    </details>
                </li>

                <li>
                    <details>
                        <summary>{m.settings_submenu_structures()}</summary>
                        <ul>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toggle_panel_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.structures?.open ??
                                            false}
                                        onchange={(e) => {
                                            if (!config.structures)
                                                config.structures = {};
                                            config.structures.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.structures
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.structures)
                                                config.structures = {};
                                            config.structures.showCloseButton =
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
                        <summary>{m.settings_submenu_collection()}</summary>
                        <ul>
                            <li>
                                <label class="settings-label">
                                    <span>{m.settings_toggle_panel_open()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.collection?.open ??
                                            false}
                                        onchange={(e) => {
                                            if (!config.collection)
                                                config.collection = {};
                                            config.collection.open =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            </li>
                            <li>
                                <label class="settings-label">
                                    <span
                                        >{m.settings_toggle_close_button()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        checked={config.collection
                                            ?.showCloseButton ?? true}
                                        onchange={(e) => {
                                            if (!config.collection)
                                                config.collection = {};
                                            config.collection.showCloseButton =
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
                        <summary>{m.settings_submenu_renderer()}</summary>
                        <ul>
                            <li>
                                <label
                                    class="settings-label settings-label--gap2"
                                >
                                    <span
                                        >{m.settings_zoom_per_wheel_notch()}</span
                                    >
                                    <!-- Zoom applied by one wheel notch (~100px
                                         of deltaY), and by the same distance of
                                         trackpad scroll — one knob moves both,
                                         because the viewer deliberately does not
                                         detect which device is in use. The range
                                         spans ~14 notches to double at the low
                                         end and under 2 at the high end, which
                                         brackets the useful ground either side
                                         of the default. -->
                                    <input
                                        type="range"
                                        style="width:6rem"
                                        min="1.05"
                                        max="1.5"
                                        step="0.01"
                                        value={config.renderer
                                            ?.zoomPerWheelNotch ??
                                            DEFAULT_ZOOM_PER_WHEEL_NOTCH}
                                        oninput={(e) => {
                                            if (!config.renderer)
                                                config.renderer = {};
                                            config.renderer.zoomPerWheelNotch =
                                                parseFloat(
                                                    e.currentTarget.value,
                                                );
                                        }}
                                    />
                                    <span class="value-readout"
                                        >{(
                                            config.renderer
                                                ?.zoomPerWheelNotch ??
                                            DEFAULT_ZOOM_PER_WHEEL_NOTCH
                                        ).toFixed(2)}&times;</span
                                    >
                                </label>
                            </li>
                        </ul>
                    </details>
                </li>

                <div class="divider"></div>
                {#if onReset}
                    <li>
                        <button
                            type="button"
                            class="action-btn"
                            onclick={onReset}
                        >
                            <DemoIcon name="arrowCounterClockwise" size={16} />
                            {m.reset_config()}
                        </button>
                    </li>
                {/if}
                <li>
                    <button
                        type="button"
                        class="action-btn"
                        class:action-btn--done={copied}
                        onclick={copyConfig}
                    >
                        {#if copied}
                            <DemoIcon name="check" size={16} />
                            {m.copied()}
                        {:else}
                            <DemoIcon name="copy" size={16} />
                            {m.copy_config()}
                        {/if}
                    </button>
                </li>
                {#if onShare}
                    <li>
                        <button
                            type="button"
                            class="action-btn"
                            class:action-btn--done={shared}
                            onclick={shareState}
                        >
                            {#if shared}
                                <DemoIcon name="check" size={16} />
                                {m.link_copied()}
                            {:else}
                                <DemoIcon name="shareNetwork" size={16} />
                                {m.share_current_state()}
                            {/if}
                        </button>
                    </li>
                {/if}
            </ul>
        </div>
    </div>
</div>

<style>
    .config-pane {
        display: flex;
        flex-direction: column;
    }

    .group-label {
        display: block;
        color: color-mix(in oklab, currentColor 40%, transparent);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding-inline: 0.5rem;
        padding-block: 0.5rem 0.375rem;
    }

    .theme-group {
        padding-inline: 0.25rem;
    }
    .theme-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.375rem;
        padding-inline: 0.25rem;
    }
    /* Each chip is rendered in its own theme (data-theme) so it previews that
       theme's button radius, background, and content color directly. */
    .theme-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        padding: 0.5rem 0.5rem;
        border-radius: 4px;
        border: 1px solid #d8d8d8;
        background-color: #ffffff;
        color: currentColor;
        cursor: pointer;
        text-align: center;
        transition:
            box-shadow 0.2s,
            border-color 0.2s;
    }
    .theme-chip.active {
        border-color: #1a5fb4;
        box-shadow: 0 0 0 2px #1a5fb4;
    }
    .chip-icon {
        display: inline-flex;
        flex-shrink: 0;
        color: #1a5fb4;
    }
    .chip-name {
        font-size: 0.75rem;
        text-transform: capitalize;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .preset-group {
        padding-inline: 0.25rem;
    }
    .preset-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.375rem;
        padding-inline: 0.25rem;
    }
    .preset-btn {
        display: block;
        width: 100%;
        text-align: center;
        padding: 0.5rem 0.75rem;
        font-size: 0.8125rem;
        font-weight: 600;
        border-radius: 4px;
        border: 1px solid color-mix(in oklab, currentColor 12%, transparent);
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }
    @media (hover: hover) {
        .preset-btn:hover {
            background-color: color-mix(in oklab, currentColor 8%, transparent);
        }
    }
    .preset-btn.active {
        border-color: #1a5fb4;
        background-color: #1a5fb4;
        color: #ffffff;
    }
    .preset-btn--custom {
        border-style: dashed;
        grid-column: 1 / -1;
    }

    .detail-collapse {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.3s ease;
    }
    .detail-collapse.open {
        grid-template-rows: 1fr;
    }
    .detail-inner {
        overflow: hidden;
        min-height: 0;
    }
    @media (prefers-reduced-motion: reduce) {
        .detail-collapse {
            transition: none;
        }
    }

    .menu-title {
        color: color-mix(in oklab, currentColor 40%, transparent);
        font-weight: 600;
        font-size: 0.875rem;
        padding-inline: 1rem;
        padding-block: 0.5rem;
    }

    .settings-label {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        white-space: nowrap;
        cursor: pointer;
        padding-block: 0.25rem;
    }
    .settings-label--gap2 {
        gap: 0.5rem;
    }
    /* The viewer-locale label had no cursor-pointer. */
    .settings-label--static {
        cursor: default;
    }

    .value-readout {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.5;
        width: 2rem;
        text-align: right;
    }

    .locale-block {
        padding-inline: 1rem;
        padding-block: 0.5rem;
    }

    .divider {
        display: flex;
        flex-direction: row;
        align-items: center;
        align-self: stretch;
        white-space: nowrap;
        height: 1rem;
        margin-block: 0.25rem;
        margin-inline: 0;
    }
    .divider::before,
    .divider::after {
        content: '';
        flex-grow: 1;
        width: 100%;
        height: 0.125rem;
        background-color: color-mix(in oklab, currentColor 10%, transparent);
    }

    .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.5rem;
        width: 100%;
        padding: 0.375rem 0.75rem;
        font: inherit;
        text-align: start;
        background-color: transparent;
        border: 0;
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
    }
    @media (hover: hover) {
        .action-btn:hover {
            background-color: color-mix(in oklab, currentColor 8%, transparent);
        }
    }
    .action-btn--done {
        color: #26a269;
    }

    /* Root menu layout. Padding/width are left to the consumer-provided
       className. */
    .settings-menu-root {
        display: flex;
        flex-direction: column;
        font-size: 0.875rem;
    }

    summary {
        list-style: none;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(auto, max-content) auto max-content;
        align-content: flex-start;
        align-items: center;
        gap: 0.5rem;
        text-align: start;
        text-wrap: balance;
        user-select: none;
        -webkit-user-select: none;
        border-radius: 4px;
        padding-block: 0.375rem;
        padding-inline: 0.75rem;
        transition-property: color, background-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    summary::-webkit-details-marker {
        display: none;
    }
    summary::after {
        content: '';
        display: block;
        justify-self: flex-end;
        pointer-events: none;
        width: 0.375rem;
        height: 0.375rem;
        transform-origin: 50%;
        box-shadow: inset 2px 2px;
        translate: 0 -1px;
        rotate: -135deg;
        transition-property: rotate, translate;
        transition-duration: 0.2s;
    }
    details[open] > summary::after {
        translate: 0 1px;
        rotate: 45deg;
    }
    summary:hover {
        cursor: pointer;
        background-color: color-mix(in oklab, currentColor 10%, transparent);
    }

    details {
        overflow: hidden;
    }

    details > ul {
        position: relative;
        margin-inline-start: 1rem;
        padding-inline-start: 0.5rem;
        white-space: nowrap;
    }
    details > ul::before {
        content: '';
        position: absolute;
        inset-inline-start: 0;
        top: 0.75rem;
        bottom: 0.75rem;
        width: 1px;
        background-color: currentColor;
        opacity: 0.1;
    }
</style>
