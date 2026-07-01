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

    interface Props {
        /**
         * Render as an in-flow docked rail (the cross-cutting same-side fix)
         * instead of a floating overlay. The parent renders the toolbar this way
         * only when its configured side hosts a panel/gallery AND it is open, so
         * the rail sits at the screen edge with the panel inboard of it.
         */
        docked?: boolean;
        /**
         * Render only the bare action buttons as a horizontal group (no shell,
         * positioning, handle, or collapse), for embedding inside another bar —
         * used by the Unified Bar preset to place the toolbar buttons in the
         * canvas nav.
         */
        inline?: boolean;
    }

    let { docked = false, inline = false }: Props = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // --- Inline (Unified Bar) row balancing ---
    // In `inline` mode the action <ul> is allowed to wrap. Flexbox fills rows
    // greedily (6 + 1), so once the icons need a second row we compute an even
    // split (4 + 3) by capping the group's width to `ceil(count / rows)`
    // columns. Measured against the control-bar's stable offset parent (not the
    // group itself) so setting the cap can't feed back into the observer.
    let actionsEl: HTMLUListElement | undefined = $state();

    function balanceInlineRows(el: HTMLUListElement) {
        el.style.maxWidth = '';
        const items = Array.from(el.children) as HTMLElement[];
        const n = items.length;
        if (n < 2) return;

        const bar = el.closest('.control-bar') as HTMLElement | null;
        const container =
            (bar?.offsetParent as HTMLElement | null) ??
            bar?.parentElement ??
            null;
        if (!bar || !container) return;

        const barStyle = getComputedStyle(bar);
        const left = parseFloat(barStyle.left) || 0;
        const right = parseFloat(barStyle.right) || 0;
        const padX =
            (parseFloat(barStyle.paddingLeft) || 0) +
            (parseFloat(barStyle.paddingRight) || 0);
        const avail = container.clientWidth - left - right - padX;
        if (avail <= 0) return;

        const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
        let sum = 0;
        let widest = 0;
        for (const it of items) {
            const w = it.getBoundingClientRect().width;
            sum += w;
            if (w > widest) widest = w;
        }
        const natural = sum + gap * (n - 1);
        if (natural <= avail) return; // fits on one row — no cap needed

        const rows = Math.ceil(natural / avail);
        const perRow = Math.ceil(n / rows);
        el.style.maxWidth = `${perRow * widest + (perRow - 1) * gap + 1}px`;
    }

    $effect(() => {
        if (!inline || !actionsEl) return;
        const el = actionsEl;
        const bar = el.closest('.control-bar') as HTMLElement | null;
        const container =
            (bar?.offsetParent as HTMLElement | null) ??
            bar?.parentElement ??
            null;
        const run = () => balanceInlineRows(el);
        // Container width changes → re-balance. Its width is independent of the
        // cap we set, so no feedback loop.
        const ro = new ResizeObserver(run);
        if (container) ro.observe(container);
        // Icon set changes (plugins mounting) → re-balance. childList only, so
        // our maxWidth style writes don't re-trigger it.
        const mo = new MutationObserver(run);
        mo.observe(el, { childList: true });
        run();
        return () => {
            ro.disconnect();
            mo.disconnect();
        };
    });

    // Use centralized toolbar state
    const isOpen = $derived(viewerState.toolbarOpen);

    // --- Configuration ---
    // Compose the internal placement string from the nested toolbar config
    // (side = left/right, anchor = top/center). Defaults: left + center.
    const side = $derived(viewerState.config.toolbar?.side || 'left');
    const anchor = $derived(viewerState.config.toolbar?.anchor || 'center');
    const position = $derived(anchor === 'top' ? `top-${side}` : side);
    const isTop = $derived(anchor === 'top');
    const showToggle = $derived(viewerState.config.showToggle !== false);

    // --- Tooltip placement ---
    // When inline (unified), the buttons live inside the nav bar, so tooltips must
    // point away from whichever edge the nav sits on (below it when on top).
    const navOnTop = $derived(viewerState.config.nav?.edge === 'top');
    const tooltipPlacement = $derived(
        inline
            ? navOnTop
                ? 'bottom'
                : 'top'
            : isTop
              ? 'bottom'
              : position === 'left'
                ? 'right'
                : 'left',
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

    // Direction a plugin flyout grows out of its button — always toward the
    // canvas: up from the inline (bottom) bar, down from a top toolbar, and
    // sideways from a left/right rail.
    const flyoutPlacement = $derived(
        inline ? 'up' : isTop ? 'down' : position === 'left' ? 'right' : 'left',
    );

    function findFlyout(domId: string | undefined) {
        if (!domId) return undefined;
        return viewerState.pluginFlyouts.find((f) => f.domId === domId);
    }

    // Built-in toolbar dropdowns (viewing mode, sequence picker) use the same
    // non-top-layer flyout pattern as plugin flyouts, so tooltips paint above
    // them too. Only one is open at a time.
    let openMenu = $state<string | null>(null);

    function toggleMenu(name: string) {
        openMenu = openMenu === name ? null : name;
    }

    function closeAllOverlays() {
        openMenu = null;
        viewerState.closePluginFlyouts();
    }

    // Light-dismiss for flyouts/menus (they are not top-layer popovers, so we
    // close them ourselves). `composedPath` keeps this working inside a shadow
    // root: a click on a flyout/menu panel or its toggle button is ignored.
    function pointerInsideFlyout(e: Event): boolean {
        for (const node of e.composedPath()) {
            if (!(node instanceof Element)) continue;
            if (
                node.hasAttribute('data-flyout-panel') ||
                node.hasAttribute('data-flyout-toggle')
            ) {
                return true;
            }
        }
        return false;
    }

    function handleWindowPointerDown(e: PointerEvent) {
        if (!pointerInsideFlyout(e)) {
            closeAllOverlays();
        }
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            closeAllOverlays();
        }
    }

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

