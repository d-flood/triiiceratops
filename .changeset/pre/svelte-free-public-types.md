---
'triiiceratops': patch
---

keep Svelte out of the published type surface: `ViewerState`'s four reactive-collection members (`visibleAnnotationIds`, `userAnnotations`, `loadedManifestIds`, `selectedChoices`) are now declared as plain `Set`/`Map` while still holding `SvelteSet`/`SvelteMap` at runtime, so `triiiceratops` declarations resolve with no `svelte` package installed. Reactivity and notifications are unchanged; the invariant that these members hold reactive collections now lives in the state inventory (`REACTIVE_COLLECTION_MEMBERS`), and `build:lib` fails if a Svelte type import reappears in the published declaration graph.
