<script lang="ts">
    import Icon from './Icon.svelte';
    import { getContext } from 'svelte';
    import type { IconName } from '../generated/icons';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { getMessages, language } from '../state/i18n.svelte';
    import { getThumbnailSrc } from '../utils/getThumbnailSrc';
    import { resolveLanguageValue } from '../utils/languageMap';
    import { getCanvasId, getPagedCanvasGroups } from './viewerControls';

    // Minimal canvas/annotation types covering methods used here
    type ManifestService = {
        id?: string;
        ['@id']?: string;
        profile?: unknown;
        getProfile?: () => unknown;
    };

    type ManifestResource =
        | {
              id?: string;
              ['@id']?: string;
              __jsonld?: any;
              getServices?: () => ManifestService[];
          }
        | any;

    type ManifestAnnotation =
        | {
              __jsonld?: any;
              getResource?: () => ManifestResource | null;
              getBody?: () => ManifestResource | ManifestResource[] | null;
              body?: ManifestResource | ManifestResource[];
          }
        | any;

    type ManifestCanvas =
        | {
              id: string;
              getLabel: () => { value: string }[];
              getThumbnail?: () =>
                  | string
                  | { id?: string; ['@id']?: string }
                  | null;
              getImages?: () => ManifestAnnotation[];
              getContent?: () => ManifestAnnotation[];
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
                let images = canvas.getImages?.() || [];
                if ((!images || !images.length) && canvas.getContent) {
                    images = canvas.getContent();
                }
                if (images && images.length > 0) {
                    const anno = images[0];
                    const body = anno.getBody
                        ? anno.getBody()
                        : anno.body || anno.resource;

                    const rawBody = anno.__jsonld?.body || anno.body;
                    // isChoice check - check rawBody and body itself
                    const isChoice =
                        rawBody?.type === 'Choice' ||
                        rawBody?.type === 'oa:Choice' ||
                        (body &&
                            !Array.isArray(body) &&
                            (body.type === 'Choice' ||
                                body.type === 'oa:Choice'));

                    if (isChoice) {
                        hasChoice = true;
                    }
                }
            } catch {
                hasChoice = false;
            }

            return {
                id: getCanvasId(canvas) || `canvas-${index}`,
                label:
                    resolveLanguageValue(canvas.getLabel?.(), viewerLocale) ||
                    `Canvas ${index + 1}`,
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
    // viewer size — same `fixedHeight` cell floor, same padding and gap — so it
    // takes the grid branch for the same reason a tall floating window does.
    // Deliberately not a third layout with its own density: the float grid is
    // already the right one, and one fewer knob is one fewer thing to diverge.
    let isHorizontal = $derived(
        !expanded &&
            (dockSide === 'top' ||
                dockSide === 'bottom' ||
                (dockSide === 'none' && viewerState.gallerySize.height < 320)),
    );

    let fixedHeight = $derived(viewerState.galleryFixedHeight);
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
        ]}
        style={expanded || dockSide !== 'none'
            ? ''
            : `left: ${viewerState.galleryPosition.x}px; top: ${viewerState.galleryPosition.y}px; width: ${viewerState.gallerySize.width}px; height: ${viewerState.gallerySize.height}px;`}
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
                    <button
                        class="expand-toggle toggle-inline"
                        onclick={toggleExpanded}
                        aria-label={toggleLabel}
                        aria-expanded={expanded}
                        title={toggleLabel}
                    >
                        <Icon name={toggleIcon} size={14} />
                    </button>
                {/if}
            </div>
        {/if}

        <!-- Expand/collapse caret, centered on the canvas-facing edge (docked only) -->
        {#if caretEdge}
            <button
                class="expand-toggle toggle-edge"
                onclick={toggleExpanded}
                aria-label={toggleLabel}
                aria-expanded={expanded}
                title={toggleLabel}
            >
                <Icon name={toggleIcon} size={12} />
            </button>
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
                style={isHorizontal
                    ? ''
                    : `grid-template-columns: repeat(auto-fill, minmax(${fixedHeight}px, 1fr));`}
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
                                'thumb-item thumb-group',
                                isHorizontal && 'thumb-horizontal',
                                !isHorizontal &&
                                    thumbGroup.srcs.length > 1 &&
                                    'span-2',
                                isGroupSelected && 'selected',
                            ]}
                            style="{isHorizontal
                                ? `height: ${fixedHeight + (thumbGroup.labels.length > 1 ? 40 : 24)}px;`
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
                                    isHorizontal && 'frame-horizontal',
                                    !isHorizontal &&
                                        thumbGroup.srcs.length > 1 &&
                                        'frame-aspect-wide',
                                    !isHorizontal &&
                                        thumbGroup.srcs.length <= 1 &&
                                        'frame-aspect-tall',
                                    isRTL && 'frame-rtl',
                                ]}
                                style={isHorizontal
                                    ? `height: ${fixedHeight}px`
                                    : ''}
                            >
                                <div
                                    class={[
                                        'thumb-pane',
                                        isHorizontal && 'pane-horizontal',
                                        !isHorizontal && 'pane-full-height',
                                        !isHorizontal &&
                                            thumbGroup.srcs.length > 1 &&
                                            'pane-half',
                                        !isHorizontal &&
                                            thumbGroup.srcs.length <= 1 &&
                                            'pane-full',
                                    ]}
                                >
                                    {#if thumbGroup.srcs[0]}
                                        <img
                                            src={thumbGroup.srcs[0]}
                                            alt={thumbGroup.labels[0]}
                                            class={[
                                                'thumb-img',
                                                isHorizontal &&
                                                    'img-horizontal',
                                                !isHorizontal && 'img-fill',
                                                thumbGroup.srcs.length > 1 &&
                                                    'img-right',
                                                thumbGroup.srcs.length <= 1 &&
                                                    'img-center',
                                            ]}
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    {:else}
                                        <span class="thumb-placeholder">?</span>
                                    {/if}
                                </div>
                                {#if thumbGroup.srcs.length > 1}
                                    <div
                                        class={[
                                            'thumb-pane',
                                            isHorizontal && 'pane-horizontal',
                                            !isHorizontal &&
                                                'pane-full-height pane-half',
                                        ]}
                                    >
                                        {#if thumbGroup.srcs[1]}
                                            <img
                                                src={thumbGroup.srcs[1]}
                                                alt={thumbGroup.labels[1]}
                                                class={[
                                                    'thumb-img img-left',
                                                    isHorizontal &&
                                                        'img-horizontal',
                                                    !isHorizontal && 'img-fill',
                                                ]}
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
                                class={[
                                    'thumb-label',
                                    isHorizontal && 'label-horizontal',
                                    !isHorizontal && 'label-vertical',
                                ]}
                                title="{thumbGroup.index + 1}. {thumbGroup
                                    .labels[0]}{thumbGroup.labels.length > 1
                                    ? ` / ${thumbGroup.index + 2}. ${thumbGroup.labels[1]}`
                                    : ''}"
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
                        </button>
                    {/each}
                {:else}
                    {#each thumbnails as thumb (thumb.id)}
                        <button
                            class={[
                                'thumb-item',
                                isHorizontal && 'thumb-horizontal',
                                viewerState.canvasId === thumb.id && 'selected',
                            ]}
                            style="{isHorizontal
                                ? `height: ${fixedHeight + 24}px;`
                                : ''}{viewerState.canvasId === thumb.id
                                ? 'outline: 2px solid var(--tri-color-primary); outline-offset: -2px;'
                                : ''}"
                            onclick={() => selectCanvas(thumb.id)}
                            data-id={thumb.id}
                            aria-label="Select canvas {thumb.label}"
                        >
                            <div
                                class={[
                                    'thumb-frame',
                                    isHorizontal && 'frame-horizontal',
                                    !isHorizontal && 'frame-aspect-tall',
                                ]}
                                style={isHorizontal
                                    ? `height: ${fixedHeight}px`
                                    : ''}
                            >
                                {#if thumb.src}
                                    <img
                                        src={thumb.src}
                                        alt={thumb.label}
                                        class={[
                                            'thumb-img',
                                            isHorizontal && 'img-horizontal',
                                            !isHorizontal && 'img-fill',
                                        ]}
                                        loading="lazy"
                                        draggable="false"
                                    />
                                {:else}
                                    <span class="thumb-placeholder">?</span>
                                {/if}
                            </div>
                            <div class="thumb-label label-simple">
                                <span class="label-num">{thumb.index + 1}.</span
                                >
                                {thumb.label}
                                {#if thumb.hasChoice}
                                    <span
                                        class="choice-badge choice-badge-simple"
                                        title="Has choices/layers"
                                    >
                                        <Icon
                                            name="Stack"
                                            size={12}
                                            class="choice-icon"
                                        />
                                    </span>
                                {/if}
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
        transition-property: all;
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
       `toggle-edge` is a low-profile tab centred on whichever gallery edge faces
       the canvas (see `caretEdge`).

       It reserves NO layout space: it is absolutely positioned over the gallery's
       own edge, so the docked band/rail measures exactly what it did before this
       control existed and opening the gallery costs no extra height. The price is
       that it overlays content rather than sitting in a gutter — hence the
       semi-opaque backdrop, which keeps the glyph legible over a busy thumbnail
       and over rows scrolling beneath it. In the horizontal strip it happens to
       land in the slack the centred track already leaves above the thumbnails, so
       there it overlaps nothing at all.

       It stays inside the gallery's bounds rather than protruding into the canvas,
       because the canvas side of a bottom-docked strip is where the canvas nav
       lives. */
    .expand-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--tri-gallery-content);
        background-color: color-mix(
            in oklab,
            var(--tri-gallery-bg) 82%,
            transparent
        );
        border: 0;
        cursor: pointer;
        z-index: 60;
        opacity: 0.5;
        transition-property: opacity, background-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }
    .expand-toggle:hover,
    .expand-toggle:focus-visible {
        opacity: 1;
        background-color: color-mix(
            in oklab,
            var(--tri-surface-border) 70%,
            var(--tri-gallery-bg)
        );
    }
    .expand-toggle.toggle-edge {
        position: absolute;
        width: 2.25rem;
        height: 0.75rem;
        padding: 0;
    }
    /* Expanded only: reserve the tab's 12px as root padding. The overlay fills the
       center column either way, so this costs no gallery size — it just insets the
       grid so no cell is clipped and no scrolled row passes beneath the tab. It
       must be padding on the ROOT, not on `.gallery-content`: padding on a scroll
       box scrolls away with its content. The docked strip deliberately gets none
       of this — there the tab lands in the centred track's existing slack, so the
       strip measures exactly what it did before this control existed. */
    .gallery-root.expanded.caret-top,
    .gallery-root.expanded.caret-bottom,
    .gallery-root.expanded.caret-left,
    .gallery-root.expanded.caret-right {
        box-sizing: border-box;
    }
    .gallery-root.expanded.caret-top {
        padding-top: 0.75rem;
    }
    .gallery-root.expanded.caret-bottom {
        padding-bottom: 0.75rem;
    }
    .gallery-root.expanded.caret-left {
        padding-left: 0.75rem;
    }
    .gallery-root.expanded.caret-right {
        padding-right: 0.75rem;
    }

    /* Vertical edges get the tab rotated onto its short axis. */
    .caret-left > .toggle-edge,
    .caret-right > .toggle-edge {
        width: 0.75rem;
        height: 2.25rem;
    }
    /* Flush with the canvas-facing edge, rounded on that side only, so it reads
       as a small handle rising out of the gallery. */
    .caret-top > .toggle-edge {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        border-radius: 0.25rem 0.25rem 0 0;
    }
    .caret-bottom > .toggle-edge {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        border-radius: 0 0 0.25rem 0.25rem;
    }
    .caret-left > .toggle-edge {
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        border-radius: 0.25rem 0 0 0.25rem;
    }
    .caret-right > .toggle-edge {
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        border-radius: 0 0.25rem 0.25rem 0;
    }
    .expand-toggle.toggle-inline {
        position: absolute;
        top: 0.125rem;
        right: 0.25rem;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 0.25rem;
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

    .gallery-track.track-horizontal {
        display: flex;
        flex-direction: row;
        gap: var(--ui-gallery-gap, 0.5rem);
        height: 100%;
        align-items: center;
    }
    .gallery-track.track-vertical {
        display: grid;
        gap: var(--ui-gallery-gap, 0.5rem);
    }

    /* ===== Thumbnail item (button) ===== */
    .thumb-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.25rem;
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
    .thumb-item.thumb-group {
        overflow: hidden;
    }
    .thumb-item:hover {
        background-color: var(--tri-surface-border);
    }
    .thumb-item.thumb-horizontal {
        width: auto;
    }
    .thumb-item.span-2 {
        grid-column: span 2 / span 2;
    }
    .thumb-item.selected {
        background-color: color-mix(
            in oklab,
            var(--tri-color-primary) 5%,
            transparent
        );
    }

    /* ===== Thumbnail frame (image container) ===== */
    .thumb-frame {
        background-color: var(--tri-surface-border);
        border-radius: 0.25rem;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1px;
    }
    .thumb-frame.frame-horizontal {
        height: 100%;
        width: auto;
        flex-direction: row;
    }
    .thumb-frame.frame-aspect-wide {
        aspect-ratio: 3 / 2;
        width: 100%;
    }
    .thumb-frame.frame-aspect-tall {
        aspect-ratio: 3 / 4;
        width: 100%;
    }
    .thumb-frame.frame-rtl {
        flex-direction: row-reverse;
    }

    /* ===== Pane (single image slot inside a frame) ===== */
    .thumb-pane {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .thumb-pane.pane-horizontal {
        height: 100%;
        width: auto;
    }
    .thumb-pane.pane-full-height {
        height: 100%;
    }
    .thumb-pane.pane-half {
        width: 50%;
    }
    .thumb-pane.pane-full {
        width: 100%;
    }

    /* ===== Thumbnail image ===== */
    .thumb-img {
        object-fit: contain;
    }
    .thumb-img.img-horizontal {
        height: 100%;
        width: auto;
    }
    .thumb-img.img-fill {
        width: 100%;
        height: 100%;
    }
    .thumb-img.img-right {
        object-position: right;
    }
    .thumb-img.img-center {
        object-position: center;
    }
    .thumb-img.img-left {
        object-position: left;
    }

    .thumb-placeholder {
        opacity: 0.2;
        font-size: 2.25rem;
        line-height: 2.5rem;
    }

    /* ===== Thumbnail label ===== */
    .thumb-label {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 500;
        opacity: 0.7;
    }
    .thumb-item:hover .thumb-label {
        opacity: 1;
    }
    .thumb-label.label-horizontal {
        width: 0;
        min-width: 100%;
        overflow: hidden;
    }
    .thumb-label.label-vertical {
        width: 100%;
        overflow: hidden;
    }
    .thumb-label.label-simple {
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    .choice-badge.choice-badge-simple {
        vertical-align: baseline;
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
