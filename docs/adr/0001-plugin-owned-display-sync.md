# Display sync is owned by the annotation-editor plugin, not by adapters

Historically an adapter had to inject its loaded annotations into `manifestsState`
itself, so any custom adapter written per the docs persisted fine but displayed nothing
(review finding F10). We decided the plugin's internal store performs display sync
after every successful `load`/`create`/`update`/`delete`, and adapters shrink to pure
storage functions. The alternative — documenting the injection requirement — was
rejected because it defeats the product goal that a bring-your-own-server adapter be
trivial; adapters that still inject manually just overwrite with identical data.
