<script lang="ts">
    import { m } from '../state/i18n.svelte';
    import Check from 'phosphor-svelte/lib/Check';
    import Copy from 'phosphor-svelte/lib/Copy';
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
    import ShareNetwork from 'phosphor-svelte/lib/ShareNetwork';
    import { Button, Toggle, Checkbox, Select, Range } from './ui';

    let {
        config = $bindable(),
        availableLocales = [],
        class: className = '',
        onReset,
        onShare,
    }: {
        config: any;
        availableLocales?: string[];
        class?: string;
        onReset?: () => void;
        onShare?: () => Promise<void>;
    } = $props();

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

<ul class="settings-menu-root {className}">
    <li class="menu-title">
        {m.settings_category_general()}
    </li>
    <li>
        <label class="settings-label">
            <span>{m.settings_transparent_background()}</span>
            <Toggle size="sm" bind:checked={config.transparentBackground} />
        </label>
    </li>
    <li>
        <label class="settings-label">
            <span>{m.settings_toggle_canvas_nav()}</span>
            <Toggle size="sm" bind:checked={config.showCanvasNav} />
        </label>
    </li>
    <li>
        <label class="settings-label">
            <span>{m.settings_toggle_zoom_controls()}</span>
            <Toggle size="sm" bind:checked={config.showZoomControls} />
        </label>
    </li>
    <li>
        <label class="settings-label">
            <span>Preserve authored canvas scale</span>
            <Toggle size="sm" bind:checked={config.preserveCanvasScale} />
        </label>
    </li>
    <li>
        <label class="settings-label settings-label--gap2">
            <span>Left panel width</span>
            <Range
                size="xs"
                color="primary"
                style="width:8rem"
                min="200"
                max="800"
                value={parseInt(config.leftPanelWidth ?? '320')}
                oninput={(e) => {
                    config.leftPanelWidth = `${e.currentTarget.value}px`;
                }}
            />
            <span class="value-readout">{config.leftPanelWidth ?? '320px'}</span>
        </label>
    </li>
    <li>
        <label class="settings-label settings-label--gap2">
            <span>Right panel width</span>
            <Range
                size="xs"
                color="primary"
                style="width:8rem"
                min="200"
                max="800"
                value={parseInt(config.rightPanelWidth ?? '320')}
                oninput={(e) => {
                    config.rightPanelWidth = `${e.currentTarget.value}px`;
                }}
            />
            <span class="value-readout">{config.rightPanelWidth ?? '320px'}</span
            >
        </label>
    </li>
    <div class="divider"></div>

    <li class="menu-title">Viewer Language</li>
    <li>
        <div class="locale-block">
            <label class="settings-label settings-label--static" for="viewer-locale-select">
                <span>Viewer locale (IIIF)</span>
            </label>
            <Select
                id="viewer-locale-select"
                size="sm"
                style="width:100%"
                value={config.locale ?? ''}
                onchange={(e) => {
                    const value = (e.currentTarget as HTMLSelectElement).value;
                    config.locale = value || undefined;
                }}
                aria-label="Viewer locale"
            >
                <option value="">Follow app</option>
                {#each viewerLocaleOptions as locale (locale)}
                    <option value={locale}>{locale}</option>
                {/each}
            </Select>
        </div>
    </li>

    <div class="divider"></div>

    <li class="menu-title">
        {m.settings_category_configuration()}
    </li>

    <li>
        <details>
            <summary>{m.settings_submenu_toolbar()}</summary>
            <ul>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_toggle()}</span>
                        <Toggle
                            size="sm"
                            checked={config.showToggle !== false}
                            onchange={(e) => {
                                config.showToggle = e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_select_dock_position()}</span>
                        <Toggle size="sm" bind:checked={config.toolbarOpen} />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toolbar_position()}</span>
                        <Select
                            size="xs"
                            style="width:6rem"
                            value={config.toolbarPosition ?? 'left'}
                            onchange={(e) => {
                                config.toolbarPosition = (
                                    e.currentTarget as HTMLSelectElement
                                ).value as
                                    | 'left'
                                    | 'right'
                                    | 'top-left'
                                    | 'top-right';
                            }}
                        >
                            <option value="left"
                                >{m.settings_position_left()}</option
                            >
                            <option value="right"
                                >{m.settings_position_right()}</option
                            >
                            <option value="top-left"
                                >{m.settings_position_top_left()}</option
                            >
                            <option value="top-right"
                                >{m.settings_position_top_right()}</option
                            >
                        </Select>
                    </label>
                </li>
                <div class="divider"></div>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_search()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_gallery()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_annotations()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_fullscreen()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_info()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_viewing_mode()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_structures()}</span>
                        <Checkbox
                            size="xs"
                            checked={config.toolbar?.showStructures ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showStructures =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_show_collection()}</span>
                        <Checkbox
                            size="xs"
                            checked={config.toolbar?.showCollection ?? true}
                            onchange={(e) => {
                                if (!config.toolbar) config.toolbar = {};
                                config.toolbar.showCollection =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.viewing_mode_label()}</span>
                        <Select
                            size="xs"
                            value={config.viewingMode ?? 'individuals'}
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
                        </Select>
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.viewing_direction_label()}</span>
                        <Select
                            size="xs"
                            value={config.viewingDirection ?? 'left-to-right'}
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
                        </Select>
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_paged_view_offset()}</span>
                        <Checkbox
                            size="xs"
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
                        <Toggle
                            size="xs"
                            checked={config.gallery?.open ?? false}
                            onchange={(e) => {
                                if (!config.gallery) config.gallery = {};
                                config.gallery.open = e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_draggable()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_close_button()}</span>
                        <Checkbox
                            size="xs"
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
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_select_dock_position()}</span>
                        <Select
                            size="xs"
                            style="width:6rem"
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
                        </Select>
                    </label>
                </li>
                <li>
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_thumbnail_height()}</span>
                        <Range
                            size="xs"
                            color="primary"
                            style="width:6rem"
                            min="50"
                            max="300"
                            value={config.gallery?.fixedHeight ?? 120}
                            oninput={(e) => {
                                if (!config.gallery) config.gallery = {};
                                config.gallery.fixedHeight = parseInt(
                                    e.currentTarget.value,
                                );
                            }}
                        />
                        <span class="value-readout"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_open()}</span>
                        <Toggle
                            size="xs"
                            checked={config.search?.open ?? false}
                            onchange={(e) => {
                                if (!config.search) config.search = {};
                                config.search.open = e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_close_button()}</span>
                        <Toggle
                            size="xs"
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
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_select_dock_position()}</span>
                        <Select
                            size="xs"
                            style="width:6rem"
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
                        </Select>
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
                        <span>{m.settings_toggle_panel_open()}</span>
                        <Toggle
                            size="xs"
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
                    <label class="settings-label">
                        <span>{m.settings_toggle_close_button()}</span>
                        <Toggle
                            size="xs"
                            checked={config.annotations?.showCloseButton ?? true}
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
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_select_dock_position()}</span>
                        <Select
                            size="xs"
                            style="width:6rem"
                            value={config.annotations?.position ?? 'right'}
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
                        </Select>
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
                        <span>{m.settings_toggle_panel_open()}</span>
                        <Toggle
                            size="xs"
                            checked={config.information?.open ?? false}
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
                        <span>{m.settings_toggle_close_button()}</span>
                        <Toggle
                            size="xs"
                            checked={config.information?.showCloseButton ?? true}
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
                    <label class="settings-label settings-label--gap2">
                        <span>{m.settings_select_dock_position()}</span>
                        <Select
                            size="xs"
                            style="width:6rem"
                            value={config.information?.position ?? 'right'}
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
                        </Select>
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
                        <span>{m.settings_toggle_panel_open()}</span>
                        <Toggle
                            size="xs"
                            checked={config.structures?.open ?? false}
                            onchange={(e) => {
                                if (!config.structures) config.structures = {};
                                config.structures.open =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_close_button()}</span>
                        <Toggle
                            size="xs"
                            checked={config.structures?.showCloseButton ?? true}
                            onchange={(e) => {
                                if (!config.structures) config.structures = {};
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
                        <span>{m.settings_toggle_panel_open()}</span>
                        <Toggle
                            size="xs"
                            checked={config.collection?.open ?? false}
                            onchange={(e) => {
                                if (!config.collection) config.collection = {};
                                config.collection.open =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
                <li>
                    <label class="settings-label">
                        <span>{m.settings_toggle_close_button()}</span>
                        <Toggle
                            size="xs"
                            checked={config.collection?.showCloseButton ?? true}
                            onchange={(e) => {
                                if (!config.collection) config.collection = {};
                                config.collection.showCloseButton =
                                    e.currentTarget.checked;
                            }}
                        />
                    </label>
                </li>
            </ul>
        </details>
    </li>

    <div class="divider"></div>
    {#if onReset}
        <li>
            <Button
                size="sm"
                ghost
                style="width:100%;justify-content:flex-start;gap:0.5rem;"
                onclick={onReset}
            >
                <ArrowCounterClockwise size={16} />
                {m.reset_config()}
            </Button>
        </li>
    {/if}
    <li>
        <Button
            size="sm"
            ghost
            style="width:100%;justify-content:flex-start;gap:0.5rem;{copied
                ? 'color:var(--color-success);'
                : ''}"
            onclick={copyConfig}
        >
            {#if copied}
                <Check size={16} />
                {m.copied()}
            {:else}
                <Copy size={16} />
                {m.copy_config()}
            {/if}
        </Button>
    </li>
    {#if onShare}
        <li>
            <Button
                size="sm"
                ghost
                style="width:100%;justify-content:flex-start;gap:0.5rem;{shared
                    ? 'color:var(--color-success);'
                    : ''}"
                onclick={shareState}
            >
                {#if shared}
                    <Check size={16} />
                    {m.link_copied()}
                {:else}
                    <ShareNetwork size={16} />
                    {m.share_current_state()}
                {/if}
            </Button>
        </li>
    {/if}
</ul>

<style>
    /* Menu section heading. */
    .menu-title {
        color: color-mix(in oklab, var(--content) 40%, transparent);
        font-weight: 600;
        font-size: 0.875rem;
        padding-inline: 1rem;
        padding-block: 0.5rem;
    }

    /* Label row: inline-flex row of label text + control. The text lives in a
       plain <span>. */
    .settings-label {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        white-space: nowrap;
        cursor: pointer;
        padding-block: 0.25rem;
    }
    /* Wider gap on certain labels. */
    .settings-label--gap2 {
        gap: 0.5rem;
    }
    /* The viewer-locale label had no cursor-pointer. */
    .settings-label--static {
        cursor: default;
    }

    /* Range/thumbnail value read-out. */
    .value-readout {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.5;
        width: 2rem;
        text-align: right;
    }

    /* Wrapper around the viewer-locale select. */
    .locale-block {
        padding-inline: 1rem;
        padding-block: 0.5rem;
    }

    /* Divider (empty horizontal rule). */
    .divider {
        display: flex;
        flex-direction: row;
        align-items: center;
        align-self: stretch;
        white-space: nowrap;
        height: 1rem;
        margin-block: 0.25rem;
        margin-inline: 0;
        --divider-color: color-mix(
            in oklab,
            var(--content) 10%,
            transparent
        );
    }
    .divider::before,
    .divider::after {
        content: '';
        flex-grow: 1;
        width: 100%;
        height: 0.125rem;
        background-color: var(--divider-color);
    }

    /* Root menu layout. Padding/width are left to the consumer-provided
       className. */
    .settings-menu-root {
        display: flex;
        flex-direction: column;
        font-size: 0.875rem;
    }

    /* Collapse section <summary> styling: grid layout + rotating chevron marker. */
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
        border-radius: var(--radius-field);
        padding-block: 0.375rem;
        padding-inline: 0.75rem;
        outline-style: none;
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
        background-color: color-mix(
            in oklab,
            var(--content) 10%,
            transparent
        );
    }

    details {
        overflow: hidden;
    }

    /* Nested submenu list inside a collapse: indented with a faint left rule. */
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
        width: var(--border);
        background-color: var(--content);
        opacity: 0.1;
    }
</style>
