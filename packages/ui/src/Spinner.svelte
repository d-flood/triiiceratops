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
        xs: 'calc(var(--tri-size-selector,0.25rem)*4)',
        sm: 'calc(var(--tri-size-selector,0.25rem)*5)',
        md: 'calc(var(--tri-size-selector,0.25rem)*6)',
        lg: 'calc(var(--tri-size-selector,0.25rem)*7)',
        xl: 'calc(var(--tri-size-selector,0.25rem)*8)',
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
    /* A conic arc punched into a ring by the mask, rather than a `border`:
       `border-width` accepts no percentage, so a border ring would need a length
       per `size` step, while the mask's percentage stops hold the stroke at
       12.5% of the diameter at every size. `farthest-side` resolves to half the
       width, so a stop at 75% of it leaves a ring a quarter of the radius thick.
       `border-radius` is load-bearing, not decoration: the mask's final stop
       runs to the edge of the BOX, so without it the square's corners stay
       opaque and the ring renders as a diamond. */
    .loading {
        pointer-events: none;
        aspect-ratio: 1;
        vertical-align: middle;
        width: calc(var(--tri-size-selector, 0.25rem) * 6);
        display: inline-block;
        border-radius: 50%;
        background: conic-gradient(currentColor 0 270deg, #0000 0);
        mask-image: radial-gradient(farthest-side, #0000 75%, #000 0);
        animation: tri-spin 0.9s linear infinite;
    }
    @keyframes tri-spin {
        to {
            transform: rotate(1turn);
        }
    }
</style>
