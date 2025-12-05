<script>
    import { manifestsState } from "../state/manifests.svelte";

    let { viewerState, viewer } = $props();

    let annotations = $derived.by(() => {
        console.log("AnnotationOverlay: derived annotations running");
        console.log("AnnotationOverlay: manifestId", viewerState.manifestId);
        console.log("AnnotationOverlay: canvasId", viewerState.canvasId);
        if (!viewerState.manifestId || !viewerState.canvasId) {
            console.log("AnnotationOverlay: missing manifestId or canvasId");
            return [];
        }
        return manifestsState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        );
    });

    // Helper to parse xywh string
    function parseRegion(fragment) {
        if (!fragment) return null;
        // Handle fragment with or without 'xywh=' prefix
        const match = fragment.match(/(?:xywh=)?(\d+),(\d+),(\d+),(\d+)/);
        if (match) {
            return {
                x: parseInt(match[1]),
                y: parseInt(match[2]),
                w: parseInt(match[3]),
                h: parseInt(match[4]),
            };
        }
        return null;
    }

    // We need to track OSD state changes manually since OSD isn't reactive
    let osdVersion = $state(0);

    $effect(() => {
        if (!viewer) return;

        const update = () => {
            osdVersion++;
        };

        viewer.addHandler("open", update);
        viewer.addHandler("animation", update);
        viewer.addHandler("resize", update);
        viewer.addHandler("rotate", update);
        viewer.world.addHandler("add-item", update);
        viewer.world.addHandler("remove-item", update);

        return () => {
            viewer.removeHandler("open", update);
            viewer.removeHandler("animation", update);
            viewer.removeHandler("resize", update);
            viewer.removeHandler("rotate", update);
            viewer.world.removeHandler("add-item", update);
            viewer.world.removeHandler("remove-item", update);
        };
    });

    // Map annotations to viewport coordinates
    let renderedAnnotations = $derived.by(() => {
        // specific dependency on osdVersion to trigger updates
        const _ = osdVersion;

        if (!viewer || !annotations.length) {
            console.log("AnnotationOverlay: no viewer or annotations");
            return [];
        }

        const tiledImage = viewer.world.getItemAt(0);
        if (!tiledImage) {
            console.log("AnnotationOverlay: no tiledImage");
            return [];
        }

        const imageRect = tiledImage.getContentSize(); // Original image dimensions
        console.log("AnnotationOverlay: imageRect", imageRect);

        return annotations
            .map((anno) => {
                let targetId = "";

                // Manifesto Object
                if (typeof anno.getTarget === "function") {
                    // getTarget returns main target string or resource?
                    // Typically returns string or string[].
                    const t = anno.getTarget();
                    if (t) targetId = t;

                    // If complex target (SpecificResource handled by manifesto?), we might need more.
                    // But in simple mode, we get a string.
                    // If it is NOT a string, it might be an object? Use raw accessor if needed.
                    if (typeof t !== "string") {
                        // Check raw json if needed or if there's a getter
                        // Fallback to raw:
                        const rawOn = anno.__jsonld.on;
                        if (rawOn) {
                            if (typeof rawOn === "string") {
                                targetId = rawOn;
                            } else if (rawOn.selector) {
                                // selector usage
                                const val =
                                    rawOn.selector.value ||
                                    rawOn.selector.item?.value;
                                if (val)
                                    targetId = targetId + "#" + val; // Hacky re-construction if targetId was the base
                                else if (rawOn.full)
                                    targetId =
                                        rawOn.full +
                                        "#" +
                                        (rawOn.selector.value || "");
                                else targetId = ""; // Complex...
                            }
                        }
                    }
                } else {
                    // Raw JSON
                    if (anno.on) {
                        if (typeof anno.on === "string") {
                            targetId = anno.on;
                        } else if (anno.on.selector) {
                            // IIIF v2 SpecificResource
                            const val =
                                anno.on.selector.value ||
                                anno.on.selector.item?.value;
                            if (val && val.includes("xywh=")) {
                                // Extract from selector value
                                targetId = val; // Just the fragment part
                            }
                        } else if (anno.target) {
                            // IIIF v3
                            if (typeof anno.target === "string") {
                                targetId = anno.target;
                            } else if (anno.target.selector) {
                                const val =
                                    anno.target.selector.value ||
                                    anno.target.selector.item?.value;
                                if (val && val.includes("xywh=")) {
                                    targetId = val;
                                }
                            }
                        }
                    }
                }

                if (!targetId && typeof anno.getTarget !== "function") {
                    // Try raw target for v3 if 'on' missed
                    if (anno.target && typeof anno.target === "string")
                        targetId = anno.target;
                }

                // If targetId is just the fragment (from selector value logic above), use it directly
                // If it's a URI, split it.

                let fragment = "";
                if (targetId && targetId.includes("xywh=")) {
                    fragment = targetId.split("xywh=")[1];
                }

                // Fallback for SpecificResource if we missed it above because we only looked for string
                if (!fragment && !targetId) {
                    // Already handled nicely by the if/else block above hopefully?
                }

                const region = parseRegion(fragment);
                // console.log(
                //     "AnnotationOverlay: processing anno",
                //     anno,
                //     "region",
                //     region,
                // );

                // Debug first annotation structure deeply
                if (anno === annotations[0]) {
                    console.log(
                        "AnnotationOverlay: FIRST ANNO FULL:",
                        $state.snapshot(anno),
                    );
                }

                if (region) {
                    // Convert image coordinates to viewport coordinates first
                    const viewportRect = tiledImage.imageToViewportRectangle(
                        region.x,
                        region.y,
                        region.w,
                        region.h,
                    );

                    // Convert viewport coordinates to viewer element (pixel) coordinates
                    const elementRect =
                        viewer.viewport.viewportToViewerElementRectangle(
                            viewportRect,
                        );

                    // Extract content (support IIIF v2 and v3)
                    // Now anno might be a Manifesto object OR a raw JSON object
                    // We check for methods

                    let content = "";
                    let isHtml = false;
                    let target = "";

                    // Manifesto Object Handling
                    if (typeof anno.getBody === "function") {
                        // It's a Manifesto object!
                        const body = anno.getBody();
                        if (body && body.length) {
                            // Helper to extract value from Resource
                            const getValue = (b) => {
                                const val = b.getValue ? b.getValue() : null;
                                if (val) return val; // locale aware
                                // Fallback to checking properties if getValue returns null??
                                // Manifesto usually handles picking the right language
                                return "";
                            };

                            content = body
                                .map((b) => getValue(b))
                                .filter(Boolean)
                                .join(" ");

                            // Check HTML
                            isHtml = body.some((b) => {
                                const fmt = b.getFormat ? b.getFormat() : "";
                                return (
                                    fmt === "text/html" ||
                                    fmt === "application/html"
                                );
                            });
                        }

                        // Parse target for region
                        // Manifesto doesn't always parse the selector for us in a way OSD needs (?)
                        // getTarget() returns the string URI usually
                        target = anno.getTarget ? anno.getTarget() : "";

                        // If no body content, check label
                        if (!content && typeof anno.getLabel === "function") {
                            const label = anno.getLabel();
                            if (label) content = label;
                        }
                    } else {
                        // Raw JSON Parsing (Fallback) - existing logic

                        // Helper to get text from a resource/body item
                        const getText = (r) => {
                            if (!r) return "";
                            return r.chars || r.value || r["cnt:chars"] || "";
                        };

                        const isHtmlFormat = (r) => {
                            if (!r) return false;
                            return (
                                r.format === "text/html" ||
                                r.type === "TextualBody"
                            );
                        };

                        if (anno.resource) {
                            // IIIF v2
                            if (Array.isArray(anno.resource)) {
                                content = anno.resource
                                    .map((r) => getText(r))
                                    .join(" ");
                                if (anno.resource.some((r) => isHtmlFormat(r)))
                                    isHtml = true;
                            } else {
                                content = getText(anno.resource);
                                if (isHtmlFormat(anno.resource)) isHtml = true;
                            }
                        } else if (anno.body) {
                            // IIIF v3
                            if (Array.isArray(anno.body)) {
                                content = anno.body
                                    .map((b) => getText(b))
                                    .join(" ");
                                if (anno.body.some((b) => isHtmlFormat(b)))
                                    isHtml = true;
                            } else {
                                content = getText(anno.body);
                                if (isHtmlFormat(anno.body)) isHtml = true;
                            }
                        }

                        if (anno.on) {
                            target =
                                typeof anno.on === "string"
                                    ? anno.on
                                    : anno.on["@id"] || anno.on.id || "";
                            // Also handle full/specific resource manually if needed if we weren't doing it up top...
                            // Wait, we process `fragment` earlier. We need `on` here only if we were re-parsing.
                            // Actually, `fragment` is processed at start of this loop.
                            // We need to ensure `fragment` extraction works for Manifesto objects too!
                        }

                        // Fallback: If no content found in body/resource, use label, name, or title
                        if (!content) {
                            const fallback =
                                anno.label || anno.name || anno.title;
                            if (fallback) {
                                content = Array.isArray(fallback)
                                    ? fallback.join(" ")
                                    : fallback;
                            }
                        }
                    }

                    // console.log("AnnotationOverlay: calculated element rect (px)", elementRect, "content:", content);

                    return {
                        rect: elementRect,
                        content,
                        isHtml,
                        label:
                            (typeof anno.getLabel === "function"
                                ? anno.getLabel()
                                : anno.label) || "",
                    };
                }
                return null;
            })
            .filter(Boolean);
    });
