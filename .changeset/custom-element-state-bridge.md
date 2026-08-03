---
'triiiceratops': minor
---

add the custom element's state bridge and a property-only `searchProvider` input.

`<triiiceratops-viewer>` now exposes the live per-instance `ViewerState` its viewer owns as a **getter-only** `viewerState` property on the element prototype (a Svelte instance export, so a host physically cannot replace it), paired with a new bubbling, composed `viewerstateavailable` event whose `detail` is that exact object. Availability means only that state can be bound — not that a manifest has loaded or OpenSeadragon is ready — and it is announced once per mounted state instance: ordinary state changes do not repeat it, while a disconnection that destroys the inner viewer and a later reconnection produce a new `ViewerState` and its own event. Because the property is populated before the event is dispatched, hosts bind race-free by listening then checking. `VIEWER_STATE_AVAILABLE_EVENT` and the `TriiiceratopsViewerElement` type are exported from `triiiceratops`.

The element also gains `searchProvider`, forwarded to the viewer's existing native custom-search behavior. It is a **property-only** input: assign `element.searchProvider = (query, context) => …` before or after upgrade. Svelte derives an inert `searchprovider` observed attribute from every declared prop, so one appears in the custom-element API report annotated `attributeSupported: false`; any non-function value (such as a stray attribute string) is ignored with a debug-gated warning and never reaches the search path. Existing properties, callback properties, snapshots, events, and first-wins registration are unchanged.
