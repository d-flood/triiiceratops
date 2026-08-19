/**
 * State inventory for {@link ViewerState}.
 *
 * A hand-authored, reviewed, machine-readable classification of every mutable
 * member of the live `ViewerState` object that plugins receive (ADR 0007:
 * `ViewerState` is the sole plugin-facing state surface). It is checked in and
 * reviewed — never generated. `state-inventory.test.ts` reflects over a
 * constructed instance and fails if any mutable member is missing here (the
 * "unclassified member fails CI" gate); the notification capability matrix
 * builds on top of it.
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
 *                 fetch flags, renderer readiness). Readable and notifying, no
 *                 mutator.
 * - `internal`  — no contract; changeable in a patch release and excluded from
 *                 the documented API (TS `private` fields and transient UI
 *                 bookkeeping that has no plugin-facing meaning).
 * - `query-only`— high-frequency/per-frame values readable on demand but never
 *                 notifying — the viewport's scale, centre, bounds, and
 *                 container size. Reading them reactively is a `frame`-cadence
 *                 selector choice, not a reclassification.
 *
 * **`query-only` members may still list commands.** The viewport is both: its
 * values are read per frame and never notify, while `zoomIn`, `panTo`, and
 * `fitCanvas` are exactly the parity-rule commands the viewer's own chrome
 * uses. Splitting it into a notifying member and a query member would have
 * meant either waking every subscriber per pointer sample or leaving the
 * chrome's own zoom unreachable from a plugin. `command` members MUST list
 * their mutators; `observable` and `internal` members must list none.
 *
 * Query-only members are reflected as getter-only accessors rather than as
 * mutable fields — they are questions asked of the renderer, not stored values
 * — so `state-inventory.test.ts` reflects both shapes.
 *
 * Direct property assignment stays physically possible (the object is not
 * sealed); it is an unsupported escape hatch carrying no semver or invariant
 * guarantees (ADR 0007).
 *
 * The inventory is also the home of the reactive-collection invariant — see
 * {@link REACTIVE_COLLECTION_MEMBERS}.
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
     * The supported mutation method(s) on `ViewerState`.
     *
     * Required for `command` members. Optional for `query-only` ones, where it
     * records which commands move the value (the viewport case); forbidden for
     * `observable` and `internal` ones, which by definition have no mutator.
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
        member: 'startTemporalOffset',
        classification: 'internal',
        notes: 'Manifest-load bookkeeping beside startCanvasId: the media time the manifest `start` named, held until auto-selection navigates to that canvas. No plugin contract — the navigation publishes it as temporalOffset.',
    },
    {
        member: 'initialCanvasRegion',
        classification: 'command',
        commands: ['setInitialCanvasRegion'],
        notes: 'Content-state initial viewport region input.',
    },
    {
        member: 'temporalOffset',
        classification: 'observable',
        notes: "The media time the last navigation carried — a structure item's `#t=`, a manifest `start`, a content-state target — or null when it carried none. Observable rather than command state: no command targets it, and it cannot be set on its own. It is an output of navigation, replaced whole (or nulled) by every navigation as a fact about the one that just happened; `setCanvas`'s optional offset argument supplies that fact rather than writing the member independently. Core carries the value and never acts on it; a canvas claimant interprets it as a seek, and its `endSeconds` is carried but never enforced.",
    },
    {
        member: 'selectedChoices',
        classification: 'command',
        commands: ['selectChoice'],
        notes: 'Reactive SvelteMap of canvasId -> choiceId (IIIF Choice); declared as a plain Map (see REACTIVE_COLLECTION_MEMBERS).',
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
            'showVisibleCanvasAnnotations',
            'setAnnotationVisible',
            'setAllAnnotationsVisible',
        ],
        notes: 'Reactive SvelteSet of visible annotation ids; declared as a plain Set (see REACTIVE_COLLECTION_MEMBERS). showVisibleCanvasAnnotations is the default pass over every canvas on screen: the spread in paged, the folios the viewport meets in continuous.',
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
        notes: 'Set on annotation hover by the overlay and panel.',
    },
    {
        member: 'activeAnnotationId',
        classification: 'command',
        commands: ['setActiveAnnotationId'],
        notes: 'The SELECTED annotation, as distinct from the hovered one: set by tapping a shape on the image (the gesture the renderer reserves for selection) and read by the panel, the connector lines, and the shape overlay. A command by the parity rule — the viewer chrome selects annotations, so a plugin must be able to; the command toggles when handed the id already selected.',
    },
    {
        member: 'userAnnotations',
        classification: 'command',
        commands: ['setUserAnnotations', 'clearUserAnnotations'],
        notes: 'Per-viewer plugin-written annotation display state (SvelteMap keyed by manifestId::canvasId, declared as a plain Map — see REACTIVE_COLLECTION_MEMBERS). Lives on ViewerState rather than the page-shared manifest cache (ADR 0007) so annotations never leak between viewers; the annotation-editor store display-syncs through these commands.',
    },

    // ---- Manifest readiness (per-viewer view of the shared cache) ------------
    {
        member: 'loadedManifestIds',
        classification: 'observable',
        notes: 'Manifest ids this viewer has finished loading (SvelteSet, declared as a plain Set — see REACTIVE_COLLECTION_MEMBERS). Core adds to it at manifest-load completion, giving subscribers a manifest-readiness notification; queried via isManifestReady().',
    },

    // ---- Active locale (per-viewer i18n contract) ----------------------------
    {
        member: 'activeLocale',
        classification: 'observable',
        notes: "This viewer's active locale (BCP-47): config.locale if set, else the page default (CONTEXT.md Active locale). Observable — readable and notifying, no plugin-facing mutator; locale is controlled through config.locale. Core (the viewer root) mirrors the resolved value onto it when the config or page locale changes (like isFullScreen); all chrome renders in it.",
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

    // ---- Gallery placement ---------------------------------------------------
    {
        member: 'dockSide',
        classification: 'command',
        commands: ['setDockSide'],
        notes: 'Dock edge; setDockSide keeps the derived docked flags in sync.',
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
    // ---- Errors ---------------------------------------------------------------
    {
        member: 'tileSourceError',
        classification: 'observable',
        notes: 'Tile-source auth/load failure written by core in response to a renderer load failure; no mutator. Per-canvas error state inside the renderer (`renderer/canvasErrors.ts`) is the source of truth, and this is the DERIVED viewer-level view of it — raised only once every canvas laid out has failed, which in continuous mode is effectively unreachable (the layout is the whole manifest and metadata is lazy, so a canvas nobody has scrolled to has no error entry and counts as working) and in the single-canvas case is exactly right, because the chrome for it is a full cover over the renderer and raising it while a sibling folio still works would blank a working viewer mid-scroll. Deliberately NOT joined by a per-canvas member: the per-canvas record is renderer instrumentation (the host test handle’s `getCanvasErrors`), like the residency and decoded-byte counters beside it, kept out of the plugin-facing surface.',
    },

    // ---- Viewport -------------------------------------------------------------
    {
        member: 'rendererPort',
        classification: 'internal',
        notes: 'The mounted renderer’s command/query seam (attachRenderer). Core-internal and deliberately non-reactive: putting a renderer handle on the notification path would be a pass-through. `rendererReady` is the notifying signal.',
    },
    {
        member: 'frameListeners',
        classification: 'internal',
        notes: 'Frame-cadence fan-out set behind subscribeFrame. Plain Set, not reactive: a frame tick must not wake the batched state watcher.',
    },
    {
        member: 'unsubscribeFrame',
        classification: 'internal',
        notes: 'Live detach handle for the renderer’s animation events; non-null exactly while a port exists and someone is listening.',
    },
    {
        member: 'tickingPort',
        classification: 'internal',
        notes: 'Which port `unsubscribeFrame` belongs to, so a renderer swap re-attaches instead of leaving the ticker on the departed one.',
    },
    {
        member: 'surfaceTapListeners',
        classification: 'internal',
        notes: 'Surface-tap fan-out set behind subscribeSurfaceTap. Plain Set, not reactive, like frameListeners — a tap is delivered to its listeners, not published as state.',
    },
    {
        member: 'unsubscribeSurfaceTap',
        classification: 'internal',
        notes: 'Live detach handle for the renderer’s tap events; non-null exactly while a port is attached. Not lazy like unsubscribeFrame: a tap is human-rate, so there is no idle loop to avoid.',
    },
    {
        member: 'visibleCanvasIds',
        classification: 'observable',
        notes: 'The canvases the reader is looking at, in layout order — one canvas in individuals, the whole spread in paged, the folios the viewport meets in continuous. Only the renderer can answer it, so core writes it; the host republishes it when the SET changes rather than per frame, which is what makes an observable safe here. The annotation panel, the shape overlay and the connector all scope themselves to it (via the annotatableCanvasIds derived read).',
    },
    {
        member: 'rendererReady',
        classification: 'observable',
        notes: 'Whether a renderer has a sized surface and accepts viewport commands. Core writes it from attachRenderer; no mutator. Not the old OSD-readiness signal renamed — there is no object to hand over.',
    },
    {
        member: 'imageAdjustments',
        classification: 'command',
        commands: ['setImageAdjustments', 'resetImageAdjustments'],
        notes: 'Brightness/contrast/saturation/invert/grayscale applied to the rendered image. Command state rather than a reach into the renderer’s DOM node: it survives a remount and is testable with no renderer.',
    },
    {
        member: 'viewportInset',
        classification: 'command',
        commands: ['setViewportInset', 'resetViewportInset'],
        notes: 'Edges of the surface a plugin has reserved, which fits frame into. Same shape as imageAdjustments: one unkeyed value, merge-over-current, negative or non-finite edges refused at set time. Not reactive beyond notifying — the renderer READS it when it fits, so nothing replays and setting it never moves the current view.',
    },
    {
        member: 'viewportScale',
        classification: 'query-only',
        commands: ['zoomIn', 'zoomOut', 'zoomTo', 'fitBounds', 'fitCanvas'],
        notes: 'Screen pixels per canvas-space unit. Per-frame, so non-notifying; read reactively through a `frame`-cadence selector.',
    },
    {
        member: 'viewportCentre',
        classification: 'query-only',
        commands: ['panTo', 'fitBounds', 'fitCanvas'],
        notes: 'Canvas-space point at the middle of the viewport. Per-frame, so non-notifying.',
    },
    {
        member: 'viewportBounds',
        classification: 'query-only',
        commands: ['panTo', 'zoomTo', 'fitBounds', 'fitCanvas'],
        notes: 'Canvas-space box the viewport shows. Derived from scale and centre; per-frame, so non-notifying.',
    },
    {
        member: 'containerSize',
        classification: 'query-only',
        notes: 'Surface size in CSS pixels. Changes only on resize, but it is a renderer measurement rather than viewer state and is read on demand beside the other viewport queries. No command: the host sizes the surface, not a plugin.',
    },

    // ---- The paint hook -------------------------------------------------------
    {
        member: 'paintLayerRevision',
        classification: 'internal',
        notes: 'Bumped when a paint layer is registered or released, so the renderer host repaints a layer that arrived while the viewport was idle. Reactive, unlike the layer LIST behind it: registration happens a handful of times per session where drawing happens per frame.',
    },
    {
        member: 'paintLayerRegistry',
        classification: 'internal',
        notes: 'The ordered paint-layer registry behind registerPaintLayer (`renderer/paintLayers.ts`). Held here rather than in the renderer host so a layer may be registered before a renderer mounts and survives a remount. Not reactive: it is read once per painted frame.',
    },
    {
        member: 'paintLayers',
        classification: 'internal',
        notes: 'The registry’s ordered snapshot, read by the renderer host once per painted frame. Internal rather than query-only: a plugin registers a layer and is called back, it does not read the list — and a per-frame read that is not viewer state would only invite polling.',
    },

    // ---- Overlay layers -------------------------------------------------------
    {
        member: 'overlayLayerRevision',
        classification: 'internal',
        notes: 'Bumped when an overlay layer is registered or disposed, so the render site places or removes its container. Deliberately the same shape as paintLayerRevision — the two registries are structurally identical so there is one idiom to learn.',
    },
    {
        member: 'overlayLayerRegistry',
        classification: 'internal',
        notes: 'The overlay layer registry behind registerOverlayLayer (`renderer/overlayLayers.ts`). Held here rather than at the render site so a layer may be registered before a renderer mounts and survives a remount. Not reactive: the revision counter above is the signal.',
    },
    {
        member: 'overlayLayers',
        classification: 'internal',
        notes: 'The registry’s registration-ordered snapshot, read by the render site. Internal rather than command state: a plugin registers a layer and receives a dispose, it does not mutate this list. Carries no contract, exactly as paintLayers does not; a test that reads it back to prove register/release symmetry is reading an internal.',
    },

    // ---- Transport chrome -----------------------------------------------------
    {
        member: 'transportChromeRevision',
        classification: 'internal',
        notes: 'Bumped when transport chrome is registered or disposed, so the control bar renders or removes the playback controls. The same shape as overlayLayerRevision, for the same reason.',
    },
    {
        member: 'transportChromeRegistry',
        classification: 'internal',
        notes: 'The transport chrome registry behind registerTransportChrome (`state/transportChrome.ts`). Held here rather than at the control bar so a claimant may register before the bar renders and survives its remount. Not reactive: the revision counter above is the signal.',
    },
    {
        member: 'transportChrome',
        classification: 'internal',
        notes: 'The registry’s registration-ordered snapshot, read by the control bar, which renders the first. Internal rather than command state, exactly as overlayLayers is: a claimant registers chrome and receives a dispose, it does not mutate this list. Playback facts are the claimant’s published state, which is where a host reads them.',
    },

    // ---- Canvas claims --------------------------------------------------------
    {
        member: 'claimedCanvases',
        classification: 'command',
        commands: ['claimCanvas', 'unregisterPlugin', 'destroyAllPlugins'],
        notes: "The canvas claim set: SvelteMap of canvasId -> claiming pluginId, held privately and read through a ReadonlyMap getter, so one-claimant-per-canvas cannot be bypassed by writing to the collection (the overlay registry is private for the same reason). `command`, not `internal`, unlike that registry: a layer is a container core hands back to its one registrant, while WHICH canvases a plugin has taken over is a fact about the viewer that hosts and wrappers select over — which of two AV canvases is the plugin's, whether a canvas is claimable at all. Released by the claim's own dispose and, as a backstop, by unregisterPlugin/destroyAllPlugins.",
    },

    {
        member: 'companionPhases',
        classification: 'internal',
        notes: "The companion phase per claimed canvas: SvelteMap of canvasId -> CompanionPhase, written by setCompanionPhase and cleared with the claim (the claim's own dispose, and unregisterPlugin/destroyAllPlugins as backstops). `internal` for the reason overlayLayers and transportChrome are, and unlike claimedCanvases beside it: a claimant issues a command and core holds the result for its own rendering, so there is no enum for a host to select over. The one host-facing question — is this canvas showing a companion — is answered by the isPaintingCompanion() boolean, which is why the map is private and not a readable collection. `internal` therefore never notifies (ADR 0008): a Svelte host's read of isPaintingCompanion() re-runs anyway because the map is a SvelteMap (see REACTIVE_COLLECTION_MEMBERS), but a host watching through subscribe() must poll it. Reclassifying to `command` is the change to make if that ever bites.",
    },

    // ---- Plugin registration -------------------------------------------------
    {
        member: 'pluginMenuButtons',
        classification: 'command',
        commands: [
            'registerSdkChrome',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
        notes: 'Toolbar buttons contributed by plugins; managed only through plugin registration methods.',
    },
    {
        member: 'pluginPanels',
        classification: 'command',
        commands: [
            'registerSdkChrome',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
    },
    {
        member: 'pluginFlyouts',
        classification: 'command',
        commands: [
            'registerSdkChrome',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
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
            'registerSdkChrome',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
        notes: "SvelteMap of per-plugin { open, visible, target, position } UI state, read back through isPluginOpen/getPluginTarget/getPluginPosition. `command`, not `internal`: the viewer's own toolbar button opens and closes a plugin's panel/flyout, so by the parity rule the plugin must be able to observe it (this is what an SDK plugin's PluginContext.surface projects). A TS `private` field, but its contract is public through those accessors.",
    },
    {
        member: 'publishedPluginStates',
        classification: 'command',
        commands: [
            'publishPluginState',
            'unregisterPlugin',
            'destroyAllPlugins',
        ],
        notes: "SvelteMap of pluginId -> the one state object that plugin published (ADR 0018), read back through getPluginState. Inventoried like the other plugin-registration members: the notifying fact is the SET OF PUBLISHED IDS, which is how a wrapper knows whether to render a plugin's controls at all. What is inside a published object is the plugin's own contract — its members carry their own command/observable/query-only classification, checked by the SDK conformance kit rather than by this table — so core never watches into it and a query-only member ticking at frame rate can never wake this watcher.",
    },

    // ---- Internal / transitional --------------------------------------------
    {
        member: 'annotationEditBus',
        classification: 'internal',
        notes: 'Transitional per-viewer edit channel shared by the annotation shape overlay and the annotation-editor plugin; mutated by direct reassignment, no stable contract yet (the annotation editor returns with the phase-2 drawing layer).',
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
        notes: 'Private host reporter for the structured `viewererror` channel; wired by the viewer component, null in direct/test use.',
    },
    {
        member: 'viewerElement',
        classification: 'internal',
        notes: 'Private reference to the viewer DOM element, used for fullscreen.',
    },
];

/**
 * Public `ViewerState` members that MUST hold a reactive collection
 * (`SvelteSet`/`SvelteMap` from `svelte/reactivity`) at runtime.
 *
 * These members are declared as the plain built-ins `Set`/`Map` — which
 * `SvelteSet`/`SvelteMap` extend — so that `svelte/reactivity` never reaches
 * core's published declaration graph and Svelte is not a type-time requirement
 * for a React or Vue framework wrapper consumer. That is a deliberate trade: the
 * type system no longer prevents assigning a plain `Set`/`Map` over one of these
 * members, and a plain collection would silently stop notifying subscribers
 * (`trackWatchedMembers` reads a reactive collection's size and version to wake
 * the batched notification — ADR 0008). Direct assignment onto `ViewerState` is
 * already an unsupported escape hatch (ADR 0007), so the invariant lives here
 * and in `state-inventory.test.ts`, which asserts a constructed instance still
 * holds reactive collections for every member listed below.
 *
 * Core itself must never replace one of these members with a plain collection;
 * commands mutate the existing collection in place or assign a fresh
 * `SvelteSet`/`SvelteMap`.
 */
export const REACTIVE_COLLECTION_MEMBERS: readonly string[] = [
    'visibleAnnotationIds',
    'userAnnotations',
    'loadedManifestIds',
    'selectedChoices',
    'claimedCanvases',
    'companionPhases',
];
