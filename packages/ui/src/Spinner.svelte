<script lang="ts">
    type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

    interface Props {
        size?: Size;
        class?: string;
        style?: string;
    }

    let { size = 'md', class: className = '', style = '' }: Props = $props();

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
></span>

<style>
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
