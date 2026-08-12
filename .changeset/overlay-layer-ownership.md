---
'triiiceratops': minor
---

**Overlay layer cleanup fails closed: a layer belongs to a plugin, and dies with
it.**

An overlay layer's `id` must now be `` `${pluginId}:${name}` `` — the plugin id the
viewer knows the caller by, the same convention plugin chrome ids already follow.
Derive it from `context.surface.id`: the id core knows a plugin by is its declared
`uiId`, or its package name with unsafe characters collapsed, and it is the only
prefix accepted. An id whose prefix names no known plugin is refused with a no-op
dispose, registering nothing. That is a loud development-time failure instead of a
silent leak later, and it makes id collisions between two plugins impossible.

A refusal reaches the host: it is delivered on the structured `viewererror` channel
(the `viewererror` event and the `onviewererror` callback) with
`code: 'overlay-layer-refused'` and a new `ViewerErrorScope` member, `'plugin'`,
for a call a plugin made into `ViewerState` that was refused. Only the debug log
carried it before, and that log is a no-op unless `ViewerConfig.debug` is on — so in
a default viewer a refused layer simply rendered nothing, silently. `'plugin'` is an
added union member: a host that switches exhaustively on `scope` will want a case
for it.

**A failed plugin activation now takes its overlay layers and its UI state with
it.** Core fails closed — a plugin whose setup or mount throws renders no toolbar
button — but a plugin registers its layers from inside the mount that throws, so
that path had to start unregistering the plugin as well: otherwise the layer stayed
on the image for the session with nobody holding a dispose, the plugin's UI state
kept vouching for a plugin that does not exist, and `retry()` re-registered the same
layer id straight into the duplicate-id refusal, so a retried plugin could never
draw again.

`viewerState.unregisterPlugin(pluginId)` now disposes that plugin's overlay layers,
and `destroyAllPlugins()` disposes all of them: the container is removed and the
layer's own mount cleanup runs, by the same path the dispose returned from
`registerOverlayLayer` takes. Layers are DOM sitting on the image, so a plugin whose
teardown missed its dispose would otherwise leave markers on the picture with
nothing left to remove them.

This is a **backstop, not the documented path.** A plugin still releases its layer
from its `view.mount` cleanup, alongside its styles; doing both is safe, because the
dispose is idempotent and a layer already released is not torn down twice.

Nothing changes for `registerPaintLayer`: it has no prefix rule and no prefix
disposal. Core registers a paint layer of its own, so a mandatory plugin prefix
there would need a reserved core namespace, and a paint layer owns no DOM to orphan.

**Element size.** `size-baseline.json` is re-recorded: +551 bytes raw / +209 gzip on
the IIFE artifact and +593 raw / +215 gzip on the ESM one, over the baseline the
overlay-layer change itself recorded, plus +103 raw / +21 gzip (IIFE) and +103 raw /
+18 gzip (ESM) for routing a refusal onto the structured channel.

New ADR 0016 records why the viewer has two drawing hooks rather than one — overlay
layers are DOM because painted pixels have no focus, no accessible name, and no
keyboard reach; the paint hook is decoration or a second rendering of geometry the
DOM already carries — and that the two near-identical registries must not be
unified onto the paint hook, which would look like a simplification, keep every test
passing, and silently delete assistive-technology access to every plugin marker on
the image.
