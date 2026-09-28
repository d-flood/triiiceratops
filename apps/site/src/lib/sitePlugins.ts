import type { ComponentProps } from 'svelte';

type PluginsProp = NonNullable<
    ComponentProps<
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer']
    >['plugins']
>;

export type SitePlugin = Extract<PluginsProp, readonly unknown[]>[number];
