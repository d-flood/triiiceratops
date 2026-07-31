/**
 * State inventory for {@link ViewerState}.
 *
 * A hand-authored, reviewed, machine-readable classification of every mutable
 * member of the live `ViewerState` object that plugins receive (ADR 0007:
 * `ViewerState` is the sole plugin-facing state surface). It is checked in and
 * reviewed — never generated. `state-inventory.test.ts` reflects over a
 * constructed instance and fails if any mutable member is missing here (the
 * "unclassified member fails CI" gate); ticket 04 builds the notification
 * capability matrix on top of it.
 *
 * Classification rules (binding — from CONTEXT.md glossary and the grilling
 * decisions):
 *
 * - `command`   — anything the viewer's own UI can change (the parity rule).
 *                 Readable and notifying, changed through a supported mutation
 *                 method that maintains invariants (never a bare field setter).
 *                 Every listed method exists on `ViewerState` and has at least
 *                 one behavior test.
 * - `observable`— mirrors an external fact core alone writes (network errors,
 *                 fetch flags, `osdViewer`). Readable and notifying, no mutator.
 * - `internal`  — no contract; changeable in a patch release and excluded from
 *                 the documented API (TS `private` fields and transient UI
 *                 bookkeeping that has no plugin-facing meaning).
 * - `query-only`— high-frequency/per-frame values readable on demand but never
 *                 notifying (e.g. continuous viewport position). There are no
 *                 such members on `ViewerState` today: continuous viewport
 *                 position is read from `osdViewer` (OpenSeadragon's own API),
 *                 so this classification currently has zero entries but is kept
 *                 available for future inventory decisions.
 *
 * Direct property assignment stays physically possible (the object is not
 * sealed); it is an unsupported escape hatch carrying no semver or invariant
 * guarantees (ADR 0007).
 */

export type StateClassification =
    | 'command'
    | 'observable'
    | 'internal'
    | 'query-only';

export interface StateInventoryEntry {
    /** Enumerable member name as reflected from a constructed `ViewerState`. */
    member: string;
    classification: StateClassification;
    /**
     * For `command` members, the supported mutation method(s) on `ViewerState`.
     * Required (and only meaningful) when `classification === 'command'`.
     */
    commands?: string[];
    /** Reviewer-facing rationale / parity note. */
    notes?: string;
}

