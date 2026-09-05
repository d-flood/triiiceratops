---
'triiiceratops': patch
---

test(consumers): automate the promise that the framework subpaths need no Svelte at type-check time.

SPEC's testing decisions require at least one type-test consumer that compiles with `skipLibCheck: false` and no Svelte installed, so a Svelte type leak fails the build. Nothing automated it: `strict-osd-types` sets `skipLibCheck: false` but installs `svelte` and imports the `.` entry, `docs-examples` installs `svelte` and skips lib checks, and the two framework fixtures were plain JavaScript with no `tsc` step at all. Every measurement of the promise had been a human running `tsc` by hand.

`framework-react` and `framework-vue` — which already install exactly the right dependency set and no Svelte — now each carry a `tsconfig.json` (`skipLibCheck: false`, `strict`, `types: []`) and a `check` script the packed driver runs before the build. The programs use the subpaths' real exports rather than importing them bare: the component rendered with props from every tier (React's as JSX, in a `.tsx`), the hooks and composables called and their results consumed, each error class narrowed to, and every exported type annotating a value. Between them they cover `./react`, `./vue`, `./selectors`, and `./testing`; `.` stays exempt by decision and is asserted absent from the program, alongside the compiler options themselves, so retiring the guarantee fails the fixture rather than passing quietly.

Mutation-tested against real installed artifacts: planting a re-export of the compiled Svelte component into `dist/react.d.ts` and `dist/vue.d.ts`, and a `svelte` type import into `dist/state/selectors/index.d.ts` and `dist/testing/index.d.ts`, each failed the fixture's `check`; all four reverted clean.
