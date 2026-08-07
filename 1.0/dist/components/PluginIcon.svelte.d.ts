import type { IconDescriptor } from '../types/plugin';
interface Props {
    /** The sanitized descriptor produced by `svgIcon`. */
    descriptor: IconDescriptor;
    /** Square edge length in px (or any CSS length). Defaults to 24. */
    size?: number | string;
    /** Overrides the default `currentColor` fill. */
    color?: string;
    /** Extra class(es) applied to the root `<svg>`. */
    class?: string;
    /**
     * Accessible label. When provided the icon is exposed as an image with
     * this name; otherwise it is hidden from assistive technology, letting
     * the surrounding control own the accessible name (the common case).
     */
    label?: string;
}
declare const PluginIcon: import("svelte").Component<Props, {}, "">;
type PluginIcon = ReturnType<typeof PluginIcon>;
export default PluginIcon;
