<script lang="ts">
    /*
     * Renders a plugin's framework-neutral IconDescriptor (from the SDK's
     * svgIcon). Mirrors Icon.svelte's pattern: core owns the <svg>
     * wrapper — sizing, viewBox, currentColor fill, focusability, and
     * accessibility — while the descriptor carries only sanitized inner markup.
     * svgIcon has already rejected <script>, on* handlers, external href URLs,
     * and <foreignObject>, so the inner markup is safe to inject.
     */
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

    let {
        descriptor,
        size = 24,
        color,
        class: className,
        label,
    }: Props = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox={descriptor.viewBox}
    fill={color ?? 'currentColor'}
    class={className}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
    focusable="false"
>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by svgIcon() -->
    {@html descriptor.inner}
</svg>
