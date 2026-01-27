<script lang="ts">
    import { m } from '../state/i18n.svelte';
    import Check from 'phosphor-svelte/lib/Check';
    import Copy from 'phosphor-svelte/lib/Copy';

    let { config = $bindable(), class: className = '' } = $props();

    let copied = $state(false);

    function copyConfig() {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    }
</script>

<ul class={className}>
    <li class="menu-title px-4 py-2">
        {m.settings_category_general()}
    </li>
    <li>
        <label class="label cursor-pointer py-1">
            <span class="label-text">{m.settings_transparent_background()}</span
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
            <span class="label-text">{m.settings_toggle_canvas_nav()}</span>
            <input
                type="checkbox"
                class="toggle toggle-sm"
                bind:checked={config.showCanvasNav}
            />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer py-1">
            <span class="label-text">{m.settings_toggle_zoom_controls()}</span>
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
            <summary>{m.settings_submenu_toolbar()}</summary>
            <ul>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_show_toggle()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            checked={config.showToggle !== false}
                            onchange={(e) => {
                                config.showToggle = e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toolbar_open()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-sm"
                            bind:checked={config.toolbarOpen}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toolbar_position()}</span
                        >
                        <select
                            class="select select-bordered select-xs w-24"
                            value={config.toolbarPosition ?? 'left'}
                            onchange={(e) => {
                                config.toolbarPosition = (
                                    e.currentTarget as HTMLSelectElement
                                ).value as 'left' | 'right' | 'top';
                            }}
                        >
                            <option value="left"
                                >{m.settings_position_left()}</option
                            >
                            <option value="right"
                                >{m.settings_position_right()}</option
                            >
                            <option value="top"
                                >{m.settings_position_top()}</option
                            >
                        </select>
                    </label>
                </li>
                <div class="divider my-1"></div>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_show_search()}</span
                        >
                        <input
                            type="checkbox"
                            class="checkbox checkbox-xs"
                            checked={config.toolbar?.showSearch ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showSearch =
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
                            checked={config.toolbar?.showGallery ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showGallery =
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
                            checked={config.toolbar?.showAnnotations ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showAnnotations =
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
                            checked={config.toolbar?.showFullscreen ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showFullscreen =
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
                            checked={config.toolbar?.showInfo ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showInfo =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_show_viewing_mode()}</span
                        >
                        <input
                            type="checkbox"
                            class="checkbox checkbox-xs"
                            checked={config.toolbar?.showViewingMode ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showViewingMode =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="label cursor-pointer py-1">
                        <span class="label-text">{m.viewing_mode_label()}</span>
                        <select
                            class="select select-bordered select-xs"
                            value={config.viewingMode ?? 'individuals'}
                            onchange={(e) => {
                                config.viewingMode = (
                                    e.currentTarget as HTMLSelectElement
                                ).value as 'individuals' | 'paged';
                            }}
                        >
                            <option value="individuals"
                                >{m.viewing_mode_individuals()}</option
                            >
                            <option value="paged"
                                >{m.viewing_mode_paged()}</option
                            >
                        </select>
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
                                if (!config.gallery) config.gallery = {};
                                config.gallery.open = e.currentTarget.checked;
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
                            checked={config.gallery?.draggable ?? true}
                            onchange={(e) => {
                                if (!config.gallery) config.gallery = {};
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
                            checked={config.gallery?.showCloseButton ?? true}
                            onchange={(e) => {
                                if (!config.gallery) config.gallery = {};
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
                            value={config.gallery?.dockPosition ?? 'bottom'}
                            onchange={(e) => {
                                if (!config.gallery) config.gallery = {};
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
                <li>
                    <label class="label cursor-pointer py-1 gap-2">
                        <span class="label-text"
                            >{m.settings_thumbnail_height()}</span
                        >
                        <input
                            type="range"
                            min="50"
                            max="300"
                            value={config.gallery?.fixedHeight ?? 120}
                            class="range range-xs range-primary w-24"
                            oninput={(e) => {
                                if (!config.gallery) config.gallery = {};
                                config.gallery.fixedHeight = parseInt(
                                    e.currentTarget.value,
                                );
                            }}
                        />
                        <span class="text-xs opacity-50 w-8 text-right"
                            >{config.gallery?.fixedHeight ?? 120}px</span
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
                    <label class="label cursor-pointer py-1">
                        <span class="label-text"
                            >{m.settings_toggle_open()}</span
                        >
                        <input
                            type="checkbox"
                            class="toggle toggle-xs"
                            checked={config.search?.open ?? false}
                            onchange={(e) => {
                                if (!config.search) config.search = {};
                                config.search.open = e.currentTarget.checked;
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
                            checked={config.search?.showCloseButton ?? true}
                            onchange={(e) => {
                                if (!config.search) config.search = {};
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
                            value={config.search?.position ?? 'right'}
                            onchange={(e) => {
                                if (!config.search) config.search = {};
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
                            value={parseInt(config.search?.width ?? '320')}
                            class="range range-xs range-primary w-32"
                            oninput={(e) => {
                                if (!config.search) config.search = {};
                                config.search.width = `${e.currentTarget.value}px`;
                            }}
                        />
                        <span class="text-xs opacity-50 w-8 text-right"
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
                            checked={config.annotations?.open ?? false}
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
                            checked={config.annotations?.visible ?? true}
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
