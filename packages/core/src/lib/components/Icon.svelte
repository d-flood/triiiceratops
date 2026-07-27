<script lang="ts">
    /*
     * Internal icon renderer. Replaces the former runtime icon package: it
     * renders raw SVG glyph markup generated at build time from
     * `@phosphor-icons/core` (see scripts/generate-icons.ts). Core owns the
     * `<svg>` wrapper here — sizing, `currentColor` fill, and accessibility —
     * so callers pass only a glyph `name` (plus optional size/weight/color).
     */
    import { icons, type IconName, type IconWeight } from '../generated/icons';

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

    let {
        name,
        size = 24,
        weight = 'regular',
        color,
        class: className,
        label,
    }: Props = $props();

    const inner = $derived(icons[weight]?.[name] ?? icons.regular[name]);
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill={color ?? 'currentColor'}
    class={className}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
    focusable="false"
>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted build-time SVG from @phosphor-icons/core -->
    {@html inner}
</svg>