</script>

{#if viewerState.showAnnotations}
    {#each renderedAnnotations as anno}
        <div
            class="absolute border-2 border-red-500 bg-red-500/20 hover:bg-red-500/40 transition-colors cursor-pointer"
            style="
                left: {anno.rect.x}px;
                top: {anno.rect.y}px; 
                width: {anno.rect.width}px;
                height: {anno.rect.height}px;
                pointer-events: auto;
            "
            title={anno.label || "Annotation"}
        ></div>
    {/each}
{/if}

<!-- Debug/Info Count -->
<!-- Unified Annotation Toolbar -->
{#if annotations.length > 0}
    <div class="absolute top-4 right-4 z-10 pointer-events-auto">
        <details class="group relative">
            <summary
                class="flex items-center gap-2 bg-base-200/90 backdrop-blur shadow-lg rounded-full px-4 py-2 cursor-pointer list-none hover:bg-base-200 transition-all select-none border border-base-300 pointer-events-auto"
            >
                <!-- Toggle Button (Stop Propagation to prevent closing details on toggle) -->
                <button
                    class="btn btn-xs btn-circle btn-ghost"
                    onclick={(e) => {
                        e.preventDefault();
                        viewerState.toggleAnnotations();
                    }}
                    title={viewerState.showAnnotations
                        ? "Hide Annotations"
                        : "Show Annotations"}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        {#if viewerState.showAnnotations}
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                        {:else}
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.059 10.059 0 013.999-5.325m4.314-1.351A10.054 10.054 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.058 10.058 0 01-2.105 3.86m-3.71 3.71a3 3 0 00-4.242 0"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M3 3l18 18"
                            />
                        {/if}
                    </svg>
                </button>

                <!-- Badge Text -->
                <span class="text-sm font-medium">
                    {annotations.length} Annotations
                    <span class="opacity-50 text-xs font-normal ml-1">
                        ({viewerState.showAnnotations ? "visible" : "hidden"})
                    </span>
                </span>

                <!-- Chevron indicator -->
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 opacity-50 transition-transform group-open:rotate-180"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                    />
                </svg>
            </summary>

            <!-- Expanded List -->
            <div
                class="absolute right-0 mt-2 w-96 bg-base-200/95 backdrop-blur shadow-xl rounded-box p-0 max-h-[60vh] overflow-y-auto border border-base-300 flex flex-col divide-y divide-base-300"
            >
                {#each renderedAnnotations as anno, i}
                    <div
                        class="p-3 hover:bg-base-300 transition-colors cursor-pointer flex flex-col gap-1 group/item"
                    >
                        <div class="flex items-start justify-between">
                            <span class="font-bold text-sm text-primary"
                                >#{i + 1}</span
                            >
                            <!-- Only show label separately if it's different from the content being displayed -->
                            {#if anno.label && anno.label !== anno.content}
                                <span
                                    class="text-xs opacity-50 truncate max-w-[150px]"
                                    >{anno.label}</span
                                >
                            {/if}
                        </div>
                        <div
                            class="text-sm prose prose-sm max-w-none prose-p:my-0 prose-a:text-blue-500 break-words"
                        >
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            {#if anno.isHtml}
                                {@html anno.content}
                            {:else}
                                {anno.content || "(No content)"}
                            {/if}
                        </div>
                    </div>
                {/each}
                {#if renderedAnnotations.length === 0 && annotations.length > 0}
                    <div class="p-4 text-center opacity-50 text-sm">
                        Annotations are hidden or off-screen.
                    </div>
                {/if}
            </div>
        </details>
    </div>
{/if}
