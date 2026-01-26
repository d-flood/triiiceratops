<script lang="ts">
    import { getContext } from 'svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import Slideshow from 'phosphor-svelte/lib/Slideshow';
    import CornersIn from 'phosphor-svelte/lib/CornersIn';
    import CornersOut from 'phosphor-svelte/lib/CornersOut';
    import ChatCenteredText from 'phosphor-svelte/lib/ChatCenteredText';
    import Info from 'phosphor-svelte/lib/Info';
    import List from 'phosphor-svelte/lib/List';
    import BookOpen from 'phosphor-svelte/lib/BookOpen';
    import Scroll from 'phosphor-svelte/lib/Scroll';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { tooltip } from '../actions/tooltip';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // Use centralized toolbar state
    const isOpen = $derived(viewerState.toolbarOpen);

    // --- Configuration ---
    // Default to 'left' if not specified
    const position = $derived(viewerState.config.toolbarPosition || 'left');
    const isLeft = $derived(position === 'left');
    const isTop = $derived(position === 'top');
    const tooltipPos = $derived(
        isTop ? 'bottom' : isLeft ? 'right' : 'left',
    ) as 'bottom' | 'right' | 'left';
    const showToggle = $derived(viewerState.config.showToggle !== false);

    // --- Standard Viewer Actions ---
    const toolbarConfig = $derived(viewerState.config.toolbar || {});
    const showSearch = $derived(toolbarConfig.showSearch !== false);
    const showGallery = $derived(toolbarConfig.showGallery !== false);
    const showFullscreen = $derived(toolbarConfig.showFullscreen !== false);
    const showAnnotations = $derived(toolbarConfig.showAnnotations !== false);
    const showInfo = $derived(toolbarConfig.showInfo !== false);
    const showViewingMode = $derived(toolbarConfig.showViewingMode !== false);

    // Derived list of sorted plugin buttons
    let sortedPluginButtons = $derived.by(() => {
        void language.current;
        return [...viewerState.pluginMenuButtons].sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100),
        );
    });

    function toggleOpen() {
        viewerState.toggleToolbar();
    }

    let isOverflowVisible = $state(false);
    $effect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                isOverflowVisible = true;
            }, 320); // Slightly longer than 300ms to ensure transition is done
            return () => clearTimeout(timer);
        } else {
            isOverflowVisible = false;
        }
    });
</script>

<div
    class={[
        'absolute z-50 pointer-events-none flex',
        isTop && 'top-0 w-full items-end flex-col pt-0 pr-2',
        !isTop && 'top-0 h-full items-start pt-4 pb-4',
        !isTop && isLeft && 'left-0 flex-row',
        !isTop && !isLeft && 'right-0 flex-row-reverse',
    ]}
