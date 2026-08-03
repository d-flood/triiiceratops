---
'triiiceratops': patch
---

The root `triiiceratops` entry is now framework-neutral: no entry except
`triiiceratops/svelte` requires the optional `svelte` peer, at runtime or at
type-check time.

Svelte consumers import from `triiiceratops/svelte`:

```diff
- import { TriiiceratopsViewer, ViewerState } from 'triiiceratops';
+ import { TriiiceratopsViewer, ViewerState } from 'triiiceratops/svelte';
```

Moved: `TriiiceratopsViewer`, the constructible `ViewerState` class,
`VIEWER_STATE_KEY`, `ManifestsState`, `manifestsState`. `triiiceratops/svelte`
re-exports the root entry, so that one specifier change is sufficient.
`ViewerState` is still a root export as a **type**. React, Vue, and
custom-element consumers are unaffected.
