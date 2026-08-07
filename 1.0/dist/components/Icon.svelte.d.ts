import { type IconName, type IconWeight } from '../generated/icons';
interface Props {
    /** Phosphor glyph name (see scripts/icons.config.ts). */
    name: IconName;
    /** Square edge length in px (or any CSS length). Defaults to 24. */
    size?: number | string;
    /** Glyph weight. Defaults to `regular`. */
    weight?: IconWeight;
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
declare const Icon: import("svelte").Component<Props, {}, "">;
type Icon = ReturnType<typeof Icon>;
export default Icon;
