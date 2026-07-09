# Undo/redo replays inverse operations through the adapter

Annotorious's built-in undo stack only mutates its in-memory store, while saves have
already hit the adapter — so undoing a create left the annotation in storage and it
resurrected on reload (review finding F6). We removed the Annotorious-backed undo/redo
UI outright (decision D1; shipping controls that resurrect deleted data is worse than
having none) and are rebuilding it as a store-owned operation stack whose `undo`/`redo`
replay inverses through the normal persistence paths, so screen and storage always
agree.
