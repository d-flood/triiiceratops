---
search:
  exclude: true
---

# Display sync is owned by the annotation-editor plugin, not by adapters

Historically an adapter had to inject its loaded annotations into `manifestsState`
itself, so any custom adapter written per the docs persisted fine but displayed nothing
(review finding F10). We decided the plugin's internal store performs display sync
after every successful `load`/`create`/`update`/`delete`, and adapters shrink to pure
storage functions. The alternative — documenting the injection requirement — was
rejected because it defeats the product goal that a bring-your-own-server adapter be
trivial; adapters that still inject manually just overwrite with identical data.

Amended for 1.0: display sync targets the owning viewer instance's display state, not
the page-shared manifest cache it historically wrote to (`userAnnotations` moves out of
the `manifestsState` singleton), so annotations cannot leak between viewers on one page.
The ownership rule is unchanged — the plugin's store syncs, adapters never do.
