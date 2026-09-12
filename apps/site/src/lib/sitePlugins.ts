/**
 * The plugin type the viewer accepts, taken from the component's own prop.
 *
 * Same reasoning as `viewerConfig.ts`: the plugin packages type themselves
 * against the published `@triiiceratops/plugin-sdk`, and reading the type off
 * the prop that consumes it is exact by construction rather than a second
 * declaration that can drift.
 */

import type { ComponentProps } from 'svelte';

type PluginsProp = NonNullable<
    ComponentProps<
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer']
    >['plugins']
>;

export type SitePlugin = Extract<PluginsProp, readonly unknown[]>[number];
