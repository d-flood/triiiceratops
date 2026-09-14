/**
 * Untyped shim for private `svelte/internal/client` (see shared-svelte-runtime).
 * Stays in `src/`, outside published `src/lib/`: a shipped ambient declaration
 * would silently type this module as `any` in every consumer's project.
 */
declare module 'svelte/internal/client';
