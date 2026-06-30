<script lang="ts">
    import { getContext } from 'svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import Slideshow from 'phosphor-svelte/lib/Slideshow';
    import CornersIn from 'phosphor-svelte/lib/CornersIn';
    import CornersOut from 'phosphor-svelte/lib/CornersOut';
    import ChatCenteredText from 'phosphor-svelte/lib/ChatCenteredText';
    import Info from 'phosphor-svelte/lib/Info';
    import List from 'phosphor-svelte/lib/List';
    import ListBullets from 'phosphor-svelte/lib/ListBullets';
    import Folder from 'phosphor-svelte/lib/Folder';
    import BookOpen from 'phosphor-svelte/lib/BookOpen';
    import Scroll from 'phosphor-svelte/lib/Scroll';
    import File from 'phosphor-svelte/lib/File';
    import Stack from 'phosphor-svelte/lib/Stack';
    import Check from 'phosphor-svelte/lib/Check';
    import X from 'phosphor-svelte/lib/X';
    import ArrowsLeftRight from 'phosphor-svelte/lib/ArrowsLeftRight';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { manifestsState } from '../state/manifests.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // Use centralized toolbar state
    const isOpen = $derived(viewerState.toolbarOpen);

    // --- Configuration ---
    // Default to 'left' if not specified
    const position = $derived(viewerState.config.toolbarPosition || 'left');
    const isTop = $derived(position === 'top-left' || position === 'top-right');
    const showToggle = $derived(viewerState.config.showToggle !== false);

    // --- Tooltip placement ---
    const tooltipPlacement = $derived(
        isTop ? 'bottom' : position === 'left' ? 'right' : 'left',
    );

    // Tooltip placement specifically for the open button when toolbar is closed
    const openButtonTooltipPlacement = $derived(
        position === 'top-left'
            ? 'right'
            : position === 'top-right'
              ? 'left'
              : position === 'left'
                ? 'right'
                : 'left',
    );

    // --- Standard Viewer Actions ---
    const toolbarConfig = $derived(viewerState.config.toolbar || {});
    const showSearch = $derived(toolbarConfig.showSearch !== false);
    const showGallery = $derived(toolbarConfig.showGallery !== false);
    const showFullscreen = $derived(toolbarConfig.showFullscreen !== false);
    const showAnnotations = $derived(toolbarConfig.showAnnotations !== false);
    const showInfo = $derived(toolbarConfig.showInfo !== false);
    const showViewingMode = $derived(toolbarConfig.showViewingMode !== false);
    const sequenceStructures = $derived(
        viewerState.structures.filter((node: any) =>
            node.behaviors?.includes('sequence'),
        ),
    );
    const nonSequenceStructures = $derived(
        viewerState.structures.filter(
            (node: any) => !node.behaviors?.includes('sequence'),
        ),
    );
    const showStructures = $derived(
        viewerState.config.showStructures !== false &&
            toolbarConfig.showStructures !== false &&
            nonSequenceStructures.length > 0,
    );
    const showCollection = $derived(
        toolbarConfig.showCollection !== false && viewerState.hasCollection,
    );
    const showSequencePicker = $derived(viewerState.sequenceCount > 1);
    const sequenceOptions = $derived.by(() => {
        if (sequenceStructures.length > 0) {
            return sequenceStructures.map((node, index) => ({
                index,
                label: node.label || `${m.sequence_label()} ${index + 1}`,
            }));
        }

        return Array.from(
            { length: viewerState.sequenceCount },
            (_, index) => ({
                index,
                label: `${m.sequence_label()} ${index + 1}`,
            }),
        );
    });
    const annotationCount = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return 0;
        }

        return manifestsState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        ).length;
    });
    const annotationsTooltip = $derived.by(() => {
        const base = viewerState.showAnnotations
            ? m.hide_annotations()
            : m.show_annotations();

        return annotationCount > 0 ? `${base} (${annotationCount})` : base;
    });

    // Derived list of sorted plugin buttons
    let sortedPluginButtons = $derived.by(() => {
        void language.current;
        return viewerState.pluginMenuButtons
            .filter((button) => button.isVisible?.() !== false)
            .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    });

    function toggleOpen() {
        viewerState.toggleToolbar();
    }

    function resolvePluginTooltip(tooltip: string) {
        void language.current;

        // @ts-expect-error - m[tooltip] might be a function
        return typeof m[tooltip] === 'function'
            ? // @ts-expect-error - m[tooltip] is a function
              m[tooltip]()
            : tooltip;
    }
