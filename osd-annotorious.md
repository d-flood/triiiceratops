# Migration Plan: Leaflet → OpenSeadragon + Annotorious

## Overview

This document outlines the migration from Leaflet to OpenSeadragon with Annotorious for IIIF image viewing and annotation rendering in the Triiiceratops viewer.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Annotorious bindings | Vanilla JS API | `@annotorious/svelte` built for Svelte 4, not compatible with Svelte 5 runes |
| SVG selectors | Convert to POLYGON | Annotorious uses RECTANGLE/POLYGON geometry natively |
| Tooltips | Custom positioned div with DaisyUI styling (Option A) | More styling control, consistent theming |
| targetBounds | Remove entirely | Feature not needed |
| OSD navigation controls | Hidden | Custom UI will be retained |
| Annotation visibility | `viewerState.visibleAnnotationIds` + `anno.setFilter()` | Reactive filtering |
| Search hit styling | `anno.setStyle()` with callback checking `purpose === 'search-hit'` | Data-driven styling |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  TriiiceratopsViewer.svelte (renamed from MiradorViewer)            │
│  ├── OSDViewer.svelte (NEW)                                         │
│  │   ├── OpenSeadragon viewer (vanilla JS, onMount)                 │
│  │   ├── Annotorious annotator (createOSDAnnotator, $effect)        │
│  │   ├── Annotation loading ($effect when canvas/annotations change)│
│  │   ├── Dynamic styling ($effect → anno.setStyle)                  │
│  │   ├── Filtering ($effect → anno.setFilter)                       │
│  │   └── Hover tooltip (positioned div with DaisyUI styling)        │
│  ├── AnnotationOverlay.svelte (REFACTORED)                          │
│  │   └── Annotation list UI only (no map rendering)                 │
│  │   └── Toggle visibility → updates viewerState.visibleAnnotationIds│
│  ├── ThumbnailGallery.svelte (unchanged)                            │
│  ├── SearchPanel.svelte (simplified - remove bounds logic)          │
│  ├── CanvasNavigation.svelte (unchanged)                            │
│  ├── FloatingMenu.svelte (unchanged)                                │
│  └── MetadataDialog.svelte (unchanged)                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Package Changes

### Remove
```bash
pnpm remove leaflet
```

### Add
```bash
pnpm add openseadragon @annotorious/openseadragon
```

### Update devDependencies
- Remove `@types/leaflet`

## Phase 2: Create OSDViewer.svelte

Create `src/lib/components/OSDViewer.svelte` with:

- Initialize OpenSeadragon viewer in `onMount`
- Initialize Annotorious with `createOSDAnnotator(viewer, { drawingEnabled: false })`
- Wire up tileSources `$effect` for canvas changes
- Implement dynamic styling with `anno.setStyle()` (red for regular, yellow for search hits)
- Implement filtering with `anno.setFilter()` based on `viewerState.visibleAnnotationIds`
- Add `mouseEnterAnnotation`/`mouseLeaveAnnotation` event handlers for tooltips
- Create hover tooltip as positioned div with DaisyUI/Tailwind styling

### Key Implementation Details

```typescript
// Pseudocode structure
<script lang="ts">
  import OpenSeadragon from 'openseadragon';
  import { createOSDAnnotator } from '@annotorious/openseadragon';
  import '@annotorious/openseadragon/annotorious-openseadragon.css';
  import { onMount } from 'svelte';
  
  let { tileSources, viewerState } = $props();
  
  let container: HTMLElement;
  let viewer: OpenSeadragon.Viewer | undefined = $state();
  let anno = $state();
  
  // Tooltip state
  let hoveredAnnotation = $state(null);
  let tooltipPos = $state({ x: 0, y: 0 });
  
  onMount(() => {
    viewer = OpenSeadragon({
      element: container,
      tileSources,
      showNavigationControl: false,
      // ... other options
    });
    
    anno = createOSDAnnotator(viewer, { drawingEnabled: false });
    
    // Hover events for tooltip
    anno.on('mouseEnterAnnotation', (annotation) => {
      hoveredAnnotation = annotation;
    });
    anno.on('mouseLeaveAnnotation', () => {
      hoveredAnnotation = null;
    });
    
    // Track pointer for tooltip positioning
    container.addEventListener('pointermove', (e) => {
      tooltipPos = { x: e.offsetX, y: e.offsetY };
    });
    
    return () => {
      anno?.destroy();
      viewer?.destroy();
    };
  });
  
  // Dynamic styling
  $effect(() => {
    if (!anno) return;
    anno.setStyle((annotation) => {
      const isSearchHit = annotation.bodies?.some(b => b.purpose === 'search-hit');
      return {
        fill: isSearchHit ? '#facc15' : '#ef4444',
        fillOpacity: isSearchHit ? 0.4 : 0.2,
        stroke: isSearchHit ? '#facc15' : '#ef4444',
        strokeWidth: isSearchHit ? 1 : 2
      };
    });
  });
  
  // Filtering based on visibility
  $effect(() => {
    if (!anno) return;
    anno.setFilter((annotation) => {
      if (annotation.bodies?.some(b => b.purpose === 'search-hit')) return true;
      if (!viewerState.showAnnotations) return false;
      return viewerState.visibleAnnotationIds.has(annotation.id);
    });
  });
</script>
```

