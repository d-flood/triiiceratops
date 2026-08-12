/**
 * The `ViewerState` members whose changes wake subscribers.
 *
 * This is the runtime half of the state inventory. `state-inventory.ts` is the
 * reviewed source of truth — 80 entries carrying classifications, mutator lists,
 * and the review prose that justifies each one — but the runtime needs exactly
 * one fact from it: which members notify. Importing the inventory to derive that
 * fact dragged its entire English commentary into every shipped bundle, so the
 * derivation is checked in here instead and the inventory stays a
 * test-and-review-only document.
 *
 * The list is the inventory's `command` and `observable` members, in inventory
 * order. `internal` and `query-only` members never notify (ADR 0008:
 * subscriptions are reactivity-driven and batched).
 *
 * **Edit this list only together with `state-inventory.ts`.**
 * `state-inventory.test.ts` recomputes the derivation and fails if the two sides
 * disagree in content or in order, so classifying a new member without listing
 * it here — or listing a member here without classifying it there — is a red
 * test, not a silent change in notification behaviour.
 */
export const NOTIFYING_MEMBERS: readonly string[] = [
    'manifestId',
    'canvasId',
    'selectedSequenceIndex',
    'initialCanvasRegion',
    'selectedChoices',
    'showAnnotations',
    'showThumbnailGallery',
    'galleryExpanded',
    'toolbarOpen',
    'showMetadataPanel',
    'showCanvasInfo',
    'showStructuresPanel',
    'showCollectionPanel',
    'showSearchPanel',
    'visibleAnnotationIds',
    'annotationVisibilityTouched',
    'hoveredAnnotationId',
    'activeAnnotationId',
    'userAnnotations',
    'loadedManifestIds',
    'activeLocale',
    'viewingMode',
    'viewingDirection',
    'pagedOffset',
    'config',
    'searchProvider',
    'manifestRequestConfig',
    'searchQuery',
    'searchResults',
    'searchAnnotations',
    'isSearching',
    'collectionId',
    'collectionLabel',
    'collectionThumbnail',
    'collectionItems',
    'isFullScreen',
    'galleryPosition',
    'gallerySize',
    'dockSide',
    'isGalleryDockedBottom',
    'isGalleryDockedRight',
    'tileSourceError',
    'visibleCanvasIds',
    'rendererReady',
    'imageAdjustments',
    'viewportInset',
    'pluginMenuButtons',
    'pluginPanels',
    'pluginFlyouts',
    'pluginUiState',
];
