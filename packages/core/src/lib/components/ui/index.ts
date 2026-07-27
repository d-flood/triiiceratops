// Re-export shim: the UI primitive components were extracted into the internal,
// unpublished `@triiiceratops/ui` package (restore-plugin-toolbar-chrome ticket
// 01) so core and the first-party plugins render the same themed controls. Core
// keeps importing them through this barrel path (`'../ui'` / `'./ui'`), so no
// in-core call site changed. The package ships Svelte SOURCE and is bundled into
// core at build time (never an externalized runtime dependency of the published
// artifact) — exactly as Svelte itself is already bundled.
export {
    Button,
    Toggle,
    Checkbox,
    Select,
    TextInput,
    Range,
    Badge,
    Spinner,
    Tooltip,
} from '@triiiceratops/ui';
