<script lang="ts">
    import type { HTMLAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        size?: Size;
        class?: string;
        style?: string;
    }

    let {
        size = 'md',
        class: className = '',
        style = '',
        ...rest
    }: Props = $props();

    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--size-selector,0.25rem)*4)',
        sm: 'calc(var(--size-selector,0.25rem)*5)',
        md: 'calc(var(--size-selector,0.25rem)*6)',
        lg: 'calc(var(--size-selector,0.25rem)*7)',
        xl: 'calc(var(--size-selector,0.25rem)*8)',
    };
    let computedStyle = $derived(`width:${SIZE[size]};${style}`);
</script>

<span
    class="loading {className}"
    style={computedStyle}
    role="status"
    aria-live="polite"
    {...rest}
></span>

<style>
    .loading {
        pointer-events: none;
        aspect-ratio: 1;
        vertical-align: middle;
        width: calc(var(--size-selector, 0.25rem) * 6);
        background-color: currentColor;
        display: inline-block;
        mask-image: url("data:image/svg+xml,%3Csvg width='24' height='24' stroke='black' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cg transform-origin='center'%3E%3Ccircle cx='12' cy='12' r='9.5' fill='none' stroke-width='3' stroke-linecap='round'%3E%3CanimateTransform attributeName='transform' type='rotate' from='0 12 12' to='360 12 12' dur='2s' repeatCount='indefinite'/%3E%3Canimate attributeName='stroke-dasharray' values='0,150;42,150;42,150' keyTimes='0;0.475;1' dur='1.5s' repeatCount='indefinite'/%3E%3Canimate attributeName='stroke-dashoffset' values='0;-16;-59' keyTimes='0;0.475;1' dur='1.5s' repeatCount='indefinite'/%3E%3C/circle%3E%3C/g%3E%3C/svg%3E");
        mask-position: 50%;
        mask-size: 100%;
        mask-repeat: no-repeat;
    }
</style>