### Tooltip Implementation (Option A)

```svelte
{#if hoveredAnnotation && viewerState.showAnnotations}
  <div 
    class="absolute bg-base-200 text-base-content px-3 py-2 rounded-lg shadow-lg text-sm max-w-xs pointer-events-none z-[1000]"
    style="left: {tooltipPos.x + 15}px; top: {tooltipPos.y + 15}px;"
  >
    {getAnnotationContent(hoveredAnnotation)}
  </div>
{/if}
```

## Phase 3: Create Annotation Format Adapter

Create `src/lib/utils/annotationAdapter.ts` to convert IIIF/Manifesto annotations to Annotorious format.

### Conversions Required

1. **xywh media fragment → RECTANGLE**
   ```typescript
   // From: "canvas-id#xywh=100,200,300,400"
   // To: { type: 'RECTANGLE', geometry: { x, y, w, h, bounds } }
   ```

2. **SVG selector → POLYGON**
   ```typescript
   // From: <svg><path d="M..."/></svg>
   // To: { type: 'POLYGON', geometry: { points: [[x,y], ...], bounds } }
   ```

3. **Annotation body extraction**
   - Extract content from `resource.chars`, `body.value`, etc.
   - Add `purpose: 'search-hit'` for search result annotations

## Phase 4: Refactor AnnotationOverlay → AnnotationList

Modify `src/lib/components/AnnotationOverlay.svelte`:

- Move `visibleAnnotationIds` state to `viewerState`
- Remove all Leaflet imports (`LayerGroup`, `Rectangle`, `SVGOverlay`, etc.)
- Remove layer rendering logic
- Keep annotation list UI (the `<details>` dropdown with toggles)
- Toggle actions update `viewerState.visibleAnnotationIds`

## Phase 5: Rename Mirador → Triiiceratops

| From | To |
|------|-----|
| `MiradorViewer.svelte` | `TriiiceratopsViewer.svelte` |
| `#mirador-viewer` | `#triiiceratops-viewer` |
| `miradore-svelte` (package.json) | `triiiceratops` |

### Files to Update
- `src/lib/components/MiradorViewer.svelte` → rename file
- `src/App.svelte` → update import
- `src/lib/state/viewer.svelte.ts` → update `document.getElementById("mirador-viewer")`
- `package.json` → update name (optional)

## Phase 6: Update TriiiceratopsViewer.svelte

- Replace `LeafletViewer` import with `OSDViewer`
- Update component structure for new architecture

## Phase 7: Cleanup

### Delete Files
- `src/lib/components/LeafletViewer.svelte`
- `src/lib/components/IIIFLayer.ts`

### Remove from viewer.svelte.ts
- `targetBounds` state property
- `currentCanvasSearchAnnotations` getter (if only used for bounds)

### Remove from SearchPanel.svelte
- `targetBounds` navigation logic in `navigate()` function

### Remove from package.json devDependencies
- `@types/leaflet`

## Phase 8: Testing

### High Priority
- [ ] IIIF image loading and tile display
- [ ] Rectangle annotation rendering
- [ ] Fullscreen toggle with new element ID

### Medium Priority
- [ ] SVG polygon annotation rendering
- [ ] Search hit annotations (yellow styling)
- [ ] Per-annotation visibility toggles
- [ ] Hover tooltips
- [ ] Canvas navigation

### Low Priority
- [ ] Theme compatibility (dark/light)

## Files Summary

### Create
| File | Description |
|------|-------------|
| `src/lib/components/OSDViewer.svelte` | OpenSeadragon + Annotorious viewer |
| `src/lib/utils/annotationAdapter.ts` | IIIF → Annotorious format conversion |

### Rename
| From | To |
|------|-----|
| `MiradorViewer.svelte` | `TriiiceratopsViewer.svelte` |

### Modify
| File | Changes |
|------|---------|
| `package.json` | Remove leaflet, add openseadragon + annotorious |
| `src/App.svelte` | Update import |
| `src/lib/state/viewer.svelte.ts` | Add `visibleAnnotationIds`, remove `targetBounds`, update element ID |
| `src/lib/components/AnnotationOverlay.svelte` | Remove rendering, keep list UI |
| `src/lib/components/SearchPanel.svelte` | Remove `targetBounds` logic |

### Delete
| File | Reason |
|------|--------|
| `LeafletViewer.svelte` | Replaced by OSDViewer |
| `IIIFLayer.ts` | Leaflet-specific |

## References

- [Annotorious Documentation](https://annotorious.dev/)
- [Annotorious OpenSeadragon Guide](https://annotorious.dev/guides/openseadragon-iiif/)
- [Annotorious Events API](https://annotorious.dev/api-reference/events/)
- [Annotorious Filter API](https://annotorious.dev/api-reference/filter/)
- [Annotorious DrawingStyle API](https://annotorious.dev/api-reference/drawing-style/)
- [OpenSeadragon Documentation](https://openseadragon.github.io/)
