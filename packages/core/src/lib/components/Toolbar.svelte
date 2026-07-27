<script lang="ts">
    import Icon from './Icon.svelte';
    import PluginIcon from './PluginIcon.svelte';
    import PluginMountHost from './PluginMountHost.svelte';
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages, language } from '../state/i18n.svelte';

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
    const m = getMessages();

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
        // Only balance once settled (open + animation finished). While closed or
        // animating the group is a single clipped row, so clear any cap — a
        // stale one would force it to wrap tall and balloon the bar's height.
        // Re-runs when `settled` flips.
        if (!settled) {
            el.style.maxWidth = '';
            return;
        }
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

    // --- Unified Bar open/close animation ---
    // The group is revealed/collapsed by animating a max-width CLIP over it. While
    // animating (and closed) it is held to a single `nowrap` row (see `.collapsed`
    // below), so it never reflows taller (opening) or unwraps ~2× wider (closing);
    // the animated `max-width` also CAPS the bar, so even the transient single row
    // can't widen it past the target. `overflow: hidden` clips the excess. Once
    // the transition finishes we "settle": release the clip (`max-width: none` +
    // `overflow: visible`) and re-enable wrapping so the row balancer and plugin
    // flyouts work again. The target width is measured from the DOM because CSS
    // can't transition to/from an intrinsic `auto` width.
    const ANIM_MS = 200;
    let shellEl: HTMLDivElement | undefined = $state();
    let settled = $state(false);
    let animating = $state(false);
    let firstRun = true;

    $effect(() => {
        const shell = shellEl;
        const ul = actionsEl;
        // Depend on isOpen so this re-runs on every toggle.
        const open = isOpen;
        if (!inline || !shell || !ul) {
            settled = false;
            animating = false;
            return;
        }
        // Don't animate the initial mount — just adopt the resting state.
        if (firstRun) {
            firstRun = false;
            settled = open;
            return;
        }

        settled = false;
        animating = true;
        let raf = 0;
        if (open) {
            // Reveal 0 → natural single-row width (measured with the clip lifted).
            // Opening starts from the closed single row, so there is nothing to
            // unwrap; it settles into its wrapped layout at the end.
            shell.style.maxWidth = 'none';
            const w = ul.offsetWidth; // forced layout read
            shell.style.maxWidth = '0px';
            raf = requestAnimationFrame(() => {
                shell.style.maxWidth = `${w}px`;
            });
        } else {
            // Collapse the CURRENT (possibly multi-row) layout → 0. Freeze the
            // list at its exact current width so it keeps its wrapped rows while
            // the clip shrinks — otherwise switching to nowrap would unwrap the
            // rows into one ~2× wider row for a frame (the visible flash).
            const w = ul.offsetWidth;
            ul.style.width = `${w}px`;
            shell.style.maxWidth = `${w}px`;
            void shell.offsetWidth; // reflow so the next value transitions
            shell.style.maxWidth = '0px';
        }
        const id = setTimeout(() => {
            // Release: clear the inline sizing so the resting CSS applies
            // (settled → none / closed → 0). Now the closed group may drop to a
            // single nowrap row (compact height) — invisible, already clipped.
            shell.style.maxWidth = '';
            ul.style.width = '';
            animating = false;
            settled = open;
        }, ANIM_MS + 40);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            clearTimeout(id);
        };
    });

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
    const annotationCount = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return 0;
        }

        return viewerState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        ).length;
    });
    const showAnnotations = $derived(
        toolbarConfig.showAnnotations !== false && annotationCount > 0,
    );
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
        inline
            ? navOnTop
                ? 'down'
                : 'up'
            : isTop
              ? 'down'
              : position === 'left'
                ? 'right'
                : 'left',
    );

    function findFlyout(domId: string | undefined) {
        if (!domId) return undefined;
        return viewerState.pluginFlyouts.find((f) => f.domId === domId);
    }

    // Built-in toolbar dropdowns (viewing mode, sequence picker) use the same
    // non-top-layer flyout pattern as plugin flyouts, so tooltips paint above
    // them too. Only one is open at a time.
    let openMenu = $state<string | null>(null);
    let toolbarRootEl: HTMLElement | undefined = $state();

    function toggleMenu(name: string) {
        openMenu = openMenu === name ? null : name;
    }

    // When a built-in flyout opens, move keyboard focus into it (menu behavior).
    // Escape restores focus to the toggle (see handleWindowKeydown). Runs after
    // the DOM updates so the `.open` panel and its items exist.
    $effect(() => {
        if (!openMenu) return;
        const name = openMenu;
        requestAnimationFrame(() => {
            if (openMenu !== name) return;
            const panel = toolbarRootEl?.querySelector(
                '[data-flyout-panel].open',
            );
            const first = panel?.querySelector<HTMLElement>(
                '[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], button, [href], input, select',
            );
            first?.focus();
        });
    });

    // Roving arrow-key navigation within a built-in flyout menu (ArrowUp/Down,
    // Home/End). Enter/Space activate natively; Escape is handled globally.
    function onFlyoutMenuKeydown(e: KeyboardEvent) {
        const menu = e.currentTarget as HTMLElement;
        const items = Array.from(
            menu.querySelectorAll<HTMLElement>(
                '[role="menuitemradio"], [role="menuitemcheckbox"]',
            ),
        );
        if (items.length === 0) return;
        const root = menu.getRootNode() as Document | ShadowRoot;
        const active = root.activeElement as HTMLElement | null;
        const current = items.findIndex((el) => el === active);
        let next = -1;
        if (e.key === 'ArrowDown') next = (current + 1) % items.length;
        else if (e.key === 'ArrowUp')
            next = (current - 1 + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        if (next >= 0) {
            e.preventDefault();
            items[next].focus();
        }
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
            // Restore focus to the toggle of whichever flyout is open before
            // dismissing it, so keyboard focus is never dropped to <body>.
            const openToggle = toolbarRootEl?.querySelector<HTMLElement>(
                '[data-flyout-toggle][aria-expanded="true"]',
            );
            closeAllOverlays();
            openToggle?.focus();
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
    bind:this={toolbarRootEl}
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
    <!-- The placement/animation state classes are for the floating and docked
         variants only: in `inline` mode the configured toolbar side is
         meaningless (the buttons live in the nav bar) and e.g. `closed-left`'s
         translateX(-100%) would fling the group sideways on close. -->
    <div
        bind:this={shellEl}
        class="toolbar-shell"
        class:top-right={!inline && position === 'top-right'}
        class:top-left={!inline && position === 'top-left'}
        class:side={!inline && !isTop}
        class:docked
        class:inline
        class:open-top={!inline && isOpen && isTop}
        class:open-side={!inline && isOpen && !isTop}
        class:closed-top={!inline && !isOpen && isTop}
        class:closed-left={!inline && !isOpen && position === 'left'}
        class:closed-right={!inline && !isOpen && position === 'right'}
        class:inline-open={inline && isOpen}
        class:inline-closed={inline && !isOpen}
        class:settled={inline && settled}
    >
        <!-- Scrollable Actions -->
        <ul
            bind:this={actionsEl}
            class="menu actions"
            class:horizontal={isTop || inline}
            class:top-right={!inline && position === 'top-right'}
            class:top-left={!inline && position === 'top-left'}
            class:left={!inline && position === 'left'}
            class:right={!inline && position === 'right'}
            class:docked
            class:inline
            class:collapsed={inline && !settled && !(animating && !isOpen)}
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
                        <Icon name="X" size={24} />
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
                        aria-pressed={viewerState.showCollectionPanel}
                        onclick={() => viewerState.toggleCollectionPanel()}
                    >
                        <Icon name="Folder" size={24} />
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
                        aria-pressed={viewerState.showSearchPanel}
                        onclick={() => viewerState.toggleSearchPanel()}
                    >
                        <Icon name="MagnifyingGlass" size={24} />
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
                        aria-pressed={viewerState.showThumbnailGallery}
                        onclick={() => viewerState.toggleThumbnailGallery()}
                    >
                        <Icon name="Slideshow" size={24} />
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
                        aria-pressed={viewerState.showStructuresPanel}
                        onclick={() => viewerState.toggleStructuresPanel()}
                    >
                        <Icon name="ListBullets" size={24} />
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
                        aria-haspopup="menu"
                        aria-controls="tri-flyout-viewing-mode"
                        aria-expanded={openMenu === 'viewing-mode'}
                        style="anchor-name:--anchor-viewing-mode"
                        onclick={() => toggleMenu('viewing-mode')}
                    >
                        {#if viewerState.viewingMode === 'paged'}
                            <Icon name="BookOpen" size={24} />
                        {:else if viewerState.viewingMode === 'continuous'}
                            <Icon name="Scroll" size={24} />
                        {:else}
                            <Icon name="File" size={24} />
                        {/if}
                    </button>
                    <ul
                        id="tri-flyout-viewing-mode"
                        data-flyout-panel
                        role="menu"
                        tabindex="-1"
                        aria-label={m.viewing_mode_label()}
                        class="menu popover-menu menu-flyout {flyoutPlacement}"
                        class:open={openMenu === 'viewing-mode'}
                        style="position-anchor: --anchor-viewing-mode;"
                        onkeydown={onFlyoutMenuKeydown}
                    >
                        <li role="none">
                            <button
                                class="menu-item"
                                role="menuitemradio"
                                aria-checked={viewerState.viewingMode ===
                                    'individuals'}
                                class:menu-active={viewerState.viewingMode ===
                                    'individuals'}
                                onclick={() =>
                                    viewerState.setViewingMode('individuals')}
                            >
                                <Icon name="File" size={16} />
                                <span>{m.viewing_mode_individuals()}</span>
                                {#if viewerState.viewingMode === 'individuals'}
                                    <Icon name="Check" size={16} />
                                {/if}
                            </button>
                        </li>
                        <li role="none">
                            <button
                                class="menu-item"
                                role="menuitemradio"
                                aria-checked={viewerState.viewingMode ===
                                    'paged'}
                                class:menu-active={viewerState.viewingMode ===
                                    'paged'}
                                onclick={() =>
                                    viewerState.setViewingMode('paged')}
                            >
                                <Icon name="BookOpen" size={16} />
                                <span>{m.viewing_mode_paged()}</span>
                                {#if viewerState.viewingMode === 'paged'}
                                    <Icon name="Check" size={16} />
                                {/if}
                            </button>
                        </li>
                        <li role="none">
                            <button
                                class="menu-item"
                                role="menuitemradio"
                                aria-checked={viewerState.viewingMode ===
                                    'continuous'}
                                class:menu-active={viewerState.viewingMode ===
                                    'continuous'}
                                onclick={() =>
                                    viewerState.setViewingMode('continuous')}
                            >
                                <Icon name="Scroll" size={16} />
                                <span>{m.viewing_mode_continuous()}</span>
                                {#if viewerState.viewingMode === 'continuous'}
                                    <Icon name="Check" size={16} />
                                {/if}
                            </button>
                        </li>
                        {#if viewerState.viewingMode === 'paged'}
                            <li role="none">
                                <button
                                    class="menu-item text-start"
                                    role="menuitemcheckbox"
                                    aria-checked={viewerState.pagedOffset === 1}
                                    class:menu-active={viewerState.pagedOffset ===
                                        1}
                                    onclick={() =>
                                        viewerState.togglePagedOffset()}
                                >
                                    <Icon name="ArrowsLeftRight" size={16} />
                                    <span>{m.viewing_mode_shift_pairing()}</span
                                    >
                                    {#if viewerState.pagedOffset === 1}
                                        <Icon name="Check" size={16} />
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
                        aria-haspopup="menu"
                        aria-controls="tri-flyout-sequence-picker"
                        aria-expanded={openMenu === 'sequence-picker'}
                        style="anchor-name:--anchor-sequence-picker"
                        onclick={() => toggleMenu('sequence-picker')}
                    >
                        <span class="indicator-item count-badge">
                            {viewerState.sequenceCount > 99
                                ? '99+'
                                : viewerState.sequenceCount}
                        </span>
                        <Icon name="Stack" size={24} />
                    </button>
                    <ul
                        id="tri-flyout-sequence-picker"
                        data-flyout-panel
                        role="menu"
                        tabindex="-1"
                        aria-label={m.sequence_label()}
                        class="menu popover-menu wide menu-flyout {flyoutPlacement}"
                        class:open={openMenu === 'sequence-picker'}
                        style="position-anchor: --anchor-sequence-picker;"
                        onkeydown={onFlyoutMenuKeydown}
                    >
                        {#each sequenceOptions as option (option.index)}
                            <li role="none">
                                <button
                                    class="menu-item"
                                    role="menuitemradio"
                                    aria-checked={viewerState.selectedSequenceIndex ===
                                        option.index}
                                    class:menu-active={viewerState.selectedSequenceIndex ===
                                        option.index}
                                    onclick={() =>
                                        viewerState.setSequenceIndex(
                                            option.index,
                                        )}
                                >
                                    <Icon name="Stack" size={16} />
                                    <span>{option.label}</span>
                                    {#if viewerState.selectedSequenceIndex === option.index}
                                        <Icon name="Check" size={16} />
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
                        aria-pressed={viewerState.isFullScreen}
                        onclick={() => viewerState.toggleFullScreen()}
                    >
                        {#if viewerState.isFullScreen}
                            <Icon name="CornersIn" size={24} />
                        {:else}
                            <Icon name="CornersOut" size={24} />
                        {/if}
                    </button>
                </li>
            {/if}

            {#if showAnnotations}
                <li>
                    <button
                        class="menu-item tooltip {tooltipPlacement}"
                        class:menu-active={viewerState.showAnnotations}
                        data-tip={annotationsTooltip}
                        aria-label={annotationsTooltip}
                        aria-pressed={viewerState.showAnnotations}
                        onclick={() => viewerState.toggleAnnotations()}
                    >
                        <Icon name="ChatCenteredText" size={24} />
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
                        aria-pressed={viewerState.showMetadataPanel}
                        onclick={() => viewerState.toggleMetadataPanel()}
                    >
                        <Icon name="Info" size={24} />
                    </button>
                </li>
            {/if}

            <!-- Separator if both groups exist. An <li role="separator"> (not a
                 bare <div>) so the actions <ul> only ever directly contains <li>
                 — a bare <div> child trips the axe "list" rule once a plugin adds
                 a toolbar button (epic restore-plugin-toolbar-chrome). -->
            {#if (showSearch || showGallery || showFullscreen || showAnnotations || showInfo || showViewingMode || showStructures || showCollection) && sortedPluginButtons.length > 0}
                <li
                    class="divider"
                    class:horizontal={isTop || inline}
                    role="separator"
                    aria-hidden="true"
                ></li>
            {/if}

            <!-- --- Plugin Actions --- -->
            {#key language.current}
                {#each sortedPluginButtons as button (button.id)}
                    {@const LegacyIcon = button.icon}
                    {@const tooltipText = resolvePluginTooltip(button.tooltip)}
                    <!-- Every plugin registers both a panel and a flyout entry;
                         render the anchored flyout only when the plugin's
                         effective target is 'flyout', otherwise a plain toggle
                         (the panel renders in the viewer chrome). -->
                    {@const flyout =
                        button.pluginId &&
                        viewerState.getPluginTarget(button.pluginId) ===
                            'flyout'
                            ? findFlyout(button.flyoutDomId)
                            : undefined}
                    <li>
                        {#if flyout}
                            {@const Flyout = flyout.component}
                            {@const open = button.isActive?.() ?? false}
                            <button
                                class="menu-item tooltip {tooltipPlacement}"
                                class:menu-active={open}
                                data-tip={tooltipText}
                                aria-label={tooltipText}
                                aria-haspopup="dialog"
                                aria-controls="tri-flyout-{flyout.domId}"
                                aria-expanded={open}
                                data-flyout-toggle
                                data-plugin-toggle={button.pluginId}
                                onclick={() => button.onClick()}
                                style="anchor-name:--anchor-{flyout.domId}"
                            >
                                {#if button.iconDescriptor}
                                    <PluginIcon
                                        descriptor={button.iconDescriptor}
                                        size={24}
                                    />
                                {:else if LegacyIcon}
                                    <LegacyIcon size={24} />
                                {/if}
                            </button>
                            <!-- A normal (non-top-layer) anchored element so
                                 tooltips always paint above it. Legacy flyouts
                                 stay mounted and toggle via `.open` so their
                                 plugin state persists; SDK (core-owned chrome)
                                 flyouts mount their content-only container on open
                                 and unmount on close. -->
                            <div
                                id="tri-flyout-{flyout.domId}"
                                class="menu-flyout {flyoutPlacement}"
                                class:open
                                data-flyout-panel
                                role="dialog"
                                aria-label={tooltipText}
                                style="position-anchor:--anchor-{flyout.domId}"
                            >
                                {#if flyout.mount}
                                    {#if open}
                                        <PluginMountHost mount={flyout.mount} />
                                    {/if}
                                {:else if Flyout}
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
                                {/if}
                            </div>
                        {:else}
                            <button
                                class="menu-item tooltip {tooltipPlacement}"
                                class:menu-active={button.isActive?.()}
                                data-tip={tooltipText}
                                aria-label={tooltipText}
                                data-plugin-toggle={button.pluginId}
                                onclick={() => button.onClick()}
                            >
                                {#if button.iconDescriptor}
                                    <PluginIcon
                                        descriptor={button.iconDescriptor}
                                        size={24}
                                    />
                                {:else if LegacyIcon}
                                    <LegacyIcon size={24} />
                                {/if}
                            </button>
                        {/if}
                    </li>
                {/each}
            {/key}
        </ul>
    </div>

    <!-- Unified Bar collapse toggle: a persistent button living in the nav bar,
         placed after (inline-end of) the collapsible group so the actions
         expand out to its left. Only in `inline` mode; the floating/side/docked
         layouts use the handle or the in-menu close button instead. -->
    {#if inline && showToggle}
        <button
            class="menu-item inline-toggle tooltip {tooltipPlacement}"
            data-tip={isOpen ? m.close_menu() : m.open_menu()}
            aria-label={isOpen ? m.close_menu() : m.open_menu()}
            aria-expanded={isOpen}
            onclick={toggleOpen}
        >
            {#if isOpen}
                <Icon name="X" size={24} />
            {:else}
                <Icon name="List" size={24} />
            {/if}
        </button>
    {/if}

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
            <Icon name="List" size={20} />
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
        background-color: var(--tri-toolbar-bg);
        align-items: stretch;
        justify-content: flex-start;
    }
    /* Round only the outer (screen-edge) corners so the rail reads as one piece
       with the panel inboard of it; the inner edge is square against the panel. */
    .actions.docked.left {
        border-top-left-radius: var(--tri-radius-toolbar);
        border-bottom-left-radius: var(--tri-radius-toolbar);
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        border-right: var(--tri-border) solid var(--tri-surface-border);
        padding-right: 0;
    }
    .actions.docked.right {
        border-top-right-radius: var(--tri-radius-toolbar);
        border-bottom-right-radius: var(--tri-radius-toolbar);
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left: var(--tri-border) solid var(--tri-surface-border);
        padding-left: 0;
    }

    /* ===== Unified Bar: toolbar buttons embedded in the canvas nav =====
       In `inline` mode the toolbar renders its action list as a transparent
       horizontal group next to a persistent toggle. `display: contents` on the
       root collapses that wrapper so the toggle + shell participate directly in
       the control-bar flex row. */
    .toolbar-root.inline {
        display: contents;
    }
    /* The shell holds the action group and reveals/collapses it by animating a
       max-width CLIP (driven imperatively from the open/close effect). The group
       is aligned to the inline-end (toggle side) via `justify-items: end`, so the
       clip eats from the far edge — the icons emerge to the LEFT of the toggle.
       `grid-template-columns` is static (no reflow); the JS freezes the group's
       width during the animation so the wrapped layout is preserved exactly. */
    .toolbar-shell.inline {
        display: grid;
        grid-template-columns: 1fr;
        justify-items: end;
        align-items: center;
        /* Clipped while closed/animating so the frozen block is revealed rather
           than spilling; opened up to `visible` once settled (below) so plugin
           flyouts can escape. */
        overflow: hidden;
        /* Gap sits on the toggle side (inline-end); it collapses with the group
           so the toggle butts against the nav divider when closed. */
        margin-inline-end: var(--ui-gap, 0.375rem);
        transition-property: max-width, opacity, margin-inline-end;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    /* Resting closed state (JS clears its inline max-width so this applies). */
    .toolbar-shell.inline-closed {
        max-width: 0;
        opacity: 0;
        margin-inline-end: 0;
        pointer-events: none;
    }
    /* Settled = open and the transition has finished: release the clip and let
       flyouts escape the bar. (Wrapping is re-enabled in parallel on the list.) */
    .toolbar-shell.inline.settled {
        overflow: visible;
        max-width: none;
    }
    /* The persistent toggle matches the action buttons' icon-button look.
       `.toolbar-root` sets `pointer-events: none` (so the floating overlay never
       blocks the canvas); as a direct child of the root, the toggle must opt
       back in — the shell does the same for the action buttons. */
    .inline-toggle {
        flex-shrink: 0;
        pointer-events: auto;
    }
    .actions.inline {
        flex-direction: row;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* min-width:0 lets the closed 0fr grid track resolve to zero width
           (overriding the grid item's automatic min-content minimum) so the
           group truly collapses. */
        min-width: 0;
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
    /* While collapsed, force a single row: the shrinking track would otherwise
       reflow the icons into a tall vertical column (ballooning the bar). Open,
       the row wraps normally so the balancer can split it across rows. */
    .actions.inline.collapsed {
        flex-wrap: nowrap;
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
        --menu-active-fg: var(--tri-color-neutral-content);
        --menu-active-bg: var(--tri-color-neutral);
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
        border-radius: var(--tri-radius-buttons);
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
            var(--tri-toolbar-content) 10%,
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
        background-color: var(--tri-color-primary);
        color: var(--tri-color-primary-content);
        cursor: pointer;
    }
    .text-start {
        text-align: start;
    }

    /* ===== Actions list look ===== */
    .actions {
        position: relative;
        color: var(--tri-toolbar-content);
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
            var(--tri-toolbar-bg) 70%,
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
        border-bottom-left-radius: var(--tri-radius-toolbar);
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
        border-bottom-right-radius: var(--tri-radius-toolbar);
        /* See .actions.top-right: zero the canvas-side padding so the flyout gap
           shows. */
        padding-bottom: 0;
    }
    .actions.top-left > :global(* + *) {
        margin-left: 1px;
    }
    .actions.left {
        border-bottom-right-radius: var(--tri-radius-toolbar);
        padding-right: 0.25rem;
    }
    .actions.left > :global(* + *) {
        margin-top: 1px;
    }
    .actions.right {
        border-bottom-left-radius: var(--tri-radius-toolbar);
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
        --size: calc(var(--tri-size-selector, 0.25rem) * 5);
        border-radius: var(--tri-radius-selector);
        vertical-align: middle;
        color: var(--tri-color-primary-content);
        border: var(--tri-border) solid var(--tri-color-primary);
        background-color: var(--tri-color-primary);
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
        border-radius: var(--tri-radius-toolbar);
        border: 1px solid var(--tri-surface-border);
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
        border-radius: calc(var(--tri-radius-toolbar) - var(--tri-border, 1px));
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
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
        color: var(--tri-toolbar-content);
        z-index: 1;
        opacity: 0;
        scale: 95%;
    }
    /* In the docked rail the actions list is a scroll container (overflow-y:auto
       forces overflow-x to clip too), which would cut off these anchored flyouts
       as they extend toward the canvas. Promote them to `fixed` so CSS anchor
       positioning still glues them to the button while they escape the rail's
       overflow. No transformed ancestor, so `fixed` is viewport-relative and
       unclipped; the rail host's z-index keeps them above a same-side panel. */
    .actions.docked .menu-flyout {
        position: fixed;
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
    /* Keep neighboring toolbar and flyout targets' 24px WCAG safe regions apart. */
    .menu-flyout.up {
        bottom: anchor(top);
        left: anchor(center);
        transform: translateX(-50%);
        margin-bottom: 1.5rem;
        transform-origin: bottom center;
    }
    .menu-flyout.down {
        top: anchor(bottom);
        left: anchor(center);
        transform: translateX(-50%);
        margin-top: 1.5rem;
        transform-origin: top center;
    }
    .menu-flyout.left {
        right: anchor(left);
        top: anchor(center);
        transform: translateY(-50%);
        margin-right: 1.5rem;
        transform-origin: center right;
    }
    .menu-flyout.right {
        left: anchor(right);
        top: anchor(center);
        transform: translateY(-50%);
        margin-left: 1.5rem;
        transform-origin: center left;
    }

    /* ===== Divider ===== A solid bar, oriented across the list's cross-axis —
       matching the nav bar's `.divider-v` treatment (ViewerControls.svelte)
       used to separate zoom/nav controls, so both read consistently. */
    .divider {
        /* Non-positioned elements paint BEHIND the .actions::before glass layer
           (which is position:absolute), the same reason .menu li carries
           position:relative — without this the divider is fully hidden under
           the frosted background. */
        position: relative;
        flex-shrink: 0;
        align-self: center;
        width: 100%;
        height: 1px;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-content) 20%,
            transparent
        );
    }
    .divider.horizontal {
        width: 1px;
        height: 1rem;
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
        border-width: var(--tri-border);
        border-style: solid;
        border-start-start-radius: var(--tri-radius-buttons);
        border-start-end-radius: var(--tri-radius-buttons);
        border-end-end-radius: var(--tri-radius-buttons);
        border-end-start-radius: var(--tri-radius-buttons);
        outline-offset: 2px;
        /* custom overrides */
        width: var(--ui-hit, 2rem);
        height: var(--ui-hit, 2rem);
        padding: 0;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border-color: var(--tri-surface-border);
        color: var(--tri-toolbar-content);
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
        background-color: var(--tri-surface-border);
    }
    .handle.invisible {
        opacity: 0;
        pointer-events: none;
    }
    /* The open button reads as a flush tab on the viewer edge it is anchored
       to: pin flush to that edge and drop the border touching it (so it doesn't
       double up with the viewer's own border). A single corner is rounded —
       always a bottom corner, on the side facing the canvas: bottom-right when
       anchored left, bottom-left when anchored right. Top and Sides share this
       treatment. */
    .handle.start {
        left: var(--ui-inset, 0.375rem);
        border-start-start-radius: 0;
        border-start-end-radius: 0;
        border-end-start-radius: 0;
        border-end-end-radius: var(--tri-radius-buttons);
    }
    .handle.end {
        right: var(--ui-inset, 0.375rem);
        border-start-start-radius: 0;
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        border-end-start-radius: var(--tri-radius-buttons);
    }
    .handle.top {
        top: 0;
        border-top-width: 0;
    }
    .handle.start:not(.top) {
        left: 0;
        border-left-width: 0;
    }
    .handle.end:not(.top) {
        right: 0;
        border-right-width: 0;
    }
    .handle :global(svg) {
        width: var(--ui-icon, 20px);
        height: var(--ui-icon, 20px);
    }

    /* ===== Tooltip scaffolding (sm sizing) ===== */
    .tooltip {
        --tt-bg: var(--tri-color-neutral);
        --tt-fg: var(--tri-color-neutral-content);
        --tt-off: calc(100% + 0.5rem);
        --tt-tail: calc(100% + 1px + 0.25rem);
        position: relative;
    }
    .tooltip[data-tip]:not([data-tip=''])::before {
        border-radius: var(--tri-radius-buttons);
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
    /* Edge correction: the outermost button of a top-anchored toolbar sits in
       the viewer corner, so its centered bottom-tooltip bubble would overflow
       the viewer border. Anchor just that bubble to the button's outer edge
       (the tail keeps pointing at the button center). */
    .actions.top-left > li:first-child .tooltip.bottom::before {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 0;
    }
    .actions.top-right > li:first-child .tooltip.bottom::before {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) 0 auto auto;
    }
    /* Same correction for the Unified Bar: when the nav is aligned to the
       inline-start screen edge, the toolbar buttons are the leading group, so
       the first button hugs the edge and its centered tooltip would overflow.
       Anchor that bubble to the button's start edge (top/bottom per nav edge). */
    :global([data-nav-align='start'])
        .actions.inline
        > li:first-child
        .tooltip.top::before {
        transform: translateX(0) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-off) 0;
    }
    :global([data-nav-align='start'])
        .actions.inline
        > li:first-child
        .tooltip.bottom::before {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 0;
    }
    /* Keep the tail attached to the re-anchored bubble: pin it just inboard of
       the button's start edge (under the bubble body) instead of the default
       button-center, which would leave it detached from the shifted bubble. */
    :global([data-nav-align='start'])
        .actions.inline
        > li:first-child
        .tooltip.top::after {
        transform: translateX(0) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-tail) 0.5rem;
    }
    :global([data-nav-align='start'])
        .actions.inline
        > li:first-child
        .tooltip.bottom::after {
        transform: translateX(0) translateY(var(--tt-pos, -0.25rem))
            rotate(180deg);
        inset: var(--tt-tail) auto auto 0.5rem;
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
