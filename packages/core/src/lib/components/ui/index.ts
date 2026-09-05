// Re-export shim: the UI primitive components live in the internal, unpublished
// `@triiiceratops/ui` package so core and the first-party plugins render the
// same themed controls. The package ships Svelte SOURCE and is bundled into
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