>
    <!-- Collapsible Toolbar -->
    <div
        class={[
            'pointer-events-auto bg-base-100/95 backdrop-blur shadow-xl transition-all duration-300 ease-in-out flex',
            // Layout based on position
            isTop &&
                'flex-row-reverse h-12 w-auto max-w-full rounded-b-xl border-x border-b border-base-200 origin-top',
            !isTop &&
                'flex-col h-auto max-h-full border-y border-base-200 w-12',
            !isTop && isLeft && 'rounded-r-xl border-r origin-left',
            !isTop && !isLeft && 'rounded-l-xl border-l origin-right',

            // Animation state based on open/closed and position
            isOpen && isTop && 'opacity-100 translate-y-0',
            isOpen && !isTop && 'w-12 opacity-100 translate-x-0',
            !isOpen && isTop && 'h-0 opacity-0 -translate-y-full',
            !isOpen && !isTop && 'w-0 opacity-0',
            !isOpen && !isTop && isLeft && '-translate-x-full',
            !isOpen && !isTop && !isLeft && 'translate-x-full',

            // Overflow handling
            isOverflowVisible ? 'overflow-visible' : 'overflow-hidden',
        ]}
    >
        <!-- Close Button (Inside Menu) -->
        {#if showToggle}
            <div
                class={[
                    'shrink-0',
                    isTop && 'h-full flex items-center px-2',
                    !isTop && 'w-full flex justify-center py-2',
                ]}
            >
                <button
                    class="btn btn-ghost btn-circle btn-sm"
                    onclick={toggleOpen}
                    use:tooltip={{
                        content: m.close_menu(),
                        position: tooltipPos,
                    }}
                    aria-label={m.close_menu()}
                >
                    <X size={20} weight="bold" />
                </button>
            </div>
        {:else}
            <!-- Add some padding if no close button -->
            <div class={isTop ? 'w-2' : 'h-2'}></div>
        {/if}

        <!-- Scrollable Actions -->
        <ul
            class={[
                'menu menu-md gap-2 flex-nowrap items-center min-h-0',
                isTop && 'px-2 py-1 menu-horizontal w-auto flex-row-reverse',
                isTop &&
                    !isOverflowVisible &&
                    'overflow-x-auto overflow-y-hidden',
                isTop && isOverflowVisible && 'overflow-visible',
                !isTop &&
                    !isOverflowVisible &&
                    'py-2 px-1 flex-1 overflow-y-auto overflow-x-hidden w-12',
                !isTop && isOverflowVisible && 'py-2 px-1 flex-1 w-12',
            ]}
        >
            <!-- --- Standard Actions --- -->

            {#if showSearch}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            viewerState.showSearchPanel && 'active',
                        ]}
                        use:tooltip={{
                            content: m.search(),
                            position: tooltipPos,
                        }}
                        aria-label={m.toggle_search()}
                        onclick={() => viewerState.toggleSearchPanel()}
                    >
                        <MagnifyingGlass size={24} weight="bold" />
                    </button>
                </li>
            {/if}

            {#if showGallery}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            viewerState.showThumbnailGallery && 'active',
                        ]}
                        use:tooltip={{
                            content: viewerState.showThumbnailGallery
                                ? m.hide_gallery()
                                : m.show_gallery(),
                            position: tooltipPos,
                        }}
                        aria-label={viewerState.showThumbnailGallery
                            ? m.hide_gallery()
                            : m.show_gallery()}
                        onclick={() => viewerState.toggleThumbnailGallery()}
                    >
                        <Slideshow size={24} weight="bold" />
                    </button>
                </li>
            {/if}

            {#if showViewingMode}
                <li
                    class="dropdown {isTop
                        ? 'dropdown-bottom'
                        : isLeft
                          ? 'dropdown-right'
                          : 'dropdown-left'}"
                >
                    <div
                        tabindex="0"
                        role="button"
                        class="flex items-center justify-center"
                        use:tooltip={{
                            content: m.viewing_mode_label(),
                            position: tooltipPos,
                        }}
                        aria-label={m.viewing_mode_label()}
                    >
                        {#if viewerState.viewingMode === 'paged'}
                            <BookOpen size={24} weight="bold" />
                        {:else}
                            <Scroll size={24} weight="bold" />
                        {/if}
                    </div>
                    <ul
                        tabindex="-1"
                        class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-48 border border-base-200 font-normal {isTop
                            ? 'left-1/2 -translate-x-1/2'
                            : ''}"
                    >
                        <li>
                            <button
                                class={viewerState.viewingMode === 'individuals'
                                    ? 'active'
                                    : ''}
                                onclick={() =>
                                    viewerState.setViewingMode('individuals')}
                            >
                                <Scroll size={16} />
                                {m.viewing_mode_individuals()}
                            </button>
                        </li>
                        <li>
                            <button
                                class={viewerState.viewingMode === 'paged'
                                    ? 'active'
                                    : ''}
                                onclick={() =>
                                    viewerState.setViewingMode('paged')}
                            >
                                <BookOpen size={16} />
                                {m.viewing_mode_paged()}
                            </button>
                        </li>
                        {#if viewerState.viewingMode === 'paged'}
                            <div class="divider my-1"></div>
                            <li>
                                <label class="label cursor-pointer py-1 gap-2">
                                    <span class="label-text text-sm"
                                        >{m.viewing_mode_shift_pairing()}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-sm"
                                        checked={viewerState.pagedOffset === 1}
                                        onchange={() =>
                                            viewerState.togglePagedOffset()}
                                    />
                                </label>
                            </li>
                        {/if}
                    </ul>
                </li>
            {/if}

            {#if showFullscreen}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            viewerState.isFullScreen && 'active',
                        ]}
                        use:tooltip={{
                            content: viewerState.isFullScreen
                                ? m.exit_full_screen()
                                : m.enter_full_screen(),
                            position: tooltipPos,
                        }}
                        aria-label={viewerState.isFullScreen
                            ? m.exit_full_screen()
                            : m.enter_full_screen()}
                        onclick={() => viewerState.toggleFullScreen()}
                    >
                        {#if viewerState.isFullScreen}
                            <CornersIn size={24} weight="bold" />
                        {:else}
                            <CornersOut size={24} weight="bold" />
                        {/if}
                    </button>
                </li>
            {/if}

            {#if showAnnotations}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            viewerState.showAnnotations && 'active',
                        ]}
                        use:tooltip={{
                            content: viewerState.showAnnotations
                                ? m.hide_annotations()
                                : m.show_annotations(),
                            position: tooltipPos,
                        }}
                        aria-label={viewerState.showAnnotations
                            ? m.hide_annotations()
                            : m.show_annotations()}
                        onclick={() => viewerState.toggleAnnotations()}
                    >
                        <ChatCenteredText size={24} weight="bold" />
                    </button>
                </li>
            {/if}

            {#if showInfo}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            viewerState.showMetadataDialog && 'active',
                        ]}
                        use:tooltip={{
                            content: m.metadata(),
                            position: tooltipPos,
                        }}
                        aria-label={m.toggle_metadata()}
                        onclick={() => viewerState.toggleMetadataDialog()}
                    >
                        <Info size={24} weight="bold" />
                    </button>
                </li>
            {/if}

            <!-- Separator if both groups exist -->
            {#if (showSearch || showGallery || showFullscreen || showAnnotations || showInfo || showViewingMode) && sortedPluginButtons.length > 0}
                <div
                    class={[
                        'divider',
                        isTop && 'divider-horizontal mx-0',
                        !isTop && 'my-0',
                    ]}
                ></div>
            {/if}

            <!-- --- Plugin Actions --- -->
            {#each sortedPluginButtons as button (button.id)}
                {@const Icon = button.icon}
                {@const tooltipText =
                    // @ts-expect-error - m[button.tooltip] might be a function
                    typeof m[button.tooltip] === 'function'
                        ? // @ts-expect-error - m[button.tooltip] is a function
                          m[button.tooltip]()
                        : button.tooltip}
                <li>
                    <button
                        class={[
                            'flex items-center justify-center',
                            button.isActive?.() && 'active',
                        ]}
                        use:tooltip={{
                            content: tooltipText,
                            position: tooltipPos,
                        }}
                        aria-label={tooltipText}
                        onclick={() => {
                            button.onClick();
                        }}
                    >
                        <Icon size={24} weight="bold" />
                    </button>
                </li>
            {/each}
        </ul>
    </div>

    <!-- Toggle Handle (Only visible when closed) -->
    {#if showToggle}
        <button
            class={[
                'pointer-events-auto btn btn-circle btn-sm shadow-md z-40 transition-opacity duration-300 absolute mt-2',
                'bg-base-200/90 backdrop-blur border border-base-300 hover:bg-base-300 text-base-content',
                isOpen && 'opacity-0 pointer-events-none',
                !isOpen && 'opacity-100',
            ]}
            style={isTop
                ? 'right: 0.5rem;'
                : isLeft
                  ? 'left: 0.5rem;'
                  : 'right: 0.5rem;'}
            aria-label={m.open_menu()}
            use:tooltip={{
                content: m.open_menu(),
                position: tooltipPos,
            }}
            onclick={toggleOpen}
        >
            <List size={20} weight="bold" />
        </button>
    {/if}
</div>
