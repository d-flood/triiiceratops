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
    import File from 'phosphor-svelte/lib/File';
    import Check from 'phosphor-svelte/lib/Check';
    import X from 'phosphor-svelte/lib/X';
    import ArrowsLeftRight from 'phosphor-svelte/lib/ArrowsLeftRight';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // Use centralized toolbar state
    const isOpen = $derived(viewerState.toolbarOpen);

    // --- Configuration ---
    // Default to 'left' if not specified
    const position = $derived(viewerState.config.toolbarPosition || 'left');
    const isTop = $derived(position === 'top-left' || position === 'top-right');
    const showToggle = $derived(viewerState.config.showToggle !== false);

    // --- Tooltip Classes ---
    const tooltipClasses = $derived(
        isTop
            ? ['tooltip', 'tooltip-bottom']
            : position === 'left'
              ? ['tooltip', 'tooltip-right']
              : ['tooltip', 'tooltip-left'],
    );

    // Tooltip classes specifically for the open button when toolbar is closed
    const openButtonTooltipClasses = $derived(
        position === 'top-left'
            ? ['tooltip', 'tooltip-right']
            : position === 'top-right'
              ? ['tooltip', 'tooltip-left']
              : position === 'left'
                ? ['tooltip', 'tooltip-right']
                : ['tooltip', 'tooltip-left'],
    );

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
</script>

<div
    class={[
        'absolute z-50 pointer-events-none flex',
        position === 'top-right' && 'w-full items-end flex-col pt-0 pr-3 top-0',
        position === 'top-left' &&
            'w-full items-start flex-col pt-0 pl-3 top-0',
        !isTop && 'h-full items-start top-1.5',
        position === 'left' && 'left-0',
        position === 'right' && 'right-0',
    ]}
>
    <!-- Collapsible Toolbar -->
    <div
        class={[
            'pointer-events-auto transition-all duration-200 ease-in-out flex',
            // Layout based on position
            position === 'top-right' &&
                'flex-row-reverse h-12 w-auto max-w-full origin-top mr-4',
            position === 'top-left' &&
                'flex-row h-12 w-auto max-w-full origin-top ml-4',
            !isTop && 'flex-col h-auto max-h-full',
            // Animation state based on open/closed and position
            isOpen && isTop && 'opacity-100 translate-y-0',
            isOpen && !isTop && 'opacity-100 translate-x-0',
            !isOpen && isTop && 'h-0 opacity-0 -translate-y-full',
            !isOpen &&
                position === 'left' &&
                'opacity-0 -translate-x-full pointer-events-none',
            !isOpen &&
                position === 'right' &&
                'opacity-0 translate-x-full pointer-events-none',
        ]}
    >
        <!-- Scrollable Actions -->
        <ul
            class={[
                'menu menu-sm bg-base-200/70 backdrop-blur shadow-lg [&_li>*]:p-1 justify-center items-center',
                position === 'top-right' &&
                    'menu-horizontal rounded-b-box flex-row-reverse space-x-px [&_li]:pb-0',
                position === 'top-left' &&
                    'menu-horizontal rounded-b-box flex-row space-x-px [&_li]:pb-0',
                position === 'left' && 'rounded-r-box pr-1 space-y-px',
                position === 'right' && 'rounded-l-box pl-1 space-y-px',
            ]}
        >
            <!-- --- Close Button --- -->
            {#if showToggle}
                <li>
                    <button
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm flex justify-center items-center',
                        ]}
                        data-tip={m.close_menu()}
                        onclick={toggleOpen}
                        aria-label={m.close_menu()}
                    >
                        <X size={24} />
                    </button>
                </li>
            {/if}

            <!-- --- Standard Actions --- -->

            {#if showSearch}
                <li>
                    <button
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm',
                            viewerState.showSearchPanel &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
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
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm',
                            viewerState.showThumbnailGallery &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
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

            {#if showViewingMode}
                <li>
                    <button
                        class={[...tooltipClasses, 'tooltip-sm']}
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
                        class={[
                            'dropdown menu menu-sm rounded-box bg-base-100 shadow-sm border border-base-200',
                            isTop && 'mt-2 -translate-x-1/2',
                            position === 'left' && 'ms-10',
                            position === 'right' && '-translate-x-full -ms-2',
                        ]}
                        style={`
                            position-anchor: --anchor-viewing-mode;
                        `}
                    >
                        <li>
                            <button
                                class={[
                                    viewerState.viewingMode === 'individuals' &&
                                        'menu-active bg-primary text-primary-content cursor-pointer',
                                ]}
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
                                class={[
                                    viewerState.viewingMode === 'paged' &&
                                        'menu-active bg-primary text-primary-content cursor-pointer',
                                ]}
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
                                class={[
                                    viewerState.viewingMode === 'continuous' &&
                                        'menu-active bg-primary text-primary-content cursor-pointer',
                                ]}
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
                                    class={[
                                        'text-start',
                                        viewerState.pagedOffset === 1 &&
                                            'menu-active bg-primary text-primary-content cursor-pointer',
                                    ]}
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

            {#if showFullscreen}
                <li>
                    <button
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm',
                            viewerState.isFullScreen &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
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
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm',
                            viewerState.showAnnotations &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
                        data-tip={viewerState.showAnnotations
                            ? m.hide_annotations()
                            : m.show_annotations()}
                        aria-label={viewerState.showAnnotations
                            ? m.hide_annotations()
                            : m.show_annotations()}
                        onclick={() => viewerState.toggleAnnotations()}
                    >
                        <ChatCenteredText size={24} />
                    </button>
                </li>
            {/if}

            {#if showInfo}
                <li>
                    <button
                        class={[
                            ...tooltipClasses,
                            'tooltip-sm',
                            viewerState.showMetadataDialog &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
                        data-tip={m.metadata()}
                        aria-label={m.toggle_metadata()}
                        onclick={() => viewerState.toggleMetadataDialog()}
                    >
                        <Info size={24} />
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
                            ...tooltipClasses,
                            'tooltip-sm',
                            button.isActive?.() &&
                                'menu-active bg-primary text-primary-content cursor-pointer',
                        ]}
                        data-tip={tooltipText}
                        aria-label={tooltipText}
                        onclick={() => button.onClick()}
                    >
                        <Icon size={24} />
                    </button>
                </li>
            {/each}
        </ul>
    </div>

    <!-- Toggle Handle (Only visible when closed) -->
    {#if showToggle}
        <button
            class={[
                'pointer-events-auto btn btn-sm shadow-md z-40 w-8 h-8 transition-opacity duration-300 absolute p-0',
                'bg-base-200/70 backdrop-blur border border-base-300 hover:bg-base-300 text-base-content',
                isOpen && 'opacity-0 pointer-events-none',
                !isOpen && 'opacity-100',
                isTop && 'top-1.5',
                (position === 'left' || position === 'top-left') && 'left-1.5',
                (position === 'right' || position === 'top-right') &&
                    'right-1.5',
                ...openButtonTooltipClasses,
                'tooltip-sm',
            ]}
            aria-label={m.open_menu()}
            data-tip={m.open_menu()}
            onclick={toggleOpen}
        >
            <List size={20} />
        </button>
    {/if}
</div>
