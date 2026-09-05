<script lang="ts">
    /*
     * The demo chrome's icon renderer, over the demo's own glyph table
     * (`./icons.ts`). Deliberately not core's `Icon.svelte`: that resolves
     * through the generated manifest, and a glyph only the demo draws would then
     * ship in every element artifact.
     */
    import { DEMO_ICONS, type DemoIconName } from './icons';

    let {
        name,
        size = 24,
        class: className,
        label,
    }: {
        name: DemoIconName;
        /** Square edge length in px (or any CSS length). */
        size?: number | string;
        class?: string;
        /**
         * Accessible label. Without one the glyph is hidden from assistive
         * technology so the surrounding control owns the accessible name.
         */
        label?: string;
    } = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="currentColor"
    class={className}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
    focusable="false"
>
    <path d={DEMO_ICONS[name]} />
</svg>
