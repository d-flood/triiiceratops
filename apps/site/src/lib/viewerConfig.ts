import type { ComponentProps } from 'svelte';

export type ViewerConfig = NonNullable<
    ComponentProps<
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer']
    >['config']
>;
