<script lang="ts">
    import Icon from './Icon.svelte';
    import { Tooltip } from './ui';
    import { getContext } from 'svelte';
    import type { IconName } from '../generated/icons';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages, language } from '../state/i18n.svelte';
    import { getThumbnailSrc } from '../utils/getThumbnailSrc';
    import {
        getPaintingAnnotations,
        getPaintingBody,
        isChoiceBody,
    } from '../utils/iiifParsing';
    import { getCanvasLabel } from '../utils/canvasLabels';
    import { getCanvasId, getPagedCanvasGroups } from './viewerControls';
    import {
        GALLERY_THUMB_VARS,
        getGalleryThumbFrameHeight,
        getGalleryThumbItemHeight,
        getGalleryThumbItemWidth,
    } from './galleryGeometry';

    // Canvases crossing the viewer boundary are raw IIIF Canvas JSON, v2 or v3
    // as the manifest authored it — `id` in v3, `@id` in v2. The accessor- and
    // `__jsonld`-shaped service/resource/annotation types this block used to
    // declare described the removed library's objects and nothing else.
    type ManifestCanvas =
        | {
              id?: string;
              ['@id']?: string;
          }
        | any;

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const m = getMessages();
    let viewerLocale = $derived(
        (viewerState.config as { locale?: string }).locale || language.current,
    );

    // Config shorthands
    let draggable = $derived(viewerState.config.gallery?.draggable ?? true);

    let { canvases } = $props<{ canvases?: ManifestCanvas[] }>();

    let isResizing = $state(false);
    let resizeStart: { x: number; y: number; w: number; h: number } = {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
    };
    let galleryElement: HTMLElement | null = $state(null);

    // Initialize position and size from config if available (only once on mount)
    $effect(() => {
        if (
            viewerState.config.gallery?.width &&
            viewerState.config.gallery?.height
        ) {
            viewerState.gallerySize = {
                width: viewerState.config.gallery.width,
                height: viewerState.config.gallery.height,
            };
        }
        if (
            viewerState.config.gallery?.x !== undefined &&
            viewerState.config.gallery?.y !== undefined
        ) {
            viewerState.galleryPosition = {
                x: viewerState.config.gallery.x,
                y: viewerState.config.gallery.y,
            };
        }
    });

    // Generate thumbnail data
    let thumbnails = $derived.by(() => {
        if (!canvases || !Array.isArray(canvases))
            return [] as Array<{
                id: string;
                label: string;
                src: string;
                index: number;
                hasChoice: boolean;
            }>;
        return canvases.map((canvas: ManifestCanvas, index: number) => {
            let src = getThumbnailSrc(canvas);
            let hasChoice = false;

            // Check for choices
            try {
                const images = getPaintingAnnotations(canvas);
                if (images && images.length > 0) {
                    const anno = images[0];

                    // The painting body is `body` in v3 and `resource` in v2,
                    // and the Choice inside it is `Choice` in v3 and
                    // `oa:Choice` in v2. Only the v3 half was recognized, so a
                    // v2 Choice canvas never showed the badge.
                    const body = getPaintingBody(anno);

                    if (isChoiceBody(body)) {
                        hasChoice = true;
                    }
                }
            } catch {
                hasChoice = false;
            }

            return {
                id: getCanvasId(canvas) || `canvas-${index}`,
                // Via the shared helper, which reads the raw JSON first. This
                // used to call `canvas.getLabel?.()` directly, and once
                // canvases became raw JSON that accessor vanished — every
                // label in the gallery silently fell back to "Canvas N".
                label: getCanvasLabel(canvas, index, viewerLocale),
                src,
                index,
                hasChoice,
            };
        });
    });

    function onDrag(e: MouseEvent) {
        if (!viewerState.isGalleryDragging) return;

        // Simple fixed positioning logic
        let newX = e.clientX - viewerState.galleryDragOffset.x;
        let newY = e.clientY - viewerState.galleryDragOffset.y;

        // Constrain to Window (Viewport)
        const maxX = Math.max(
            0,
            window.innerWidth - viewerState.gallerySize.width,
        );
        const maxY = Math.max(
            0,
            window.innerHeight - viewerState.gallerySize.height,
        );
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        viewerState.galleryPosition = { x: newX, y: newY };

        // Use the stored center panel rect (captured at drag start, works with shadow DOM)
        const rect = viewerState.galleryCenterPanelRect;
        if (!rect) {
            return;
        }

        const x = e.clientX;
        const y = e.clientY;

        // Threshold for docking detection (pixels)
        const THRESHOLD = 60;

        // Reset
        viewerState.dragOverSide = null;

        // Check boundaries
        if (x >= rect.left && x <= rect.left + THRESHOLD) {
            viewerState.dragOverSide = 'left';
        } else if (x <= rect.right && x >= rect.right - THRESHOLD) {
            viewerState.dragOverSide = 'right';
        } else if (y >= rect.top && y <= rect.top + THRESHOLD) {
            viewerState.dragOverSide = 'top';
        } else if (y <= rect.bottom && y >= rect.bottom - THRESHOLD) {
            viewerState.dragOverSide = 'bottom';
        }
    }

    function stopDrag() {
        // If we were dragging towards a dock zone
        const dropTarget = viewerState.dragOverSide;

        viewerState.isGalleryDragging = false;
        viewerState.dragOverSide = null;
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDrag);

        // Commit drop
        if (dropTarget) {
            viewerState.dockSide = dropTarget;
        }
    }

    function startResize(e: MouseEvent) {
        e.stopPropagation(); // Prevent drag
        isResizing = true;
        resizeStart = {
            x: e.clientX,
            y: e.clientY,
            w: viewerState.gallerySize.width,
            h: viewerState.gallerySize.height,
        };
        window.addEventListener('mousemove', onResize);
        window.addEventListener('mouseup', stopResize);
    }

    function onResize(e: MouseEvent) {
        if (!isResizing) return;
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        viewerState.gallerySize = {
            width: Math.max(200, resizeStart.w + dx),
            height: Math.max(200, resizeStart.h + dy),
        };
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener('mousemove', onResize);
        window.removeEventListener('mouseup', stopResize);
    }

    function selectCanvas(canvasId: string) {
        if (viewerState.viewingMode === 'paged') {
            const pagedGroups = getPagedCanvasGroups(
                canvases || [],
                viewerState.pagedOffset,
            );
            const group = pagedGroups.find((group) =>
                group.entries.some(
                    (entry: { canvasId: string }) =>
                        entry.canvasId === canvasId,
                ),
            );

            if (group?.entries[0]?.canvasId) {
                viewerState.setCanvas(group.entries[0].canvasId);
            }
        } else {
            viewerState.setCanvas(canvasId);
        }

        // The expanded gallery acts as a page picker: choosing a canvas returns
        // you to the image you just chose.
        if (viewerState.galleryExpanded) {
            viewerState.setGalleryExpanded(false);
        }
    }

    // State for docking
    // We default to bottom, but we should sync with viewerState immediately?
    // Actually dockSide *is* viewerState.dockSide essentially.
    // We can just use viewerState.dockSide and provide a local setter?
    // Using a local proxy to sync back and forth:
    let dockSide: 'none' | 'top' | 'bottom' | 'left' | 'right' = $state(
        viewerState.dockSide as 'none' | 'top' | 'bottom' | 'left' | 'right',
    );

    // Sync external changes
    $effect(() => {
        const ds = viewerState.dockSide as string;
        dockSide =
            ds === 'none' ||
            ds === 'top' ||
            ds === 'bottom' ||
            ds === 'left' ||
            ds === 'right'
                ? (ds as 'none' | 'top' | 'bottom' | 'left' | 'right')
                : 'none';
    });

    // Sync internal changes
    $effect(() => {
        if (viewerState.dockSide !== dockSide) {
            viewerState.dockSide = dockSide;
            viewerState.isGalleryDockedBottom = dockSide === 'bottom';
            viewerState.isGalleryDockedRight = dockSide === 'right';
        }
    });

    // Auto-scroll active thumbnail into view
    $effect(() => {
        if (!galleryElement || !viewerState.canvasId) return;
        // Wait for thumbnails to be available - this creates a reactive dependency
        // so the effect re-runs when thumbnails populate after manifest loads
        if (thumbnails.length === 0) return;

        let targetId = viewerState.canvasId;

        if (viewerState.viewingMode === 'paged') {
            const pagedGroups = getPagedCanvasGroups(
                canvases || [],
                viewerState.pagedOffset,
            );
            const group = pagedGroups.find((group) =>
                group.entries.some(
                    (entry: { canvasId: string }) =>
                        entry.canvasId === targetId,
                ),
            );

            if (group) {
                targetId = group.entries[0]?.canvasId || targetId;
            }
        }

        const activeEl = galleryElement.querySelector(
            `[data-id="${CSS.escape(targetId)}"]`,
        );
        if (activeEl) {
            activeEl.scrollIntoView({
                behavior: 'smooth',
                // `nearest` is right for a strip (minimal shuffling) but leaves
                // the active canvas pinned to an edge of a tall grid, so the
                // expanded view centers it instead.
                block: viewerState.galleryExpanded ? 'center' : 'nearest',
                inline: 'center',
            });
        }
    });

    let expanded = $derived(viewerState.galleryExpanded);

    // Switch to horizontal layout if height is small or docked to top/bottom.
    //
    // Expanded always wins: an expanded gallery IS the floating window's grid at
    // viewer size — same cell size, same padding and gap — so it takes the grid
    // branch for the same reason a tall floating window does. Deliberately not a
    // third layout with its own density: the float grid is already the right one,
    // and one fewer knob is one fewer thing to diverge.
    let isHorizontal = $derived(
        !expanded &&
            (dockSide === 'top' ||
                dockSide === 'bottom' ||
                (dockSide === 'none' && viewerState.gallerySize.height < 320)),
    );

    let galleryExtent = $derived(viewerState.galleryExtent);

    /**
     * Which axis a thumbnail is fixed on — the one the gallery's position commits
     * to. A side dock commits to a width; everything else commits to a height.
     *
     * Read from `dockSide` rather than from `isHorizontal`, so it holds while
     * EXPANDED too: an overlay expanded out of a rail keeps the rail's width
     * constraint and so shows a thumbnail at exactly the size the rail did. This
     * is the one sizing decision the expanded view does not take from its own
     * layout. See `galleryGeometry`.
     */
    let constrainWidth = $derived(dockSide === 'left' || dockSide === 'right');

    /**
     * Height of every thumbnail button in the strip. Set explicitly rather than
     * left intrinsic so the row is literally the number the docked band was sized
     * from — the two are computed in separate components and only line up if the
     * strip states the one it was promised.
     */
    let thumbItemHeight = $derived(getGalleryThumbItemHeight(galleryExtent));

    /** Frame height when the constrained axis is the height. */
    let thumbFrameHeight = $derived(getGalleryThumbFrameHeight(galleryExtent));

    /**
     * Width of every thumbnail button in a vertical track. Stated outright rather
     * than left to fill its track, because the expanded overlay's track is far
     * wider than the rail's and a thumbnail has to be the same size in both.
     */
    let thumbItemWidth = $derived(getGalleryThumbItemWidth(galleryExtent));

    let isRTL = $derived(viewerState.viewingDirection === 'right-to-left');

    // The glyph points the way the gallery will travel: away from its dock edge
    // to expand, back toward it to collapse. A floating gallery has no edge to
    // travel from, so it gets maximize/restore instead.
    const EXPAND_CARET = {
        top: 'CaretDown',
        bottom: 'CaretUp',
        left: 'CaretRight',
        right: 'CaretLeft',
    } as const;
    const COLLAPSE_CARET = {
        top: 'CaretUp',
        bottom: 'CaretDown',
        left: 'CaretLeft',
        right: 'CaretRight',
    } as const;
    const OPPOSITE_EDGE = {
        top: 'bottom',
        bottom: 'top',
        left: 'right',
        right: 'left',
    } as const;

    type DockEdge = 'top' | 'bottom' | 'left' | 'right';
    let dockEdge = $derived(
        dockSide === 'none' ? null : (dockSide as DockEdge),
    );

    /**
     * Which of the gallery's own edges carries the caret: always the one facing
     * the canvas, in both states. A bottom-docked gallery's caret sits on its top
     * edge, and expanding carries that same edge (and the caret with it) up to the
     * top of the viewer — the control never jumps to the opposite side under the
     * user's cursor. Only the glyph flips, to keep pointing the way the gallery
     * will travel next.
     *
     * It stays inside the gallery's bounds rather than protruding as a tab,
     * because the canvas side of a bottom-docked strip is where the canvas nav
     * lives.
     */
    let caretEdge = $derived(
        dockEdge === null ? null : OPPOSITE_EDGE[dockEdge],
    );

    let toggleIcon = $derived<IconName>(
        dockEdge === null
            ? expanded
                ? 'CornersIn'
                : 'CornersOut'
            : expanded
              ? COLLAPSE_CARET[dockEdge]
              : EXPAND_CARET[dockEdge],
    );

    let toggleLabel = $derived(
        expanded ? m.collapse_gallery() : m.expand_gallery(),
    );

    /**
     * Which side of the tab its tooltip bubble opens on. Collapsed, that is
     * outward, over the canvas — empty space, and it leaves the thumbnails
     * readable. Expanded, the gallery IS the whole column, so outward would push
     * the bubble past the viewer edge; it opens inward over the grid instead.
     * The floating window's inline button has no edge, so its bubble goes left,
     * away from the window's own corner.
     */
    let tooltipPlacement = $derived<'top' | 'bottom' | 'left' | 'right'>(
        dockEdge === null
            ? 'left'
            : expanded
              ? dockEdge
              : OPPOSITE_EDGE[dockEdge],
    );

    // The header hosts the drag grip, which is meaningless for an expanded
    // overlay — so it survives expansion only for a floating gallery, where it
    // is the sole home for the maximize/restore button.
    let showHeader = $derived(dockSide === 'none' || (!expanded && draggable));

    function toggleExpanded() {
        viewerState.toggleGalleryExpanded();
    }

    // Escape collapses the expanded gallery — the standard exit for anything
    // that takes over the viewer.
    $effect(() => {
        if (!expanded) return;
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                viewerState.setGalleryExpanded(false);
            }
        };
        window.addEventListener('keydown', onKeydown);
        return () => window.removeEventListener('keydown', onKeydown);
    });

    function startDrag(e: MouseEvent) {
        if (!draggable) return; // Dragging disabled in config
        if ((e.target as HTMLElement).closest('.resize-handle')) return; // Don't drag if resizing

        const wasDocked = dockSide !== 'none';

        // Calculate position and offset first (no state changes yet)
        if (wasDocked) {
            // Center on mouse logic is still good for UX
            let centeredX = Math.max(0, e.clientX - 150);
            let centeredY = Math.max(0, e.clientY - 20);

            // Constrain initial position so it doesn't jump off-screen if undocking near edges
            const maxInitialX = Math.max(0, window.innerWidth - 300);
            const maxInitialY = Math.max(0, window.innerHeight - 400);

            centeredX = Math.min(centeredX, maxInitialX);
            centeredY = Math.min(centeredY, maxInitialY);

            viewerState.galleryPosition = { x: centeredX, y: centeredY };
            viewerState.galleryDragOffset = {
                x: e.clientX - centeredX,
                y: e.clientY - centeredY,
            };
        } else {
            // Already floating
            viewerState.galleryDragOffset = {
                x: e.clientX - viewerState.galleryPosition.x,
                y: e.clientY - viewerState.galleryPosition.y,
            };
        }

        // CRITICAL: Capture center panel rect BEFORE undocking
        // Use getRootNode() to work inside shadow DOM
        const root = galleryElement?.getRootNode() as Document | ShadowRoot;
        const centerPanel =
            root?.getElementById?.('triiiceratops-center-panel') ??
            document.getElementById('triiiceratops-center-panel');
        if (centerPanel) {
            viewerState.galleryCenterPanelRect =
                centerPanel.getBoundingClientRect();
        }

        // CRITICAL: Set dragging state and attach listeners BEFORE changing dockSide
        // This ensures listeners persist even if component unmounts
        viewerState.isGalleryDragging = true;
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);

        // NOW undock - this may cause component remount, but listeners are already attached
        if (wasDocked) {
            dockSide = 'none';
        }
    }

    const groupedThumbnails = $derived.by(() => {
        const groups: Array<{
            id: string;
            labels: string[];
            srcs: string[];
            index: number;
            hasChoice: boolean;
        }> = [];
        const thumbs = thumbnails;
        const pagedGroups = getPagedCanvasGroups(
            canvases || [],
            viewerState.pagedOffset,
        );

        for (const pagedGroup of pagedGroups) {
            const i = pagedGroup.startIndex;
            const first = thumbs[i];

            if (!first) {
                continue;
            }

            const second =
                pagedGroup.endIndex > pagedGroup.startIndex
                    ? thumbs[i + 1]
                    : null;
            const groupId = first.id;
            const groupLabels = [first.label];
            const groupSrcs = [first.src];
            if (second) {
                groupLabels.push(second.label);
                groupSrcs.push(second.src);
            }
            const groupHasChoice =
                first.hasChoice || (second ? second.hasChoice : false);

            groups.push({
                id: groupId,
                labels: groupLabels,
                srcs: groupSrcs,
                index: i,
                hasChoice: groupHasChoice,
            });
        }
        return groups;
    });