export const STATE_INVENTORY: readonly StateInventoryEntry[] = [
    // ---- Core navigation & manifest selection --------------------------------
    {
        member: 'manifestId',
        classification: 'command',
        commands: ['setManifest', 'setManifestData', 'loadCollectionManifest'],
        notes: 'Active manifest; changed by loading a manifest/collection.',
    },
    {
        member: 'canvasId',
        classification: 'command',
        commands: ['setCanvas', 'nextCanvas', 'previousCanvas'],
        notes: 'Active canvas; navigation maintains paged-group invariants.',
    },
    {
        member: 'selectedSequenceIndex',
        classification: 'command',
        commands: ['setSequenceIndex'],
        notes: 'Clamped to the manifest sequence range and resets the canvas.',
    },
    {
        member: 'startCanvasId',
        classification: 'internal',
        notes: 'Manifest-load bookkeeping: mirrors the manifest `start` property (v3) or sequence `startCanvas` (v2) during auto-selection and is cleared as a control-flow flag. No plugin contract.',
    },
    {
        member: 'initialCanvasRegion',
        classification: 'command',
        commands: ['setInitialCanvasRegion'],
        notes: 'Content-state initial viewport region input.',
    },
    {
        member: 'selectedChoices',
        classification: 'command',
        commands: ['selectChoice'],
        notes: 'Reactive SvelteMap of canvasId -> choiceId (IIIF Choice).',
    },

    // ---- Panels, toolbar & chrome toggles ------------------------------------
    {
        member: 'showAnnotations',
        classification: 'command',
        commands: ['toggleAnnotations'],
        notes: 'Panel open state; toggle maintains annotation-visibility invariants (canonical non-bare-setter command).',
    },
    {
        member: 'showThumbnailGallery',
        classification: 'command',
        commands: ['toggleThumbnailGallery'],
    },
    {
        member: 'galleryExpanded',
        classification: 'command',
        commands: ['setGalleryExpanded', 'toggleGalleryExpanded'],
        notes: 'Gallery expanded to fill the center column as a grid. Orthogonal to dockSide; expanding implies showThumbnailGallery, which is why it is a command and not a field write.',
    },
    {
        member: 'toolbarOpen',
        classification: 'command',
        commands: ['toggleToolbar'],
    },
    {
        member: 'showMetadataPanel',
        classification: 'command',
        commands: ['toggleMetadataPanel'],
    },
    {
        member: 'showCanvasInfo',
        classification: 'command',
        commands: ['toggleCanvasInfo'],
    },
    {
        member: 'showStructuresPanel',
        classification: 'command',
        commands: ['toggleStructuresPanel'],
    },
    {
        member: 'showCollectionPanel',
        classification: 'command',
        commands: ['toggleCollectionPanel'],
    },
    {
        member: 'showSearchPanel',
        classification: 'command',
        commands: ['toggleSearchPanel'],
        notes: 'Closing clears ephemeral search annotations (invariant).',
    },

    // ---- Annotation overlay visibility ---------------------------------------
    {
        member: 'visibleAnnotationIds',
        classification: 'command',
        commands: [
            'showCurrentCanvasAnnotations',
            'setAnnotationVisible',
            'setAllAnnotationsVisible',
        ],
        notes: 'Reactive SvelteSet of visible annotation ids. Parity commands setAnnotationVisible/setAllAnnotationsVisible added this ticket.',
    },
    {
        member: 'annotationVisibilityTouched',
        classification: 'command',
        commands: ['setAnnotationVisible', 'setAllAnnotationsVisible'],
        notes: 'Marks that the user manually changed annotation visibility. Maintained together with visibleAnnotationIds by the visibility commands.',
    },
    {
        member: 'hoveredAnnotationId',
        classification: 'command',
        commands: ['setHoveredAnnotationId'],
        notes: 'Set on annotation hover by the overlay and panel. Parity command added this ticket.',
    },
    {
        member: 'userAnnotations',
        classification: 'command',
        commands: ['setUserAnnotations', 'clearUserAnnotations'],
        notes: 'Per-viewer plugin-written annotation display state (SvelteMap keyed by manifestId::canvasId). Moved off the page-shared manifest cache onto ViewerState (ticket 05, ADR 0007) so annotations never leak between viewers; the annotation-editor store display-syncs through these commands.',
    },

    // ---- Manifest readiness (per-viewer view of the shared cache) ------------
    {
        member: 'loadedManifestIds',
        classification: 'observable',
        notes: 'Manifest ids this viewer has finished loading (SvelteSet). Core adds to it at manifest-load completion, giving subscribers a manifest-readiness notification; queried via isManifestReady(). Added ticket 05.',
    },

    // ---- Active locale (per-viewer i18n contract) ----------------------------
    {
        member: 'activeLocale',
        classification: 'observable',
        notes: "This viewer's active locale (BCP-47): config.locale if set, else the page default (CONTEXT.md Active locale). Observable — readable and notifying, no plugin-facing mutator; locale is controlled through config.locale. Core (the viewer root) mirrors the resolved value onto it when the config or page locale changes (like isFullScreen); all chrome renders in it and ticket 08's PluginLocaleService consumes it. Added ticket 06.",
    },

    // ---- Viewing mode / direction / paging -----------------------------------
    {
        member: 'viewingMode',
        classification: 'command',
        commands: ['setViewingMode', 'updateConfig'],
        notes: 'Public accessor over _viewingMode; command re-selects the paged group when needed.',
    },
    {
        member: 'viewingDirection',
        classification: 'command',
        commands: ['updateConfig'],
        notes: 'Public accessor over _viewingDirection. User-actionable via the settings control, which flows through config -> updateConfig; also derived from the manifest.',
    },
    {
        member: 'pagedOffset',
        classification: 'command',
        commands: ['togglePagedOffset'],
    },
    {
        member: '_viewingMode',
        classification: 'internal',
        notes: 'Private $state backing field for the viewingMode accessor.',
    },
    {
        member: '_viewingDirection',
        classification: 'internal',
        notes: 'Private $state backing field for the viewingDirection accessor.',
    },
    {
        member: '_viewingModeUserConfigured',
        classification: 'internal',
        notes: 'Private flag: skips manifest behavior detection once the host configures a viewing mode.',
    },

    // ---- Configuration & host-provided inputs --------------------------------
    {
        member: 'config',
        classification: 'command',
        commands: ['updateConfig'],
        notes: 'ViewerConfig object; updateConfig fans changes out to derived state while maintaining invariants.',
    },
    {
        member: 'searchProvider',
        classification: 'command',
        commands: ['setSearchProvider'],
        notes: 'Host-supplied custom search provider.',
    },
    {
        member: 'manifestRequestConfig',
        classification: 'command',
        commands: ['setManifestRequestConfig'],
        notes: 'Host-supplied fetch options for manifest requests.',
    },

    // ---- Search --------------------------------------------------------------
    {
        member: 'searchQuery',
        classification: 'command',
        commands: ['search'],
        notes: 'The executed query; set by the search command (and by config-driven search).',
    },
    {
        member: 'searchResults',
        classification: 'observable',
        notes: 'Result groups produced by core in response to a search operation; no direct mutator.',
    },
    {
        member: 'searchAnnotations',
        classification: 'observable',
        notes: 'Search-hit overlay annotations derived by core from searchResults; read by the overlay, not directly settable.',
    },
    {
        member: 'isSearching',
        classification: 'observable',
        notes: 'Fetch flag reflecting an in-flight search operation.',
    },
    {
        member: 'pendingSearchQuery',
        classification: 'internal',
        notes: 'Deferred-search bookkeeping: holds a query issued before the manifest loaded. No plugin contract.',
    },

    // ---- Collections ---------------------------------------------------------
    {
        member: 'collectionId',
        classification: 'observable',
        notes: 'Set by core when a loaded resource resolves to a IIIF Collection.',
    },
    {
        member: 'collectionLabel',
        classification: 'observable',
        notes: 'Mirrors the loaded collection label.',
    },
    {
        member: 'collectionThumbnail',
        classification: 'observable',
        notes: 'Mirrors the loaded collection thumbnail.',
    },
    {
        member: 'collectionItems',
        classification: 'observable',
        notes: 'Parsed, sorted collection members; core writes these on load and hydrates thumbnails.',
    },

    // ---- Fullscreen ----------------------------------------------------------
    {
        member: 'isFullScreen',
        classification: 'observable',
        notes: 'Mirrors document.fullscreenElement via a fullscreenchange listener. The user-actionable behavior is the toggleFullScreen() command, which changes the underlying browser fact rather than writing this field.',
    },

    // ---- Gallery placement (floating & docked) -------------------------------
    {
        member: 'galleryPosition',
        classification: 'command',
        commands: ['setGalleryPosition'],
        notes: 'Floating gallery position; parity command added this ticket.',
    },
    {
        member: 'gallerySize',
        classification: 'command',
        commands: ['setGallerySize'],
        notes: 'Floating gallery size; parity command added this ticket.',
    },
    {
        member: 'dockSide',
        classification: 'command',
        commands: ['setDockSide'],
        notes: 'Dock edge; setDockSide keeps the derived docked flags in sync (parity command added this ticket).',
    },
    {
        member: 'isGalleryDockedBottom',
        classification: 'command',
        commands: ['setDockSide'],
        notes: 'Derived from dockSide; maintained as an invariant by setDockSide.',
    },
    {
        member: 'isGalleryDockedRight',
        classification: 'command',
        commands: ['setDockSide'],
        notes: 'Derived from dockSide; maintained as an invariant by setDockSide.',
    },
    {
        member: 'isGalleryDragging',
        classification: 'internal',
        notes: 'Transient drag-gesture bookkeeping owned by the gallery UI; no durable plugin-facing meaning.',
    },
    {
        member: 'galleryDragOffset',
        classification: 'internal',
        notes: 'Transient pointer offset captured during a gallery drag gesture.',
    },
    {
        member: 'dragOverSide',
        classification: 'internal',
        notes: 'Transient dock-preview side highlighted while dragging the gallery.',
    },
    {
        member: 'galleryCenterPanelRect',
        classification: 'internal',
        notes: 'Measured DOMRect of the center panel captured at drag start (shadow-DOM safe). Layout bookkeeping, no contract.',
    },

    // ---- Errors & OSD pass-through --------------------------------------------
    {
        member: 'tileSourceError',
        classification: 'observable',
        notes: 'Tile-source auth/load failure written by core in response to OSD errors; no mutator.',
    },
    {
        member: 'osdViewer',
        classification: 'observable',
        notes: 'Raw OpenSeadragon.Viewer set at OSD readiness (notifyOSDReady); documented pass-through, existence/timing is core API but its surface is OSD-governed (ADR 0009).',
    },

    // ---- Plugin registration -------------------------------------------------
    {
        member: 'pluginMenuButtons',
        classification: 'command',
        commands: ['registerPlugin', 'unregisterPlugin', 'destroyAllPlugins'],
        notes: 'Toolbar buttons contributed by plugins; managed only through plugin registration methods.',
    },
    {
        member: 'pluginPanels',
        classification: 'command',
        commands: ['registerPlugin', 'unregisterPlugin', 'destroyAllPlugins'],
    },
    {
        member: 'pluginFlyouts',
        classification: 'command',
        commands: ['registerPlugin', 'unregisterPlugin', 'destroyAllPlugins'],
    },
    {
        member: 'pluginUiState',
        classification: 'command',
        commands: [
            'ensurePluginUiState',
            'setPluginOpen',
            'togglePluginOpen',
            'closePluginFlyouts',
            'setPluginTarget',
            'setPluginPosition',
            'updateConfig',
            'registerPlugin',
            'registerSdkChrome',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
        notes: "SvelteMap of per-plugin { open, visible, target, position } UI state, read back through isPluginOpen/getPluginTarget/getPluginPosition. `command`, not `internal`: the viewer's own toolbar button opens and closes a plugin's panel/flyout, so by the parity rule the plugin must be able to observe it (this is what an SDK plugin's PluginContext.surface projects). A TS `private` field, but its contract is public through those accessors.",
    },

    // ---- Internal / transitional --------------------------------------------
    {
        member: 'annotationEditBus',
        classification: 'internal',
        notes: 'Transitional per-viewer edit channel shared by OSDViewer and the annotation-editor plugin; mutated by direct reassignment, no stable contract yet (annotation editor migrates in ticket 17).',
    },
    {
        member: 'collectionThumbnailHydrationId',
        classification: 'internal',
        notes: 'Private hydration race guard for collection thumbnails.',
    },
    {
        member: 'eventTarget',
        classification: 'internal',
        notes: 'Private EventTarget for the web-component build; null under Svelte usage.',
    },
    {
        member: 'errorReporter',
        classification: 'internal',
        notes: 'Private host reporter for the structured `viewererror` channel (ticket 18); wired by the viewer component, null in direct/test use.',
    },
    {
        member: 'viewerElement',
        classification: 'internal',
        notes: 'Private reference to the viewer DOM element, used for fullscreen.',
    },
];
