<script lang="ts">
    import { getContext } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
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

    // Generate thumbnail data
    let thumbnails = $derived.by(() => {
        if (!canvases || !Array.isArray(canvases))
            return [] as Array<{
                id: string;
                label: string;
                src: string;
                index: number;
            }>;
        return canvases.map((canvas: ManifestCanvas, index: number) => {
            // Manifesto getThumbnail logic
            let src = '';
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
            } catch (e) {
                console.warn('Error getting thumbnail', e);
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
                        if (Array.isArray(body) && body.length > 0)
                            resource = body[0];
                        else if (body) resource = body;
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
                            resource = Array.isArray(json.body)
                                ? json.body[0]
                                : json.body;
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
                            } catch (e) {
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
                            src = resource.id || resource['@id'];

                            // Fallback: if resource was reconstructed but ID is missing (common with Manifesto v3), check raw annotation
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
                                    const bodyObj = Array.isArray(rawBody)
                                        ? rawBody[0]
                                        : rawBody;
                                    src = bodyObj.id || bodyObj['@id'];
                                }
                            }
                        }
                    }
                }
            }

            return {
                id: canvas.id,
                label: canvas.getLabel().length
                    ? canvas.getLabel()[0].value
                    : `Canvas ${index + 1}`,
                src,
                index,
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
        viewerState.setCanvas(canvasId);
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

    // Switch to horizontal layout if height is small or docked to top/bottom
    let isHorizontal = $derived(
        dockSide === 'top' ||
            dockSide === 'bottom' ||
            (dockSide === 'none' && viewerState.gallerySize.height < 320),
    );

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
                <X size={16} weight="bold" />
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
                    : 'grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));'}
            >
                {#each thumbnails as thumb}
                    <button
                        class="group flex flex-col gap-1 p-1 rounded hover:bg-base-200 transition-colors text-left relative shrink-0 {isHorizontal
                            ? 'w-[140px]'
                            : ''} {viewerState.canvasId === thumb.id
                            ? 'ring-2 ring-primary bg-primary/5'
                            : ''}"
                        onclick={() => selectCanvas(thumb.id)}
                        aria-label="Select canvas {thumb.label}"
                    >
                        <div
                            class="aspect-4/3 bg-base-300 rounded overflow-hidden relative w-full flex items-center justify-center"
                        >
                            {#if thumb.src}
                                <img
                                    src={thumb.src}
                                    alt={thumb.label}
                                    class="object-contain w-full h-full"
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
                        </div>
                    </button>
                {/each}
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
