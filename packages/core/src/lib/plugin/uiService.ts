/**
 * Core-owned plugin UI service.
 *
 * Today this is icon rendering: a plugin passes its {@link IconDescriptor} (from
 * the SDK's `svgIcon`) and a container, and core renders it through the same
 * `<svg>`-wrapper component the toolbar uses ({@link PluginIcon}), owning
 * dimensions, `currentColor`, focusability, and accessibility. The descriptor
 * carries only sanitized inner markup, so core — not the plugin — decides how
 * the icon looks and is announced.
 *
 * The instance is per activation; `renderIcon` returns a cleanup the caller runs
 * when the icon is no longer needed.
 */

import { mount, unmount } from 'svelte';

import PluginIcon from '../components/PluginIcon.svelte';
import type { IconDescriptor, PluginUiService } from '../types/plugin';

/** Create a per-activation UI service. */
export function createPluginUiService(): PluginUiService {
    return {
        renderIcon(icon: IconDescriptor, container: HTMLElement): () => void {
            const instance = mount(PluginIcon, {
                target: container,
                props: { descriptor: icon },
            });
            return () => {
                void unmount(instance);
            };
        },
    };
}