<svelte:window
    onpointerdown={handleWindowPointerDown}
    onkeydown={handleWindowKeydown}
/>

<div
    class="toolbar-root"
    class:top-right={position === 'top-right'}
    class:top-left={position === 'top-left'}
    class:side={!isTop}
    class:left={position === 'left'}
    class:right={position === 'right'}
    class:docked
    class:inline
>
    <!-- Collapsible Toolbar -->
    <div
        class="toolbar-shell"
        class:top-right={position === 'top-right'}
        class:top-left={position === 'top-left'}
        class:side={!isTop}
        class:docked
        class:inline
        class:open-top={isOpen && isTop}
        class:open-side={isOpen && !isTop}
        class:closed-top={!isOpen && isTop}
        class:closed-left={!isOpen && position === 'left'}
        class:closed-right={!isOpen && position === 'right'}
    >
        <!-- Scrollable Actions -->
        <ul
            bind:this={actionsEl}
            class="menu actions"
            class:horizontal={isTop || inline}
            class:top-right={position === 'top-right'}
            class:top-left={position === 'top-left'}
            class:left={position === 'left'}
            class:right={position === 'right'}
            class:docked
            class:inline
        >
            <!-- --- Close Button (hidden in inline mode; the buttons live in the
                 nav bar without a collapse affordance) --- -->
            {#if showToggle && !inline}
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
                        class:menu-active={openMenu === 'viewing-mode'}
                        data-tip={m.viewing_mode_label()}
                        data-flyout-toggle
                        aria-label={m.viewing_mode_label()}
                        aria-expanded={openMenu === 'viewing-mode'}
                        style="anchor-name:--anchor-viewing-mode"
                        onclick={() => toggleMenu('viewing-mode')}
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
                        data-flyout-panel
                        class="menu popover-menu menu-flyout {flyoutPlacement}"
                        class:open={openMenu === 'viewing-mode'}
                        style="position-anchor: --anchor-viewing-mode;"
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
                        class:menu-active={openMenu === 'sequence-picker'}
                        data-tip={m.sequence_label()}
                        data-flyout-toggle
                        aria-label={m.sequence_label()}
                        aria-expanded={openMenu === 'sequence-picker'}
                        style="anchor-name:--anchor-sequence-picker"
                        onclick={() => toggleMenu('sequence-picker')}
                    >
                        <span class="indicator-item count-badge">
                            {viewerState.sequenceCount > 99
                                ? '99+'
                                : viewerState.sequenceCount}
                        </span>
                        <Stack size={24} />
                    </button>
                    <ul
                        data-flyout-panel
                        class="menu popover-menu wide menu-flyout {flyoutPlacement}"
                        class:open={openMenu === 'sequence-picker'}
                        style="position-anchor: --anchor-sequence-picker;"
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
                            <span class="annotation-dot" aria-hidden="true"
                            ></span>
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
                    {@const flyout = findFlyout(button.flyoutDomId)}
                    <li>
                        {#if flyout}
                            {@const Flyout = flyout.component}
                            {@const open = button.isActive?.() ?? false}
                            <button
                                class="menu-item tooltip {tooltipPlacement}"
                                class:menu-active={open}
                                data-tip={tooltipText}
                                aria-label={tooltipText}
                                aria-expanded={open}
                                data-flyout-toggle
                                onclick={() => button.onClick()}
                                style="anchor-name:--anchor-{flyout.domId}"
                            >
                                <Icon size={24} />
                            </button>
                            <!-- A normal (non-top-layer) anchored element so
                                 tooltips always paint above it. Kept mounted and
                                 toggled via `.open` so plugin state persists. -->
                            <div
                                class="menu-flyout {flyoutPlacement}"
                                class:open
                                data-flyout-panel
                                style="position-anchor:--anchor-{flyout.domId}"
                            >
                                <Flyout
                                    {...flyout.props}
                                    placement={flyoutPlacement}
                                    close={() =>
                                        button.pluginId &&
                                        viewerState.setPluginOpen(
                                            button.pluginId,
                                            false,
                                        )}
                                />
                            </div>
                        {:else}
                            <button
                                class="menu-item tooltip {tooltipPlacement}"
                                class:menu-active={button.isActive?.()}
                                data-tip={tooltipText}
                                aria-label={tooltipText}
                                onclick={() => button.onClick()}
                            >
                                <Icon size={24} />
                            </button>
                        {/if}
                    </li>
                {/each}
            {/key}
        </ul>
    </div>

    <!-- Toggle Handle (floating open button shown only when closed; never in the
         docked rail or inline modes). -->
    {#if showToggle && !docked && !inline}
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
        padding-right: var(--ui-inset, 0);
    }
    .toolbar-root.top-left {
        width: 100%;
        align-items: flex-start;
        flex-direction: column;
        padding-top: 0;
        padding-left: var(--ui-inset, 0);
    }
    .toolbar-root.side {
        height: 100%;
        align-items: flex-start;
    }
    .toolbar-root.left {
        left: var(--ui-inset, 0);
    }
    .toolbar-root.right {
        right: var(--ui-inset, 0);
    }
    /* Floating card sits `--ui-inset` from the top edge (flush when inset is 0). */
    .toolbar-shell {
        margin-top: var(--ui-inset, 0);
    }

    /* ===== Docked rail (same-side fix) =====
       When the toolbar shares a side with a panel/gallery it is rendered in-flow
       as the outermost (screen-edge) column of the side bar rather than floating
       over the image. Its collapse handle is gone (it collapses via the in-menu
       close button), so its only close affordance sits a full panel-width away
       from the panel's own close button. */
    .toolbar-root.docked {
        position: relative;
        inset: auto;
        z-index: auto;
        height: 100%;
        align-items: stretch;
        pointer-events: auto;
        padding: 0;
    }
    .toolbar-shell.docked {
        margin: 0;
        height: 100%;
        flex-direction: column;
        opacity: 1;
        transform: none;
    }
    .actions.docked {
        height: 100%;
        flex-wrap: nowrap;
        overflow-y: auto;
        overflow-x: hidden;
        border-radius: 0;
        box-shadow: none;
        backdrop-filter: none;
        /* Solid edge furniture rather than translucent floating glass. */
        background-color: var(--toolbar-bg);
        align-items: stretch;
        justify-content: flex-start;
    }
    /* Round only the outer (screen-edge) corners so the rail reads as one piece
       with the panel inboard of it; the inner edge is square against the panel. */
    .actions.docked.left {
        border-top-left-radius: var(--radius-toolbar);
        border-bottom-left-radius: var(--radius-toolbar);
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        border-right: var(--border) solid var(--surface-border);
        padding-right: 0;
    }
    .actions.docked.right {
        border-top-right-radius: var(--radius-toolbar);
        border-bottom-right-radius: var(--radius-toolbar);
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left: var(--border) solid var(--surface-border);
        padding-left: 0;
    }

    /* ===== Unified Bar: toolbar buttons embedded in the canvas nav =====
       In `inline` mode the toolbar renders only its action list as a transparent
       horizontal group; `display: contents` collapses the root/shell wrappers so
       the <ul> participates directly in the control-bar flex row. */
    .toolbar-root.inline,
    .toolbar-shell.inline {
        display: contents;
    }
    .actions.inline {
        flex-direction: row;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* Allowed to wrap; balanceInlineRows() caps the width so the wrap
           splits evenly instead of flexbox's greedy first-row fill. row-gap
           matches the column gap so stacked icon rows sit evenly. */
        flex-wrap: wrap;
        gap: var(--ui-gap, 0.375rem);
        padding: 0;
        background: none;
        box-shadow: none;
        backdrop-filter: none;
        border-radius: 0;
    }
    .actions.inline :where(li) {
        padding-bottom: 0;
    }
    .actions.inline :where(li) > :global(*) {
        padding: 0;
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
        padding: var(--ui-chrome-pad, 0.5rem);
        font-size: 0.875rem;
        display: flex;
    }
    /* Layout-driven icon glyph size for the action buttons (markup passes a
       nominal size; CSS scales the rendered <svg> per preset). */
    .menu-item :global(svg) {
        width: var(--ui-icon, 24px);
        height: var(--ui-icon, 24px);
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
        border-radius: var(--radius-buttons);
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
    /* ...but the anchored flyout/menu wrappers must NOT get that padding: for
       the glass dropdowns it sits inside the glass (flush look) while for the
       transparent plugin-flyout wrapper it sits outside (extra gap), so the two
       read inconsistently. Zero it so the gap is governed purely by the
       placement margin below, identically for both. */
    .actions :where(li) > .menu-flyout {
        padding: 0;
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
        position: relative;
        color: var(--toolbar-content);
        box-shadow: var(
            --ui-chrome-shadow,
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a
        );
        justify-content: center;
        align-items: center;
    }
    /* The glass lives on a ::before layer (a sibling of the buttons/popovers,
       not an ancestor) so `.actions` itself does NOT establish a backdrop-filter
       isolation root. That lets the anchored popovers inside it run their own
       backdrop-filter against the image behind them. The pseudo paints behind
       the positioned <li> children by tree order. Excludes docked (solid rail)
       and inline (glass comes from the nav control-bar). */
    .actions:not(.docked):not(.inline)::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
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
        /* Zero the canvas-side (bottom) padding — mirroring the side rails'
           inboard-padding zeroing — so the flyout's placement margin reads as a
           real gap instead of merely cancelling this chrome padding. */
        padding-bottom: 0;
    }
    .actions.top-right > :global(* + *) {
        margin-left: 1px;
    }
    .actions.top-left {
        flex-direction: row;
        border-bottom-right-radius: var(--radius-toolbar);
        /* See .actions.top-right: zero the canvas-side padding so the flyout gap
           shows. */
        padding-bottom: 0;
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

    /* Unread-annotations dot: anchored to the icon corner via translate
       (rather than a fixed inset from the button edge) so its position is
       independent of the button's padding, which is zeroed in inline mode —
       otherwise it lands in a different spot relative to the icon there. It
       only pulls the dot in by 35%, not .indicator-item's 50%, so it still
       stays inside the button's own box and never overhangs the toolbar's
       rounded edge on edge-of-rail buttons. */
    .annotation-dot {
        position: absolute;
        top: 0;
        right: 0;
        translate: 35% -35%;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background-color: var(--color-primary);
        border: var(--border) solid var(--toolbar-bg);
        z-index: 1;
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

    /* ===== Dropdown menu chrome (viewing mode, sequence picker) =====
       Same glass treatment as the plugin flyout's base bar. The blur/fill live
       on a ::before layer, not directly on .popover-menu (which also carries
       `border`) — see the matching comment on ImageManipulationFlyout's .base
       for why combining backdrop-filter + border breaks nested-content
       stacking. */
    .popover-menu {
        border-radius: var(--radius-toolbar);
        border: 1px solid var(--surface-border);
        box-shadow: var(
            --ui-chrome-shadow,
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a
        );
    }
    .popover-menu::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: calc(var(--radius-toolbar) - var(--border, 1px));
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
    }
    .popover-menu.wide {
        min-width: 14rem;
    }

    /* ===== Anchored flyout / menu overlay (shared) =====
       Used by plugin flyouts AND the built-in dropdowns. Deliberately NOT a
       top-layer popover: a low z-index keeps the toolbar tooltips (z-index: 2)
       painting above it. Placement is deterministic via CSS anchor positioning
       and centered on the button along the perpendicular axis. When open, the
       element's own display applies (`.menu` → flex; a plain flyout → block). */
    .menu-flyout {
        position: absolute;
        inset: auto;
        margin: 0;
        color: var(--toolbar-content);
        z-index: 1;
        opacity: 0;
        scale: 95%;
    }
    .menu-flyout:not(.open) {
        display: none;
    }
    .menu-flyout.open {
        opacity: 1;
        scale: 100%;
    }
    @media (prefers-reduced-motion: no-preference) {
        .menu-flyout {
            transition-behavior: allow-discrete;
            transition-property: opacity, scale, display;
            transition-duration: 0.2s;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
    }
    .menu-flyout.up {
        bottom: anchor(top);
        left: anchor(center);
        transform: translateX(-50%);
        margin-bottom: 0.625rem;
        transform-origin: bottom center;
    }
    .menu-flyout.down {
        top: anchor(bottom);
        left: anchor(center);
        transform: translateX(-50%);
        margin-top: 0.625rem;
        transform-origin: top center;
    }
    .menu-flyout.left {
        right: anchor(left);
        top: anchor(center);
        transform: translateY(-50%);
        margin-right: 0.625rem;
        transform-origin: center right;
    }
    .menu-flyout.right {
        left: anchor(right);
        top: anchor(center);
        transform: translateY(-50%);
        margin-left: 0.625rem;
        transform-origin: center left;
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
        border-start-start-radius: var(--radius-buttons);
        border-start-end-radius: var(--radius-buttons);
        border-end-end-radius: var(--radius-buttons);
        border-end-start-radius: var(--radius-buttons);
        outline-offset: 2px;
        /* custom overrides */
        width: var(--ui-hit, 2rem);
        height: var(--ui-hit, 2rem);
        padding: 0;
        background-color: color-mix(
            in oklab,
            var(--toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border-color: var(--surface-border);
        color: var(--toolbar-content);
        box-shadow: var(
            --ui-chrome-shadow,
            0 4px 6px -1px #0000001a,
            0 2px 4px -2px #0000001a
        );
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
        top: var(--ui-inset, 0.375rem);
    }
    .handle.start {
        left: var(--ui-inset, 0.375rem);
    }
    .handle.end {
        right: var(--ui-inset, 0.375rem);
    }
    .handle :global(svg) {
        width: var(--ui-icon, 20px);
        height: var(--ui-icon, 20px);
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
        border-radius: var(--radius-buttons);
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
