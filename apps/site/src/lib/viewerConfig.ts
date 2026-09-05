/**
 * The viewer's configuration type, taken from the component that consumes it.
 *
 * The package does not export `ViewerConfig` from a public entrypoint, and
 * widening a package's exports is not this application's business. Reading the
 * type off the component's own prop is exact by construction and cannot drift:
 * whatever the component accepts is what this names.
 */

import type { ComponentProps } from 'svelte';

export type ViewerConfig = NonNullable<
    ComponentProps<
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer']
    >['config']
>;
