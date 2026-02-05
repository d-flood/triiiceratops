<script lang="ts">
    import { getContext } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import Stack from 'phosphor-svelte/lib/Stack';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';

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

    // Config shorthands
    let draggable = $derived(viewerState.config.gallery?.draggable ?? true);
    let showCloseButton = $derived(
        viewerState.config.gallery?.showCloseButton ?? true,
    );

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
            // Manifesto getThumbnail logic
            let src = '';
            let hasChoice = false;

            try {
                if (canvas.getThumbnail) {
                    const thumb = canvas.getThumbnail();
                    if (thumb) {
                        src =
                            typeof thumb === 'string'
                                ? thumb
                                : thumb.id || thumb['@id'];
                    }
                }
            } catch {
                console.warn('Error getting thumbnail');
            }

            // Fallback to first image if no thumbnail service
            if (!src) {
                // Use Manifesto to get images
                let images = canvas.getImages();

                // Fallback for IIIF v3: iterate content if images is empty
                if ((!images || !images.length) && canvas.getContent) {
                    images = canvas.getContent();
                }

                if (images && images.length > 0) {
                    const annotation: ManifestAnnotation = images[0];
                    let resource = annotation.getResource
                        ? annotation.getResource()
                        : null;

                    // v3 fallback: getBody
                    if (!resource && annotation.getBody) {
                        const body = annotation.getBody();
                        const rawBody =
                            annotation.__jsonld?.body || annotation.body;
                        // Check if body is a Choice
                        const isChoiceBody =
                            rawBody?.type === 'Choice' ||
                            rawBody?.type === 'oa:Choice' ||
                            (body &&
                                !Array.isArray(body) &&
                                (body.type === 'Choice' ||
                                    body.type === 'oa:Choice'));

                        if (isChoiceBody) {
                            // Extract first item from Choice for thumbnail
                            let items: any[] = [];
                            if (Array.isArray(body)) {
                                items = body;
                            } else if (body && (body.items || body.item)) {
                                items = body.items || body.item;
                            } else if (
                                rawBody &&
                                (rawBody.items || rawBody.item)
                            ) {
                                items = rawBody.items || rawBody.item;
                            }
                            if (items.length > 0) {
                                resource = items[0];
                            }
                        } else if (Array.isArray(body) && body.length > 0) {
                            resource = body[0];
                        } else if (body) {
                            resource = body;
                        }
                    }

                    if (
                        resource &&
                        !resource.id &&
                        !resource.__jsonld &&
                        (!resource.getServices ||
                            resource.getServices().length === 0)
                    ) {
                        resource = null;
                    }

                    if (!resource) {
                        // raw json fallback
                        const json = annotation.__jsonld || annotation;
                        if (json.body) {
                            let body = json.body;
                            // Handle Choice in raw JSON fallback
                            if (
                                body.type === 'Choice' ||
                                body.type === 'oa:Choice'
                            ) {
                                const items = body.items || body.item || [];
                                body = items[0] || null;
                            }
                            resource = Array.isArray(body) ? body[0] : body;
                        }
                    }

                    if (resource) {
                        const getServices = () => {
                            let s: ManifestService[] = [];
                            if (resource.getServices) {
                                s = resource.getServices();
                            }
                            if (!s || s.length === 0) {
                                const rJson = resource.__jsonld || resource;
                                if (rJson.service) {
                                    s = Array.isArray(rJson.service)
                                        ? rJson.service
                                        : [rJson.service];
                                }
                            }
                            return s;
                        };

                        const services = getServices();
                        let isLevel0 = false;
                        if (services.length > 0) {
                            const service = services[0];
                            let profile: unknown = '';
                            try {
                                profile = service.getProfile
                                    ? service.getProfile()
                                    : (service.profile as unknown) || '';
                                // Handle Manifesto profile object
                                if (typeof profile === 'object' && profile) {
                                    const pObj = profile as Record<
                                        string,
                                        unknown
                                    >;
                                    profile =
                                        (pObj.value as string | undefined) ||
                                        (pObj.id as string | undefined) ||
                                        (pObj['@id'] as string | undefined) ||
                                        JSON.stringify(pObj);
                                }
                            } catch {
                                // ignore
                            }

                            const pStr = String(profile ?? '').toLowerCase();
                            if (
                                pStr.includes('level0') ||
                                pStr.includes('level-0')
                            ) {
                                isLevel0 = true;
                            }

                            const serviceId = service.id || service['@id'];

                            if (!isLevel0) {
                                src = `${serviceId}/full/200,/0/default.jpg`;
                            }
                        }

                        if (!src) {
                            src =
                                resource.id ||
                                resource['@id'] ||
                                (resource.__jsonld &&
                                    (resource.__jsonld.id ||
                                        resource.__jsonld['@id']));

                            if (!src) {
                                let rawBody: any = null;
                                // Try to find the original raw body from which resource was derived
                                if (
                                    annotation.__jsonld &&
                                    annotation.__jsonld.body
                                ) {
                                    rawBody = annotation.__jsonld.body;
                                } else if (annotation.body) {
                                    rawBody = annotation.body;
                                }

                                if (rawBody) {
                                    let bodyObj = Array.isArray(rawBody)
                                        ? rawBody[0]
                                        : rawBody;
                                    // Handle Choice - extract first item
                                    if (
                                        bodyObj.type === 'Choice' ||
                                        bodyObj.type === 'oa:Choice'
                                    ) {
                                        const items =
                                            bodyObj.items || bodyObj.item || [];
                                        bodyObj = items[0] || bodyObj;
                                    }
                                    src = bodyObj.id || bodyObj['@id'];
                                }
                            }
                        }
                    }
                }
            }
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
            } catch {}

            return {
                id: canvas.id,
                label: canvas.getLabel().length
                    ? canvas.getLabel()[0].value
                    : `Canvas ${index + 1}`,
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
            console.warn('[Gallery] No center panel rect available');
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
        console.log('[Gallery] stopDrag. dropTarget:', dropTarget);

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
            const canvasIndex = thumbnails.findIndex((t) => t.id === canvasId);
            const singlePages = viewerState.pagedOffset;
            // If within single pages section, select directly
            if (canvasIndex < singlePages) {
                viewerState.setCanvas(canvasId);
            } else {
                // Check if this is a left-hand page (start of a pair)
                const pairPosition = (canvasIndex - singlePages) % 2;
                if (pairPosition === 0) {
                    viewerState.setCanvas(canvasId);
                } else {
                    // Right-hand page, select the left page of this pair
                    const prevCanvas = thumbnails[canvasIndex - 1];
                    viewerState.setCanvas(prevCanvas.id);
                }
            }
        } else {
            viewerState.setCanvas(canvasId);
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

        // In paged mode, find the group that contains this canvas
        // (the canvas could be the second of a pair, but data-id uses the first canvas's id)
        if (viewerState.viewingMode === 'paged') {
            const group = groupedThumbnails.find((g) => {
                const idx = g.index;
                const first = thumbnails[idx];
                const second = thumbnails[idx + 1];
                return first?.id === targetId || second?.id === targetId;
            });
            if (group) {
                targetId = group.id;
            }
        }

        const activeEl = galleryElement.querySelector(
            `[data-id="${CSS.escape(targetId)}"]`,
        );
        if (activeEl) {
            activeEl.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center',
            });
        }
    });

    // Switch to horizontal layout if height is small or docked to top/bottom
    let isHorizontal = $derived(
        dockSide === 'top' ||
            dockSide === 'bottom' ||
            (dockSide === 'none' && viewerState.gallerySize.height < 320),
    );

    let fixedHeight = $derived(viewerState.galleryFixedHeight);
    let isRTL = $derived(viewerState.viewingDirection === 'right-to-left');

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
            console.log(
                '[Gallery] Captured center panel rect:',
                viewerState.galleryCenterPanelRect,
            );
        } else {
            console.warn('[Gallery] Could not find center panel in startDrag');
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

    // Grouped thumbnail mode (for two-page mode)
    const groupedThumbnailIndices = $derived.by(() => {
        const indices: number[] = [];
        if (viewerState.viewingMode === 'paged' && canvases) {
            // Single pages at the start: pagedOffset (default 0, shifted = 1)
            const singlePages = viewerState.pagedOffset;
            // Add indices for single pages
            for (let i = 0; i < singlePages && i < canvases.length; i++) {
                indices.push(i);
            }
            // Add indices for paired pages (step by 2 starting from singlePages)
            for (let i = singlePages; i < canvases.length; i += 2) {
                indices.push(i);
            }
        }
        return indices;
    });

    const groupedThumbnails = $derived.by(() => {
        const groups: Array<{
            id: string;
            labels: string[];
            srcs: string[];
            index: number;
            hasChoice: boolean;
        }> = [];
        const thumbs = thumbnails;
        const singlePages = viewerState.pagedOffset;
        for (const i of groupedThumbnailIndices) {
            const first = thumbs[i];
            // Only pair if we're past the single pages section
            const second = i < singlePages ? null : thumbs[i + 1];
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
        class={(dockSide !== 'none'
            ? `relative z-50 bg-base-100 shadow-xl border-base-300 flex transition-all duration-200 select-none w-full h-full
           ${dockSide === 'bottom' || dockSide === 'top' ? 'flex-row border-t' : ''}
           ${dockSide === 'left' || dockSide === 'right' ? 'flex-col border-x' : ''}`
            : 'fixed z-900 bg-base-100 shadow-2xl rounded-lg flex flex-col border border-base-300 overflow-hidden select-none') +
            (viewerState.isGalleryDragging
                ? ' pointer-events-none opacity-80'
                : '')}
        style={dockSide !== 'none'
            ? ''
            : `left: ${viewerState.galleryPosition.x}px; top: ${viewerState.galleryPosition.y}px; width: ${viewerState.gallerySize.width}px; height: ${viewerState.gallerySize.height}px;`}
    >
        <!-- Close Button (show when enabled in config, regardless of dock state) -->
        {#if showCloseButton}
            <button
                class="absolute top-1 right-1 btn btn-error btn-xs btn-circle z-20"
                onclick={() => viewerState.toggleThumbnailGallery()}
                aria-label="Close Gallery"
            >
                <X size={16} />
            </button>
        {/if}

        <!-- Header Area (only show drag handle when draggable OR when floating) -->
        {#if draggable || dockSide === 'none'}
            <div
                class={'bg-base-100 flex shrink-0 select-none relative ' +
                    (dockSide === 'bottom' || dockSide === 'top'
                        ? 'flex-row h-full items-center border-r border-base-200'
                        : 'flex-col w-full border-b border-base-200')}
            >
                <!-- Drag Handle -->
                <div
                    class={'cursor-move flex items-center justify-center hover:bg-base-200/50 active:bg-base-200 transition-colors ' +
                        (dockSide === 'bottom' || dockSide === 'top'
                            ? 'w-8 h-full'
                            : 'h-6 w-full')}
                    onmousedown={startDrag}
                    role="button"
                    tabindex="0"
                    aria-label="Drag Gallery"
                >
                    <div
                        class={'bg-base-300 rounded-full ' +
                            (dockSide === 'bottom' || dockSide === 'top'
                                ? 'w-1.5 h-12'
                                : 'w-12 h-1.5')}
                    ></div>
                </div>
            </div>
        {/if}

        <!-- Content (Grid or Horizontal Scroll) -->
        <div
            class="flex-1 p-1 bg-base-100 {isHorizontal
                ? 'overflow-x-auto overflow-y-hidden h-full'
                : 'overflow-y-auto overflow-x-hidden'}"
        >
            <div
                class={isHorizontal
                    ? 'flex flex-row gap-2 h-full items-center'
                    : 'grid gap-2'}
                style={isHorizontal
                    ? ''
                    : `grid-template-columns: repeat(auto-fill, minmax(${fixedHeight}px, 1fr));`}
            >
                {#if viewerState.viewingMode === 'paged'}
                    <!-- grouped thumbnail display -->
                    {#each groupedThumbnails as thumbGroup}
                        {@const isGroupSelected = (() => {
                            const idx = thumbGroup.index;
                            const first = thumbnails[idx];
                            const second = thumbnails[idx + 1];
                            return (
                                viewerState.canvasId === first?.id ||
                                viewerState.canvasId === second?.id
                            );
                        })()}
                        <button
                            class="group flex flex-col gap-1 p-1 rounded hover:bg-base-200 transition-colors text-left relative shrink-0 overflow-hidden {isHorizontal
                                ? 'w-auto'
                                : thumbGroup.srcs.length > 1
                                  ? 'col-span-2'
                                  : ''} {isGroupSelected
                                ? 'ring-2 ring-primary bg-primary/5'
                                : ''}"
                            style={isHorizontal
                                ? `height: ${fixedHeight + (thumbGroup.labels.length > 1 ? 40 : 24)}px`
                                : ''}
                            onclick={() => selectCanvas(thumbGroup.id)}
                            data-id={thumbGroup.id}
                            aria-label="Select canvas {thumbGroup.labels.join(
                                ' / ',
                            )}"
                        >
                            <div
                                class="{isHorizontal
                                    ? 'h-full w-auto flex-row'
                                    : thumbGroup.srcs.length > 1
                                      ? 'aspect-3/2 w-full'
                                      : 'aspect-3/4 w-full'} bg-base-300 rounded overflow-hidden relative flex items-center justify-center gap-px {isRTL
                                    ? 'flex-row-reverse'
                                    : ''}"
                                style={isHorizontal
                                    ? `height: ${fixedHeight}px`
                                    : ''}
                            >
                                <div
                                    class="flex items-center justify-center overflow-hidden {isHorizontal
                                        ? 'h-full w-auto'
                                        : 'h-full ' +
                                          (thumbGroup.srcs.length > 1
                                              ? 'w-1/2'
                                              : 'w-full')}"
                                >
                                    {#if thumbGroup.srcs[0]}
                                        <img
                                            src={thumbGroup.srcs[0]}
                                            alt={thumbGroup.labels[0]}
                                            class="object-contain {isHorizontal
                                                ? 'h-full w-auto'
                                                : 'w-full h-full'} {thumbGroup
                                                .srcs.length > 1
                                                ? 'object-right'
                                                : 'object-center'}"
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    {:else}
                                        <span class="opacity-20 text-4xl"
                                            >?</span
                                        >
                                    {/if}
                                </div>
                                {#if thumbGroup.srcs.length > 1}
                                    <div
                                        class="flex items-center justify-center overflow-hidden {isHorizontal
                                            ? 'h-full w-auto'
                                            : 'h-full w-1/2'}"
                                    >
                                        {#if thumbGroup.srcs[1]}
                                            <img
                                                src={thumbGroup.srcs[1]}
                                                alt={thumbGroup.labels[1]}
                                                class="object-contain {isHorizontal
                                                    ? 'h-full w-auto'
                                                    : 'w-full h-full'} object-left"
                                                loading="lazy"
                                                draggable="false"
                                            />
                                        {:else}
                                            <span class="opacity-20 text-4xl"
                                                >?</span
                                            >
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <div
                                class="text-xs font-medium opacity-70 group-hover:opacity-100 overflow-hidden {isHorizontal
                                    ? 'w-0 min-w-full'
                                    : 'w-full'}"
                                title="{thumbGroup.index + 1}. {thumbGroup
                                    .labels[0]}{thumbGroup.labels.length > 1
                                    ? ` / ${thumbGroup.index + 2}. ${thumbGroup.labels[1]}`
                                    : ''}"
                            >
                                <div class="truncate">
                                    <span class="font-bold mr-1"
                                        >{thumbGroup.index + 1}.</span
                                    >{thumbGroup
                                        .labels[0]}{#if thumbGroup.hasChoice && thumbGroup.labels.length === 1}<span
                                            class="ml-1 inline-flex items-center align-middle"
                                            title="Has choices/layers"
                                            ><Stack
                                                size={12}
                                                class="opacity-70"
                                            /></span
                                        >{/if}
                                </div>
                                {#if thumbGroup.labels.length > 1}
                                    <div class="truncate">
                                        <span class="font-bold mr-1"
                                            >{thumbGroup.index + 2}.</span
                                        >{thumbGroup
                                            .labels[1]}{#if thumbGroup.hasChoice}<span
                                                class="ml-1 inline-flex items-center align-middle"
                                                title="Has choices/layers"
                                                ><Stack
                                                    size={12}
                                                    class="opacity-70"
                                                /></span
                                            >{/if}
                                    </div>
                                {/if}
                            </div>
                        </button>
                    {/each}
                {:else}
                    {#each thumbnails as thumb}
                        <button
                            class="group flex flex-col gap-1 p-1 rounded hover:bg-base-200 transition-colors text-left relative shrink-0 {isHorizontal
                                ? 'w-auto'
                                : ''} {viewerState.canvasId === thumb.id
                                ? 'ring-2 ring-primary bg-primary/5'
                                : ''}"
                            style={isHorizontal
                                ? `height: ${fixedHeight + 24}px`
                                : ''}
                            onclick={() => selectCanvas(thumb.id)}
                            data-id={thumb.id}
                            aria-label="Select canvas {thumb.label}"
                        >
                            <div
                                class="{isHorizontal
                                    ? 'h-full w-auto'
                                    : 'aspect-3/4 w-full'} bg-base-300 rounded overflow-hidden relative flex items-center justify-center"
                                style={isHorizontal
                                    ? `height: ${fixedHeight}px`
                                    : ''}
                            >
                                {#if thumb.src}
                                    <img
                                        src={thumb.src}
                                        alt={thumb.label}
                                        class="object-contain {isHorizontal
                                            ? 'h-full w-auto'
                                            : 'w-full h-full'}"
                                        loading="lazy"
                                        draggable="false"
                                    />
                                {:else}
                                    <span class="opacity-20 text-4xl">?</span>
                                {/if}
                            </div>
                            <div
                                class="text-xs font-medium truncate w-full opacity-70 group-hover:opacity-100"
                            >
                                <span class="font-bold mr-1"
                                    >{thumb.index + 1}.</span
                                >
                                {thumb.label}
                                {#if thumb.hasChoice}
                                    <span
                                        class="ml-1 inline-flex items-center"
                                        title="Has choices/layers"
                                    >
                                        <Stack size={12} class="opacity-70" />
                                    </span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Resize Handle -->
        {#if dockSide === 'none'}
            <div
                class="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize resize-handle bg-accent hover:bg-accent-focus transition-colors z-50"
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
            class="absolute top-2 left-2 right-2 h-16 rounded-xl border-4 border-dashed border-primary/40 z-999 pointer-events-none flex items-center justify-center transition-all duration-200 {viewerState.dragOverSide ===
            'top'
                ? 'bg-primary/20 scale-105'
                : 'bg-base-100/50'}"
            role="group"
        >
            <span class="font-bold text-primary opacity-50">Dock Top</span>
        </div>

        <!-- Bottom -->
        <div
            class="absolute bottom-2 left-2 right-2 h-16 rounded-xl border-4 border-dashed border-primary/40 z-999 pointer-events-none flex items-center justify-center transition-all duration-200 {viewerState.dragOverSide ===
            'bottom'
                ? 'bg-primary/20 scale-105'
                : 'bg-base-100/50'}"
            role="group"
        >
            <span class="font-bold text-primary opacity-50">Dock Bottom</span>
        </div>

        <!-- Left -->
        <div
            class="absolute top-2 bottom-2 left-2 w-16 rounded-xl border-4 border-dashed border-primary/40 z-999 pointer-events-none flex items-center justify-center transition-all duration-200 {viewerState.dragOverSide ===
            'left'
                ? 'bg-primary/20 scale-105'
                : 'bg-base-100/50'}"
            role="group"
        >
            <span
                class="font-bold text-primary opacity-50 vertical-rl rotate-180"
                style="writing-mode: vertical-rl;">Dock Left</span
            >
        </div>

        <!-- Right -->
        <div
            class="absolute top-2 bottom-2 right-2 w-16 rounded-xl border-4 border-dashed border-primary/40 z-999 pointer-events-none flex items-center justify-center transition-all duration-300 {viewerState.dragOverSide ===
            'right'
                ? 'bg-primary/20 scale-105'
                : 'bg-base-100/50'}"
            role="group"
        >
            <span
                class="font-bold text-primary opacity-50 vertical-rl rotate-180"
                style="writing-mode: vertical-rl;">Dock Right</span
            >
        </div>
    {/if}
{/if}