</script>

{#if viewerState.showThumbnailGallery}
    <!-- Floating Window -->
    <div
        bind:this={galleryElement}
        class={[
            'gallery-root',
            expanded && 'expanded',
            !expanded && dockSide !== 'none' && 'docked',
            !expanded && dockSide === 'none' && 'floating',
            !expanded &&
                (dockSide === 'bottom' || dockSide === 'top') &&
                'dock-horizontal',
            !expanded &&
                (dockSide === 'left' || dockSide === 'right') &&
                'dock-vertical',
            // Spelled out rather than interpolated: Svelte prunes CSS it cannot
            // statically match, and `caret-${caretEdge}` is invisible to it.
            caretEdge === 'top' && 'caret-top',
            caretEdge === 'bottom' && 'caret-bottom',
            caretEdge === 'left' && 'caret-left',
            caretEdge === 'right' && 'caret-right',
            viewerState.isGalleryDragging && 'dragging',
            // Which axis a thumbnail is fixed on. Not tied to `dock-vertical`,
            // because it has to survive expanding: see `constrainWidth`.
            constrainWidth && 'constrain-width',
        ]}
        style="{GALLERY_THUMB_VARS}; --ui-thumb-h: {thumbFrameHeight}px;
        --ui-thumb-item-w: {thumbItemWidth}px; {expanded || dockSide !== 'none'
            ? ''
            : `left: ${viewerState.galleryPosition.x}px; top: ${viewerState.galleryPosition.y}px; width: ${viewerState.gallerySize.width}px; height: ${viewerState.gallerySize.height}px;`}"
    >
        <!-- Header Area (drag grip when draggable/floating; also the floating
             gallery's home for the maximize/restore button) -->
        {#if showHeader}
            <div
                class={[
                    'gallery-header',
                    !expanded &&
                        (dockSide === 'bottom' || dockSide === 'top') &&
                        'header-horizontal',
                    (expanded ||
                        (dockSide !== 'bottom' && dockSide !== 'top')) &&
                        'header-vertical',
                ]}
            >
                <!-- Drag Handle (an expanded overlay has nowhere to be dragged to) -->
                {#if !expanded}
                    <div
                        class={[
                            'drag-handle',
                            (dockSide === 'bottom' || dockSide === 'top') &&
                                'handle-horizontal',
                            dockSide !== 'bottom' &&
                                dockSide !== 'top' &&
                                'handle-vertical',
                        ]}
                        onmousedown={startDrag}
                        role="button"
                        tabindex="0"
                        aria-label="Drag Gallery"
                    >
                        <div
                            class={[
                                'drag-grip',
                                (dockSide === 'bottom' || dockSide === 'top') &&
                                    'grip-horizontal',
                                dockSide !== 'bottom' &&
                                    dockSide !== 'top' &&
                                    'grip-vertical',
                            ]}
                        ></div>
                    </div>
                {/if}

                {#if dockSide === 'none'}
                    <Tooltip
                        tip={toggleLabel}
                        placement={tooltipPlacement}
                        class="toggle-anchor toggle-anchor-inline"
                    >
                        <button
                            class="expand-toggle toggle-inline"
                            onclick={toggleExpanded}
                            aria-label={toggleLabel}
                            aria-expanded={expanded}
                        >
                            <Icon name={toggleIcon} size={14} />
                        </button>
                    </Tooltip>
                {/if}
            </div>
        {/if}

        <!-- Expand/collapse caret, centered on the canvas-facing edge (docked only) -->
        {#if caretEdge}
            <Tooltip
                tip={toggleLabel}
                placement={tooltipPlacement}
                class="toggle-anchor toggle-anchor-edge"
            >
                <button
                    class="expand-toggle toggle-edge"
                    onclick={toggleExpanded}
                    aria-label={toggleLabel}
                    aria-expanded={expanded}
                >
                    <Icon name={toggleIcon} size={12} />
                </button>
            </Tooltip>
        {/if}

        <!-- Content (Grid or Horizontal Scroll) -->
        <div
            class={[
                'gallery-content',
                isHorizontal && 'content-horizontal',
                !isHorizontal && 'content-vertical',
            ]}
        >
            <div
                class={[
                    'gallery-track',
                    isHorizontal && 'track-horizontal',
                    !isHorizontal && 'track-vertical',
                ]}
            >
                {#if viewerState.viewingMode === 'paged'}
                    <!-- grouped thumbnail display -->
                    {#each groupedThumbnails as thumbGroup (thumbGroup.id)}
                        {@const isGroupSelected = (() => {
                            const idx = thumbGroup.index;
                            const first = thumbnails[idx];
                            const second =
                                thumbGroup.srcs.length > 1
                                    ? thumbnails[idx + 1]
                                    : null;
                            return (
                                viewerState.canvasId === first?.id ||
                                (second && viewerState.canvasId === second.id)
                            );
                        })()}
                        <button
                            class={[
                                'thumb-item',
                                isGroupSelected && 'selected',
                            ]}
                            style="{isHorizontal
                                ? `height: ${thumbItemHeight}px;`
                                : ''}{isGroupSelected
                                ? 'outline: 2px solid var(--tri-color-primary); outline-offset: -2px;'
                                : ''}"
                            onclick={() => selectCanvas(thumbGroup.id)}
                            data-id={thumbGroup.id}
                            aria-label="Select canvas {thumbGroup.labels.join(
                                ' / ',
                            )}"
                        >
                            <div
                                class={[
                                    'thumb-frame',
                                    isRTL && 'frame-rtl',
                                    thumbGroup.srcs.length > 1 && 'frame-paged',
                                ]}
                            >
                                <div class="thumb-pane">
                                    {#if thumbGroup.srcs[0]}
                                        <img
                                            src={thumbGroup.srcs[0]}
                                            alt={thumbGroup.labels[0]}
                                            class="thumb-img"
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    {:else}
                                        <span class="thumb-placeholder">?</span>
                                    {/if}
                                </div>
                                {#if thumbGroup.srcs.length > 1}
                                    <div class="thumb-pane">
                                        {#if thumbGroup.srcs[1]}
                                            <img
                                                src={thumbGroup.srcs[1]}
                                                alt={thumbGroup.labels[1]}
                                                class="thumb-img"
                                                loading="lazy"
                                                draggable="false"
                                            />
                                        {:else}
                                            <span class="thumb-placeholder"
                                                >?</span
                                            >
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <div
                                class="thumb-label"
                                title="{thumbGroup.index + 1}. {thumbGroup
                                    .labels[0]}{thumbGroup.labels.length > 1
                                    ? ` / ${thumbGroup.index + 2}. ${thumbGroup.labels[1]}`
                                    : ''}"
                            >
                                <div
                                    class={[
                                        'label-stack',
                                        thumbGroup.labels.length > 1 &&
                                            'label-overlay',
                                    ]}
                                >
                                    <div class="label-line">
                                        <span class="label-num"
                                            >{thumbGroup.index + 1}.</span
                                        >{thumbGroup
                                            .labels[0]}{#if thumbGroup.hasChoice && thumbGroup.labels.length === 1}<span
                                                class="choice-badge"
                                                title="Has choices/layers"
                                                ><Icon
                                                    name="Stack"
                                                    size={12}
                                                    class="choice-icon"
                                                /></span
                                            >{/if}
                                    </div>
                                    {#if thumbGroup.labels.length > 1}
                                        <div class="label-line">
                                            <span class="label-num"
                                                >{thumbGroup.index + 2}.</span
                                            >{thumbGroup
                                                .labels[1]}{#if thumbGroup.hasChoice}<span
                                                    class="choice-badge"
                                                    title="Has choices/layers"
                                                    ><Icon
                                                        name="Stack"
                                                        size={12}
                                                        class="choice-icon"
                                                    /></span
                                                >{/if}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </button>
                    {/each}
                {:else}
                    {#each thumbnails as thumb (thumb.id)}
                        <button
                            class={[
                                'thumb-item',
                                viewerState.canvasId === thumb.id && 'selected',
                            ]}
                            style="{isHorizontal
                                ? `height: ${thumbItemHeight}px;`
                                : ''}{viewerState.canvasId === thumb.id
                                ? 'outline: 2px solid var(--tri-color-primary); outline-offset: -2px;'
                                : ''}"
                            onclick={() => selectCanvas(thumb.id)}
                            data-id={thumb.id}
                            aria-label="Select canvas {thumb.label}"
                        >
                            <div class="thumb-frame">
                                <div class="thumb-pane">
                                    {#if thumb.src}
                                        <img
                                            src={thumb.src}
                                            alt={thumb.label}
                                            class="thumb-img"
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    {:else}
                                        <span class="thumb-placeholder">?</span>
                                    {/if}
                                </div>
                            </div>
                            <div
                                class="thumb-label"
                                title="{thumb.index + 1}. {thumb.label}"
                            >
                                <div class="label-stack">
                                    <div class="label-line">
                                        <span class="label-num"
                                            >{thumb.index + 1}.</span
                                        >{thumb.label}{#if thumb.hasChoice}<span
                                                class="choice-badge"
                                                title="Has choices/layers"
                                                ><Icon
                                                    name="Stack"
                                                    size={12}
                                                    class="choice-icon"
                                                /></span
                                            >{/if}
                                    </div>
                                </div>
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Resize Handle -->
        {#if dockSide === 'none' && !expanded}
            <div
                class="resize-handle"
                style="clip-path: polygon(100% 0, 0 100%, 100% 100%);"
                onmousedown={startResize}
                role="button"
                tabindex="0"
                aria-label="Resize"
            ></div>
        {/if}
    </div>

    {#if viewerState.isGalleryDragging}
        <!-- Drop Zones -->
        <!-- Top -->
        <div
            class={[
                'drop-zone drop-top',
                viewerState.dragOverSide === 'top' && 'drop-active',
                viewerState.dragOverSide !== 'top' && 'drop-idle',
            ]}
            role="group"
        >
            <span class="drop-label">Dock Top</span>
        </div>

        <!-- Bottom -->
        <div
            class={[
                'drop-zone drop-bottom',
                viewerState.dragOverSide === 'bottom' && 'drop-active',
                viewerState.dragOverSide !== 'bottom' && 'drop-idle',
            ]}
            role="group"
        >
            <span class="drop-label">Dock Bottom</span>
        </div>

        <!-- Left -->
        <div
            class={[
                'drop-zone drop-left',
                viewerState.dragOverSide === 'left' && 'drop-active',
                viewerState.dragOverSide !== 'left' && 'drop-idle',
            ]}
            role="group"
        >
            <span
                class="drop-label drop-label-vertical"
                style="writing-mode: vertical-rl;">Dock Left</span
            >
        </div>

        <!-- Right -->
        <div
            class={[
                'drop-zone drop-right',
                viewerState.dragOverSide === 'right' && 'drop-active',
                viewerState.dragOverSide !== 'right' && 'drop-idle',
            ]}
            role="group"
        >
            <span
                class="drop-label drop-label-vertical"
                style="writing-mode: vertical-rl;">Dock Right</span
            >
        </div>
    {/if}
{/if}

<style>
    /* ===== Root floating / docked window ===== */
    .gallery-root {
        display: flex;
        user-select: none;
        background-color: var(--tri-gallery-bg);
        color: var(--tri-gallery-content);
        /* The expanded overlay's caret gutter is root padding, and every sizing
           rule here (100% when docked, an explicit pixel size when floating) means
           the gallery's OUTER box. */
        box-sizing: border-box;
    }
    .gallery-root.docked {
        position: relative;
        z-index: 50;
        width: 100%;
        height: 100%;
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
        border-color: var(--tri-surface-border);
        /* Named rather than `all`: `all` animated the root's padding too, which
           opened from zero on every dock change and shifted the whole strip while
           the transition caught up. Only the colours and shadow were ever meant to
           move. */
        transition-property: background-color, border-color, box-shadow;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    .gallery-root.floating {
        position: fixed;
        z-index: 900;
        flex-direction: column;
        overflow: hidden;
        border-width: 1px;
        border-style: solid;
        border-color: var(--tri-surface-border);
        box-shadow: 0 25px 50px -12px #00000040;
    }
    .gallery-root.dock-horizontal {
        flex-direction: row;
        border-top-width: 1px;
        border-top-style: solid;
    }
    .gallery-root.dock-vertical {
        flex-direction: column;
        border-left-width: 1px;
        border-left-style: solid;
        border-right-width: 1px;
        border-right-style: solid;
    }
    .gallery-root.dragging {
        pointer-events: none;
        opacity: 0.8;
    }
    /* Expanded: the parent host (.gallery-expanded in TriiiceratopsViewer) owns
       the inset-0 positioning, exactly as the docked bands own the strip's size —
       the gallery just fills what it is given.

       Structurally identical to `.floating` apart from the positioning the host
       owns — same column flow, same clipped overflow — so the expanded gallery is
       literally the floating window's grid at viewer size. It sets no padding,
       gap, or cell size of its own: those stay on the shared `.gallery-content` /
       `.gallery-track` rules, which is what keeps the two views from drifting. */
    .gallery-root.expanded {
        position: relative;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    /* ===== Header / drag handle ===== */
    .gallery-header {
        display: flex;
        flex-shrink: 0;
        position: relative;
        user-select: none;
        background-color: var(--tri-gallery-bg);
    }
    .gallery-header.header-horizontal {
        flex-direction: row;
        height: 100%;
        align-items: center;
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--tri-surface-border);
    }
    .gallery-header.header-vertical {
        flex-direction: column;
        width: 100%;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
    }

    .drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: move;
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }
    .drag-handle:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-surface-border) 50%,
            transparent
        );
    }
    .drag-handle:active {
        background-color: var(--tri-surface-border);
    }
    .drag-handle.handle-horizontal {
        width: 2rem;
        height: 100%;
    }
    .drag-handle.handle-vertical {
        height: 1.5rem;
        width: 100%;
    }

    .drag-grip {
        background-color: var(--tri-surface-border);
        border-radius: calc(infinity * 1px);
    }
    .drag-grip.grip-horizontal {
        width: 0.375rem;
        height: 3rem;
    }
    .drag-grip.grip-vertical {
        width: 3rem;
        height: 0.375rem;
    }

    /* ===== Expand / collapse control =====
       `toggle-edge` is a small tab centred on whichever gallery edge faces the
       canvas (see `caretEdge`) — in a gutter of its own when expanded, over the
       middle thumbnail when docked (see the padding rules below).

       It is chrome, not gallery content, so it borrows the toolbar's button look
       verbatim — translucent toolbar fill over a blur, a hairline border, and the
       same `--tri-surface-border` hover. That treatment is what makes it read as a
       control rather than a stray mark, and it is doubly load-bearing docked, where
       what sits behind the tab is a thumbnail rather than the gallery's own fill.

       Each button is wrapped in a `<Tooltip>`, and the WRAPPER is what gets
       positioned — the tooltip's bubble is a pseudo-element of that span, so it
       has to be the thing pinned to the edge. Hence `.toggle-anchor` carries the
       absolute positioning and the size, and the button just fills it. Those
       rules need `:global()` because a class handed to a child component is
       outside this component's scoping. */
    .gallery-root :global(.toggle-anchor) {
        position: absolute;
        display: block;
        z-index: 60;
    }
    .expand-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 0;
        cursor: pointer;
        color: var(--tri-toolbar-content);
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
        border-width: var(--tri-border);
        border-style: solid;
        border-color: var(--tri-surface-border);
        box-shadow: var(--ui-chrome-shadow, none);
        transition-property: color, background-color, border-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }
    .expand-toggle:hover,
    .expand-toggle:focus-visible {
        background-color: var(--tri-surface-border);
    }

    /* Only the EXPANDED overlay reserves the tab a gutter of its own, as root
       padding — never on `.gallery-content`, because padding on a scroll box
       scrolls away with its content and rows would pass back underneath the tab.
       The overlay is the whole viewer, so 24px of edge costs it nothing anyone
       notices.

       A DOCKED gallery reserves nothing: a strip is barely thicker than one
       thumbnail, so a 24px gutter there both fattened the band and pushed its
       thumbnails off-centre — the tab overlays the middle thumbnail instead
       (`z-index: 60` on `.toggle-anchor` puts it above the track), which leaves
       equal padding on either side of the row. `gallery.size` is spent entirely on
       the track and the thumbnail, with nothing set aside for the tab.

       `--ui-caret-tab` comes from `galleryGeometry` — the value is never restated
       here. */
    .gallery-root.expanded.caret-top {
        padding-top: var(--ui-caret-tab);
    }
    .gallery-root.expanded.caret-bottom {
        padding-bottom: var(--ui-caret-tab);
    }
    .gallery-root.expanded.caret-left {
        padding-left: var(--ui-caret-tab);
    }
    .gallery-root.expanded.caret-right {
        padding-right: var(--ui-caret-tab);
    }

    /* Narrow on its long axis, so it reads as a handle on the edge rather than a
       bar across it. Its short axis is the tab width above. */
    .caret-top > :global(.toggle-anchor),
    .caret-bottom > :global(.toggle-anchor) {
        width: 1.75rem;
        height: var(--ui-caret-tab);
    }
    .caret-left > :global(.toggle-anchor),
    .caret-right > :global(.toggle-anchor) {
        width: var(--ui-caret-tab);
        height: 1.75rem;
    }
    /* Flush against the canvas-facing edge, in the same idiom as the toolbar's
       open handle: the border touching that edge is dropped and those corners are
       square, so the tab reads as part of the edge rather than a chip floating
       beside it. Only the two inboard corners round, into the gallery.

       That rounding is `--tri-radius-buttons`, the same token every other button
       in the viewer takes its corners from — a theme that squares its buttons
       squares this tab too, and one that rounds them rounds it. */
    .caret-top > :global(.toggle-anchor) {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
    }
    .caret-top .toggle-edge {
        border-top-width: 0;
        border-radius: 0 0 var(--tri-radius-buttons) var(--tri-radius-buttons);
    }
    .caret-bottom > :global(.toggle-anchor) {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
    }
    .caret-bottom .toggle-edge {
        border-bottom-width: 0;
        border-radius: var(--tri-radius-buttons) var(--tri-radius-buttons) 0 0;
    }
    .caret-left > :global(.toggle-anchor) {
        left: 0;
        top: 50%;
        transform: translateY(-50%);
    }
    .caret-left .toggle-edge {
        border-left-width: 0;
        border-radius: 0 var(--tri-radius-buttons) var(--tri-radius-buttons) 0;
    }
    .caret-right > :global(.toggle-anchor) {
        right: 0;
        top: 50%;
        transform: translateY(-50%);
    }
    .caret-right .toggle-edge {
        border-right-width: 0;
        border-radius: var(--tri-radius-buttons) 0 0 var(--tri-radius-buttons);
    }

    /* An absolutely positioned child is offset from the padding box, so `right: 0`
       above lands the tab just INSIDE the docked gallery's own border, leaving a
       hairline of gallery between the tab and the edge the user sees. Pull it out
       by that border width so the tab sits ON the edge line and touches it.

       Applied only where a border actually exists to sit on — the strip's top
       (`.dock-horizontal`) and both of the rail's sides (`.dock-vertical`).
       Anywhere else the tab is already flush with the edge, and a negative offset
       would just overhang it: a top-docked strip carries no bottom border, and the
       expanded overlay has none at all (and clips its own overflow, so the offset
       would shave a pixel off the tab). */
    .gallery-root.dock-horizontal.caret-top > :global(.toggle-anchor) {
        top: calc(-1 * var(--tri-border));
    }
    .gallery-root.dock-vertical.caret-left > :global(.toggle-anchor) {
        left: calc(-1 * var(--tri-border));
    }
    .gallery-root.dock-vertical.caret-right > :global(.toggle-anchor) {
        right: calc(-1 * var(--tri-border));
    }

    /* The floating window has no dock edge, so its maximize/restore button lives
       in the header's top corner instead. */
    .gallery-root :global(.toggle-anchor-inline) {
        top: 0.125rem;
        right: 0.25rem;
        width: 1.25rem;
        height: 1.25rem;
    }
    .toggle-inline {
        border-radius: var(--tri-radius-buttons);
    }

    /* ===== Content scroll area ===== */
    .gallery-content {
        flex: 1 1 0%;
        padding: var(--ui-gallery-pad, 0.25rem);
        background-color: var(--tri-gallery-bg);
    }
    .gallery-content.content-horizontal {
        overflow-x: auto;
        overflow-y: hidden;
        height: 100%;
    }
    .gallery-content.content-vertical {
        overflow-y: auto;
        overflow-x: hidden;
    }
    /* The rail is exactly one thumbnail wide, so on the platforms that give a
       scrollbar real width it comes out of the thumbnail. Ask for the thin one to
       keep that as small as possible. */
    .dock-vertical .gallery-content {
        scrollbar-width: thin;
    }

    .gallery-track.track-horizontal {
        display: flex;
        flex-direction: row;
        gap: var(--ui-gallery-gap, 0.5rem);
        height: 100%;
        align-items: center;
    }
    /* Every other view is that same row, wrapped. Deliberately NOT a fixed-width
       grid: a grid has to reserve its cell for the widest thumbnail it might hold,
       which leaves a portrait page — most pages — sitting in a wide box of empty
       space, and a paged pair in twice that. Wrapping means an item is exactly as
       wide as the thumbnail in it, so a thumbnail looks the same here as it does in
       the strip. The cost is a ragged last row instead of aligned columns. */
    .gallery-track.track-vertical {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--ui-gallery-gap, 0.5rem);
        justify-content: center;
        align-content: flex-start;
        /* Each item keeps its own height rather than being stretched to the
           tallest in its row. Width-constrained, a row mixes a portrait page with
           a landscape one, and stretching leaves the short one's label stranded at
           the bottom of a box of empty space instead of under its image. */
        align-items: flex-start;
    }

    /* ===== Thumbnail item (button) =====
       One rule set for every view: the strip and the grid differ only in how they
       are laid OUT (a flex row vs. fixed-width grid cells), never in what a
       thumbnail is. The paddings come from `galleryGeometry`, which is also what
       the docked band and rail are measured from. */
    .thumb-item {
        display: flex;
        flex-direction: column;
        gap: var(--ui-thumb-gap);
        padding: var(--ui-thumb-pad);
        border-radius: 0.25rem;
        text-align: left;
        position: relative;
        flex-shrink: 0;
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }
    .thumb-item:hover {
        background-color: var(--tri-surface-border);
    }
    /* Width-constrained: every thumbnail button is exactly the width its gallery
       committed to (`getGalleryThumbItemWidth`). Stated in pixels rather than as
       `100%` because the expanded overlay's track is far wider than the rail's, and
       a percentage would let a thumbnail there grow past the size the rail shows the
       same canvas at. */
    .constrain-width .thumb-item {
        width: var(--ui-thumb-item-w);
    }
    .thumb-item.selected {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 5%,
            transparent
        );
    }

    /* ===== Thumbnail frame (image container) =====
       Fixed on the axis the gallery committed to and free on the other, so a canvas
       renders at its own shape rather than being letterboxed into a slot: the frame
       is `--ui-thumb-h` tall and as wide as the image is at that height, or as wide
       as `--ui-thumb-item-w` leaves it and as tall as the image is at that width.
       Both come from `galleryGeometry`; which one applies is `.constrain-width`.

       Nothing here crops. `overflow: hidden` is for the label overlay riding up over
       the frame's bottom edge and for the border radius, not for the image. */
    .thumb-frame {
        height: var(--ui-thumb-h);
        background-color: var(--tri-surface-border);
        border-radius: 0.25rem;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: var(--ui-thumb-pane-gap);
        width: auto;
    }
    .thumb-frame.frame-rtl {
        flex-direction: row-reverse;
    }
    /* The button already carries the committed width, so the frame just fills it and
       lets its height follow the image. A paged pair needs no special case: its two
       panes split that width between them and the pair comes out shorter than a
       single page rather than cropped in half. */
    .constrain-width .thumb-frame {
        width: 100%;
        height: auto;
    }

    /* ===== Pane (single image slot inside a frame) ===== */
    .thumb-pane {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        height: 100%;
        width: auto;
    }
    /* `flex: 1` rather than a computed half-width: one pane takes the frame, two
       panes split it, and the gap between them is subtracted by flex itself.
       `min-width: 0` because a flex item will not shrink below its content
       otherwise, and the content here is an image that wants its natural width. */
    .constrain-width .thumb-pane {
        flex: 1 1 0;
        min-width: 0;
        height: auto;
    }

    /* ===== Thumbnail image =====
       Fills the frame on the constrained axis and takes its natural size on the
       other. `object-fit: contain` never has anything to do once loaded — the box it
       is given already has the image's own ratio — but it keeps a mid-load or
       mis-sized image whole instead of stretched.

       `aspect-ratio: auto <floor>` is the fallback shape for an image with nothing
       to measure yet, and it is load-bearing rather than cosmetic: with one axis
       `auto` and no natural ratio, that axis computes to ZERO, a zero-area box never
       intersects the viewport, and so Chrome never loads a lazy image — leaving it
       permanently sizeless. The fallback breaks that deadlock on whichever axis is
       the free one, and incidentally keeps a track of loading thumbnails at roughly
       its final shape instead of popping open row by row. `auto` first means a loaded
       image's own ratio wins, so this shapes nothing that has a shape of its own. */
    .thumb-img,
    .thumb-placeholder {
        aspect-ratio: auto var(--ui-thumb-floor-aspect);
    }
    .thumb-img {
        object-fit: contain;
        height: 100%;
        width: auto;
    }
    .constrain-width .thumb-img {
        width: 100%;
        height: auto;
    }

    .thumb-placeholder {
        opacity: 0.2;
        text-align: center;
        font-size: 2.25rem;
        line-height: 2.5rem;
        height: 100%;
        width: auto;
    }
    .constrain-width .thumb-placeholder {
        width: 100%;
        height: auto;
    }

    /* ===== Thumbnail label =====
       The row reserves exactly ONE line's height in every view and viewing mode —
       that uniformity is what lets the docked band hold a single row whatever the
       viewing mode, since `gallery.size` fixes the band's height up front.

       The lines themselves are stacked upward from that row's bottom edge, so a
       paged pair's second canvas gets a line without asking for more room: it
       rides up over the bottom of the frame instead. `align-self` keeps the row
       full-width under a centred frame, and the absolute stack means the label
       never contributes to the item's own width — the frame alone decides that. */
    .thumb-label {
        font-size: 0.75rem;
        line-height: var(--ui-thumb-label-line);
        font-weight: 500;
        opacity: 0.7;
        position: relative;
        align-self: stretch;
        height: var(--ui-thumb-label-line);
    }
    .thumb-item:hover .thumb-label {
        opacity: 1;
    }
    .label-stack {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
    }
    /* Only a stack that outgrows its row overlaps the frame, and only that one
       needs to stay legible against an image. Borrows the expand tab's treatment
       — translucent toolbar fill over a blur — so the two read as the same chrome
       rather than two different ideas about overlaying a thumbnail. */
    .label-stack.label-overlay {
        padding: 0 0.125rem;
        border-radius: 0.25rem;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
    }
    .label-line {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .label-num {
        font-weight: 700;
        margin-right: 0.25rem;
    }

    .choice-badge {
        margin-left: 0.25rem;
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
    }
    .choice-badge :global(.choice-icon) {
        opacity: 0.7;
    }

    /* ===== Resize handle ===== */
    .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 1.5rem;
        height: 1.5rem;
        cursor: se-resize;
        z-index: 50;
        background-color: var(--tri-color-primary);
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }
    .resize-handle:hover {
        background-color: var(--tri-color-primary);
    }

    /* ===== Drop zones ===== */
    .drop-zone {
        position: absolute;
        z-index: 999;
        border-radius: 0.75rem;
        border-width: 4px;
        border-style: dashed;
        border-color: color-mix(
            in oklab,
            var(--tri-color-primary) 40%,
            transparent
        );
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    .drop-zone.drop-right {
        transition-duration: 0.3s;
    }
    .drop-top {
        top: 0.5rem;
        left: 0.5rem;
        right: 0.5rem;
        height: 4rem;
    }
    .drop-bottom {
        bottom: 0.5rem;
        left: 0.5rem;
        right: 0.5rem;
        height: 4rem;
    }
    .drop-left {
        top: 0.5rem;
        bottom: 0.5rem;
        left: 0.5rem;
        width: 4rem;
    }
    .drop-right {
        top: 0.5rem;
        bottom: 0.5rem;
        right: 0.5rem;
        width: 4rem;
    }
    .drop-zone.drop-active {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 20%,
            transparent
        );
        transform: scale(1.05);
    }
    .drop-zone.drop-idle {
        background-color: color-mix(
            in oklab,
            var(--tri-gallery-bg) 50%,
            transparent
        );
    }

    .drop-label {
        font-weight: 700;
        color: var(--tri-color-primary-text);
        opacity: 0.5;
    }
    .drop-label-vertical {
        transform: rotate(180deg);
    }
</style>
