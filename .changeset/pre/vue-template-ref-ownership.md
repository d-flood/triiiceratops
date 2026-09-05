---
'triiiceratops': patch
---

fix(vue): one template ref put on two `<TriiiceratopsViewer>`s now throws `TriiiceratopsHandleConflictError` naming both elements, instead of silently binding twice.

A handle identifies exactly one viewer. `triiiceratops/react` has enforced that since it shipped — the `useViewerHandle()` slot is handed to the binding, which claims it and throws when a second element claims the same slot. `triiiceratops/vue` could not: its handle is an ordinary template ref, which the wrapper never sees as a prop, so a ref reused on a second viewer just got overwritten and every composable reading through it silently followed whichever viewer mounted last.

The Vue wrapper now resolves the ref Vue itself recorded for the component to the BOX the value will be written into, and gives that box the substrate's own handle slot to claim — so the ownership rule, the detection, and the error message are shared with React and cannot drift. Vue's public handle type is unchanged; nothing new is exported.

Two shapes are deliberately exempt, because sharing is the intent rather than a mistake: a ref inside `v-for` (Vue collects every match into an array) and a callback ref. `<KeepAlive>` is handled explicitly — a deactivated viewer gives the ref back, since Vue has already cleared it, and takes ownership again on reactivation.

Proven on the artifact: both packed framework fixtures gained a `double-bind.html` route that installs the real tarball, puts one handle on two viewers, and asserts the same error, with the same code and both element descriptions, reaches the framework's own error handling within milliseconds.