</script>

<div
    class="toolbar-root"
    class:top-right={position === 'top-right'}
    class:top-left={position === 'top-left'}
    class:side={!isTop}
    class:left={position === 'left'}
    class:right={position === 'right'}
>
    <!-- Collapsible Toolbar -->
    <div
        class="toolbar-shell"
        class:top-right={position === 'top-right'}
        class:top-left={position === 'top-left'}
        class:side={!isTop}
        class:open-top={isOpen && isTop}
        class:open-side={isOpen && !isTop}
        class:closed-top={!isOpen && isTop}
        class:closed-left={!isOpen && position === 'left'}
        class:closed-right={!isOpen && position === 'right'}
    >
        <!-- Scrollable Actions -->
        <ul
            class="menu actions"
            class:horizontal={isTop}
            class:top-right={position === 'top-right'}
            class:top-left={position === 'top-left'}
            class:left={position === 'left'}
            class:right={position === 'right'}
        >
            <!-- --- Close Button --- -->
            {#if showToggle}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        data-tip={m.close_menu()}
                        onclick={toggleOpen}
                        aria-label={m.close_menu()}
                    >
                        <X size={24} />
                    </button>
                </li>
            {/if}

            <!-- --- Standard Actions --- -->

            {#if showCollection}
                <li>
                    <button
                        class="menu-item tooltip indicator {tooltipPlacement}"
                        class:menu-active={viewerState.showCollectionPanel}
                        data-tip={m.collection_title()}
                        aria-label={m.toggle_collection()}
                        onclick={() => viewerState.toggleCollectionPanel()}
                    >
                        {#if !viewerState.showCollectionPanel && viewerState.collectionItems.length > 0}
                            <span class="indicator-item count-badge">
                                {viewerState.collectionItems.length > 99
                                    ? '99+'
                                    : viewerState.collectionItems.length}
                            </span>
                        {/if}
                        <Folder size={24} />
                    </button>
                </li>
            {/if}

            {#if showSearch}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.showSearchPanel}
                        data-tip={m.search()}
                        aria-label={m.toggle_search()}
                        onclick={() => viewerState.toggleSearchPanel()}
                    >
                        <MagnifyingGlass size={24} />
                    </button>
                </li>
            {/if}

            {#if showGallery}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.showThumbnailGallery}
                        data-tip={viewerState.showThumbnailGallery
                            ? m.hide_gallery()
                            : m.show_gallery()}
                        aria-label={viewerState.showThumbnailGallery
                            ? m.hide_gallery()
                            : m.show_gallery()}
                        onclick={() => viewerState.toggleThumbnailGallery()}
                    >
                        <Slideshow size={24} />
                    </button>
                </li>
            {/if}

            {#if showStructures}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.showStructuresPanel}
                        data-tip={m.structures_title()}
                        aria-label={m.toggle_structures()}
                        onclick={() => viewerState.toggleStructuresPanel()}
                    >
                        <ListBullets size={24} />
                    </button>
                </li>
            {/if}

            {#if showViewingMode}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        data-tip={m.viewing_mode_label()}
                        popovertarget="toolbar-viewing-mode"
                        style="anchor-name:--anchor-viewing-mode"
                        aria-label={m.viewing_mode_label()}
                    >
                        {#if viewerState.viewingMode === 'paged'}
                            <BookOpen size={24} />
                        {:else if viewerState.viewingMode === 'continuous'}
                            <Scroll size={24} />
                        {:else}
                            <File size={24} />
                        {/if}
                    </button>
                    <ul
                        popover
                        id="toolbar-viewing-mode"
                        class="dropdown menu popover-menu"
                        class:popover-top={isTop}
                        class:popover-left={position === 'left'}
                        class:popover-right={position === 'right'}
                        style={`
                            position-anchor: --anchor-viewing-mode;
                        `}
                    >
                        <li>
                            <button
                                class="menu-item"
                                class:menu-active={viewerState.viewingMode ===
                                    'individuals'}
                                onclick={() =>
                                    viewerState.setViewingMode('individuals')}
                            >
                                <File size={16} />
                                <span>{m.viewing_mode_individuals()}</span>
                                {#if viewerState.viewingMode === 'individuals'}
                                    <Check size={16} />
                                {/if}
                            </button>
                        </li>
                        <li>
                            <button
                                class="menu-item"
                                class:menu-active={viewerState.viewingMode ===
                                    'paged'}
                                onclick={() =>
                                    viewerState.setViewingMode('paged')}
                            >
                                <BookOpen size={16} />
                                <span>{m.viewing_mode_paged()}</span>
                                {#if viewerState.viewingMode === 'paged'}
                                    <Check size={16} />
                                {/if}
                            </button>
                        </li>
                        <li>
                            <button
                                class="menu-item"
                                class:menu-active={viewerState.viewingMode ===
                                    'continuous'}
                                onclick={() =>
                                    viewerState.setViewingMode('continuous')}
                            >
                                <Scroll size={16} />
                                <span>{m.viewing_mode_continuous()}</span>
                                {#if viewerState.viewingMode === 'continuous'}
                                    <Check size={16} />
                                {/if}
                            </button>
                        </li>
                        {#if viewerState.viewingMode === 'paged'}
                            <li>
                                <button
                                    class="menu-item text-start"
                                    class:menu-active={viewerState.pagedOffset ===
                                        1}
                                    onclick={() =>
                                        viewerState.togglePagedOffset()}
                                >
                                    <ArrowsLeftRight size={16} />
                                    <span>{m.viewing_mode_shift_pairing()}</span
                                    >
                                    {#if viewerState.pagedOffset === 1}
                                        <Check size={16} />
                                    {/if}
                                </button>
                            </li>
                        {/if}
                    </ul>
                </li>
            {/if}

            {#if showSequencePicker}
                <li>
                    <button
                        class="menu-item tooltip indicator {tooltipPlacement}"
                        data-tip={m.sequence_label()}
                        popovertarget="toolbar-sequence-picker"
                        style="anchor-name:--anchor-sequence-picker"
                        aria-label={m.sequence_label()}
                    >
                        <span class="indicator-item count-badge">
                            {viewerState.sequenceCount > 99
                                ? '99+'
                                : viewerState.sequenceCount}
                        </span>
                        <Stack size={24} />
                    </button>
                    <ul
                        popover
                        id="toolbar-sequence-picker"
                        class="dropdown menu popover-menu wide"
                        class:popover-top={isTop}
                        class:popover-left={position === 'left'}
                        class:popover-right={position === 'right'}
                        style={`
                            position-anchor: --anchor-sequence-picker;
                        `}
                    >
                        {#each sequenceOptions as option (option.index)}
                            <li>
                                <button
                                    class="menu-item"
                                    class:menu-active={viewerState.selectedSequenceIndex ===
                                        option.index}
                                    onclick={() =>
                                        viewerState.setSequenceIndex(
                                            option.index,
                                        )}
                                >
                                    <Stack size={16} />
                                    <span>{option.label}</span>
                                    {#if viewerState.selectedSequenceIndex === option.index}
                                        <Check size={16} />
                                    {/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </li>
            {/if}

            {#if showFullscreen}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.isFullScreen}
                        data-tip={viewerState.isFullScreen
                            ? m.exit_full_screen()
                            : m.enter_full_screen()}
                        aria-label={viewerState.isFullScreen
                            ? m.exit_full_screen()
                            : m.enter_full_screen()}
                        onclick={() => viewerState.toggleFullScreen()}
                    >
                        {#if viewerState.isFullScreen}
                            <CornersIn size={24} />
                        {:else}
                            <CornersOut size={24} />
                        {/if}
                    </button>
                </li>
            {/if}

            {#if showAnnotations}
                <li>
                    <button
                        class="menu-item tooltip indicator {tooltipPlacement}"
                        class:menu-active={viewerState.showAnnotations}
                        data-tip={annotationsTooltip}
                        aria-label={annotationsTooltip}
                        onclick={() => viewerState.toggleAnnotations()}
                    >
                        {#if !viewerState.showAnnotations && annotationCount > 0}
                            <span class="indicator-item count-badge">
                                {annotationCount > 99 ? '99+' : annotationCount}
                            </span>
                        {/if}
                        <ChatCenteredText size={24} />
                    </button>
                </li>
            {/if}

            {#if showInfo}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.showMetadataPanel}
                        data-tip={m.metadata()}
                        aria-label={m.toggle_metadata()}
                        onclick={() => viewerState.toggleMetadataPanel()}
                    >
                        <Info size={24} />
                    </button>
                </li>
            {/if}

            <!-- Separator if both groups exist -->
            {#if (showSearch || showGallery || showFullscreen || showAnnotations || showInfo || showViewingMode || showStructures || showCollection) && sortedPluginButtons.length > 0}
                <div class="divider" class:horizontal={isTop}></div>
            {/if}

            <!-- --- Plugin Actions --- -->
            {#key language.current}
                {#each sortedPluginButtons as button (button.id)}
                    {@const Icon = button.icon}
                    {@const tooltipText = resolvePluginTooltip(button.tooltip)}
                    <li>
                        <button
                            class="menu-item tooltip {tooltipPlacement}"
                            class:menu-active={button.isActive?.()}
                            data-tip={tooltipText}
                            aria-label={tooltipText}
                            onclick={() => button.onClick()}
                        >
                            <Icon size={24} />
                        </button>
                    </li>
                {/each}
            {/key}
        </ul>
    </div>

    <!-- Toggle Handle (Only visible when closed) -->
    {#if showToggle}
        <button
            class="handle tooltip {openButtonTooltipPlacement}"
            class:invisible={isOpen}
            class:top={isTop}
            class:start={position === 'left' || position === 'top-left'}
            class:end={position === 'right' || position === 'top-right'}
            aria-label={m.open_menu()}
            data-tip={m.open_menu()}
            onclick={toggleOpen}
        >
            <List size={20} />
        </button>
    {/if}
</div>

<style>
    /* ===== Outer root ===== */
    .toolbar-root {
        position: absolute;
        z-index: 50;
        pointer-events: none;
        display: flex;
        top: 0;
    }
    .toolbar-root.top-right {
        width: 100%;
        align-items: flex-end;
        flex-direction: column;
        padding-top: 0;
    }
    .toolbar-root.top-left {
        width: 100%;
        align-items: flex-start;
        flex-direction: column;
        padding-top: 0;
    }
    .toolbar-root.side {
        height: 100%;
        align-items: flex-start;
    }
    .toolbar-root.left {
        left: 0;
    }
    .toolbar-root.right {
        right: 0;
    }

    /* ===== Collapsible shell ===== */
    .toolbar-shell {
        pointer-events: auto;
        transition-property: all;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
    }
    .toolbar-shell.top-right {
        flex-direction: row-reverse;
        height: 3rem;
        width: auto;
        max-width: 100%;
        transform-origin: top;
    }
    .toolbar-shell.top-left {
        flex-direction: row;
        height: 3rem;
        width: auto;
        max-width: 100%;
        transform-origin: top;
    }
    .toolbar-shell.side {
        flex-direction: column;
        height: auto;
        max-height: 100%;
    }
    /* Animation states */
    .toolbar-shell.open-top {
        opacity: 1;
        transform: translateY(0);
    }
    .toolbar-shell.open-side {
        opacity: 1;
        transform: translateX(0);
    }
    .toolbar-shell.closed-top {
        height: 0;
        opacity: 0;
        transform: translateY(-100%);
    }
    .toolbar-shell.closed-left {
        opacity: 0;
        transform: translateX(-100%);
        pointer-events: none;
    }
    .toolbar-shell.closed-right {
        opacity: 0;
        transform: translateX(100%);
        pointer-events: none;
    }

    /* ===== Menu scaffolding ===== */
    .menu {
        --menu-active-fg: var(--color-neutral-content);
        --menu-active-bg: var(--color-neutral);
        flex-flow: column wrap;
        width: fit-content;
        padding: 0.5rem;
        font-size: 0.875rem;
        display: flex;
    }
    .menu :where(li) {
        flex-flow: column wrap;
        flex-shrink: 0;
        align-items: stretch;
        display: flex;
        position: relative;
    }
    /* menu items (buttons) */
    .menu-item {
        border-radius: var(--radius-field);
        text-align: start;
        text-wrap: balance;
        user-select: none;
        grid-auto-columns: minmax(auto, max-content) auto max-content;
        grid-auto-flow: column;
        align-content: flex-start;
        align-items: center;
        gap: 0.5rem;
        /* menu-sm padding */
        padding-block: 0.25rem;
        padding-inline: 0.625rem;
        font-size: 0.75rem;
        transition-property: color, background-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
        display: grid;
        color: inherit;
        background-color: transparent;
        border: none;
        cursor: pointer;
    }
    /* actions ul had [&_li>*]:p-1 — every direct child of its li gets p-1
       (the menu-item buttons AND the popover dropdown <ul>s) */
    .actions :where(li) > :global(*) {
        padding: 0.25rem;
    }
    /* hover (non-active items) */
    .menu-item:not(.menu-active):not(:active):hover {
        cursor: pointer;
        background-color: color-mix(
            in oklab,
            var(--toolbar-content) 10%,
            transparent
        );
        box-shadow:
            inset 0 1px oklch(0% 0 0 / 0.01),
            inset 0 -1px oklch(100% 0 0 / 0.01);
    }
    /* active / pressed state */
    .menu-item:active,
    .menu-item.menu-active {
        color: var(--menu-active-fg);
        background-color: var(--menu-active-bg);
    }
    /* The original markup overrides menu-active with primary colors */
    .menu-item.menu-active {
        background-color: var(--color-primary);
        color: var(--color-primary-content);
        cursor: pointer;
    }
    .text-start {
        text-align: start;
    }

    /* ===== Actions list look ===== */
    .actions {
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        color: var(--toolbar-content);
        backdrop-filter: blur(8px);
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
        justify-content: center;
        align-items: center;
    }
    /* menu-horizontal */
    .actions.horizontal {
        flex-direction: row;
        display: inline-flex;
    }
    .actions.horizontal :where(li) {
        padding-bottom: 0;
    }
    .actions.top-right {
        flex-direction: row-reverse;
        border-bottom-left-radius: var(--radius-toolbar);
    }
    .actions.top-right > :global(* + *) {
        margin-left: 1px;
    }
    .actions.top-left {
        flex-direction: row;
        border-bottom-right-radius: var(--radius-toolbar);
    }
    .actions.top-left > :global(* + *) {
        margin-left: 1px;
    }
    .actions.left {
        border-bottom-right-radius: var(--radius-toolbar);
        padding-right: 0.25rem;
    }
    .actions.left > :global(* + *) {
        margin-top: 1px;
    }
    .actions.right {
        border-bottom-left-radius: var(--radius-toolbar);
        padding-left: 0.25rem;
    }
    .actions.right > :global(* + *) {
        margin-top: 1px;
    }

    /* ===== Indicator scaffolding ===== */
    .indicator {
        position: relative;
        display: inline-flex;
        width: max-content;
    }
    .indicator-item {
        position: absolute;
        top: 0;
        right: 0;
        translate: 50% -50%;
        z-index: 1;
        white-space: nowrap;
    }

    /* count badge inside indicators (badge badge-primary badge-sm min-w-5 px-1) */
    .count-badge {
        --size: calc(var(--size-selector, 0.25rem) * 5);
        border-radius: var(--radius-selector);
        vertical-align: middle;
        color: var(--color-primary-content);
        border: var(--border) solid var(--color-primary);
        background-color: var(--color-primary);
        height: var(--size);
        min-width: 1.25rem;
        padding-inline: 0.25rem;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        display: inline-flex;
    }

    /* ===== Popover dropdown menus ===== */
    .popover-menu {
        border-radius: var(--radius-toolbar);
        background-color: var(--toolbar-bg);
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
        border: 1px solid var(--surface-border);
        z-index: 999;
    }
    .popover-menu.wide {
        min-width: 14rem;
    }
    .popover-menu.popover-top {
        margin-top: 0.5rem;
        transform: translateX(-50%);
    }
    .popover-menu.popover-left {
        margin-inline-start: 2.5rem;
    }
    .popover-menu.popover-right {
        transform: translateX(-100%);
        margin-inline-start: -0.5rem;
    }
    /* popover open/close transition (reproduced from dropdown[popover]) */
    .dropdown[popover] {
        opacity: 0;
        scale: 95%;
        display: none;
    }
    .dropdown[popover]:popover-open {
        opacity: 1;
        scale: 100%;
        display: flex;
    }
    @media (prefers-reduced-motion: no-preference) {
        .dropdown[popover] {
            transition-behavior: allow-discrete;
            transition-property: opacity, scale, display;
            transition-duration: 0.2s;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
    }

    /* ===== Divider (net margin is 0) ===== */
    .divider {
        --divider-color: color-mix(
            in oklab,
            var(--toolbar-content) 10%,
            transparent
        );
        white-space: nowrap;
        height: 1rem;
        margin: 0;
        flex-direction: row;
        align-self: stretch;
        align-items: center;
        display: flex;
    }
    .divider::before,
    .divider::after {
        content: '';
        background-color: var(--divider-color);
        flex-grow: 1;
        width: 100%;
        height: 0.125rem;
    }
    .divider.horizontal {
        flex-direction: column;
        width: 1rem;
        height: auto;
    }
    .divider.horizontal::before,
    .divider.horizontal::after {
        width: 0.125rem;
        height: 100%;
    }

    /* ===== Toggle handle (btn-sm look + custom overrides) ===== */
    /* the handle also carries .tooltip; keep its absolute positioning winning
       over .tooltip's position:relative (the tooltip pseudo-elements work from
       any positioned element). */
    .handle.tooltip {
        position: absolute;
    }
    .handle {
        pointer-events: auto;
        z-index: 40;
        position: absolute;
        /* btn base */
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        cursor: pointer;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        font-weight: 600;
        font-size: 0.75rem;
        border-width: var(--border);
        border-style: solid;
        border-start-start-radius: var(--radius-field);
        border-start-end-radius: var(--radius-field);
        border-end-end-radius: var(--radius-field);
        border-end-start-radius: var(--radius-field);
        outline-offset: 2px;
        /* custom overrides */
        width: 2rem;
        height: 2rem;
        padding: 0;
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border-color: var(--surface-border);
        color: var(--toolbar-content);
        box-shadow:
            0 4px 6px -1px #0000001a,
            0 2px 4px -2px #0000001a;
        transition-property: opacity;
        transition-duration: 0.3s;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 1;
    }
    .handle:hover {
        background-color: var(--surface-border);
    }
    .handle.invisible {
        opacity: 0;
        pointer-events: none;
    }
    .handle.top {
        top: 0.375rem;
    }
    .handle.start {
        left: 0.375rem;
    }
    .handle.end {
        right: 0.375rem;
    }

    /* ===== Tooltip scaffolding (sm sizing) ===== */
    .tooltip {
        --tt-bg: var(--color-neutral);
        --tt-fg: var(--color-neutral-content);
        --tt-off: calc(100% + 0.5rem);
        --tt-tail: calc(100% + 1px + 0.25rem);
        position: relative;
    }
    .tooltip[data-tip]:not([data-tip=''])::before {
        border-radius: var(--radius-field);
        text-align: center;
        white-space: normal;
        max-width: 20rem;
        color: var(--tt-fg);
        opacity: 0;
        background-color: var(--tt-bg);
        pointer-events: none;
        z-index: 2;
        content: attr(data-tip);
        width: max-content;
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25;
        position: absolute;
    }
    .tooltip[data-tip]:not([data-tip=''])::after {
        opacity: 0;
        background-color: var(--tt-bg);
        content: '';
        pointer-events: none;
        --mask-tooltip: url("data:image/svg+xml,%3Csvg width='10' height='4' viewBox='0 0 8 4' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0.500009 1C3.5 1 3.00001 4 5.00001 4C7 4 6.5 1 9.5 1C10 1 10 0.499897 10 0H0C-1.99338e-08 0.5 0 1 0.500009 1Z' fill='black'/%3E%3C/svg%3E%0A");
        width: 0.625rem;
        height: 0.25rem;
        mask-position: -1px 0;
        mask-repeat: no-repeat;
        mask-image: var(--mask-tooltip);
        display: block;
        position: absolute;
    }
    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]::before,
        .tooltip[data-tip]::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms,
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms;
        }
    }
    .tooltip[data-tip]:not([data-tip='']):hover::before,
    .tooltip[data-tip]:not([data-tip='']):hover::after,
    .tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::before,
    .tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::after {
        opacity: 1;
        --tt-pos: 0rem;
    }
    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]:not([data-tip='']):hover::before,
        .tooltip[data-tip]:not([data-tip='']):hover::after,
        .tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::before,
        .tooltip[data-tip]:not([data-tip='']):has(:focus-visible)::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
    }
    /* Placements */
    .tooltip.top::before {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-off) 50%;
    }
    .tooltip.top::after {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-tail) 50%;
    }
    .tooltip.bottom::before {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 50%;
    }
    .tooltip.bottom::after {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem))
            rotate(180deg);
        inset: var(--tt-tail) auto auto 50%;
    }
    .tooltip.left::before {
        transform: translateX(calc(var(--tt-pos, 0.25rem) - 0.25rem))
            translateY(-50%);
        inset: 50% var(--tt-off) auto auto;
    }
    .tooltip.left::after {
        transform: translateX(var(--tt-pos, 0.25rem)) translateY(-50%)
            rotate(-90deg);
        inset: 50% calc(var(--tt-tail) + 1px) auto auto;
    }
    .tooltip.right::before {
        transform: translateX(calc(var(--tt-pos, -0.25rem) + 0.25rem))
            translateY(-50%);
        inset: 50% auto auto var(--tt-off);
    }
    .tooltip.right::after {
        transform: translateX(var(--tt-pos, -0.25rem)) translateY(-50%)
            rotate(90deg);
        inset: 50% auto auto calc(var(--tt-tail) + 1px);
    }
</style>
