<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';
    type Color =
        | 'primary'
        | 'secondary'
        | 'accent'
        | 'neutral'
        | 'info'
        | 'success'
        | 'warning'
        | 'error';

    interface Props extends Omit<HTMLInputAttributes, 'size'> {
        value?: number;
        size?: Size;
        color?: Color;
        class?: string;
        style?: string;
    }

    let {
        value = $bindable(),
        size = 'md',
        color,
        class: className = '',
        style = '',
        ...rest
    }: Props = $props();

    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--size-selector,0.25rem)*4)',
        sm: 'calc(var(--size-selector,0.25rem)*5)',
        md: 'calc(var(--size-selector,0.25rem)*6)',
        lg: 'calc(var(--size-selector,0.25rem)*7)',
    };
    let computedStyle = $derived(
        `--range-thumb-size:${SIZE[size]};${color ? `color:var(--color-${color});` : ''}${style}`,
    );
</script>

<input
    type="range"
    class="range {className}"
    bind:value
    style={computedStyle}
    {...rest}
/>

<style>
    .range {
        -webkit-appearance: none;
        appearance: none;
        --range-thumb: var(--input-bg);
        --range-thumb-size: calc(var(--size-selector, 0.25rem) * 6);
        --range-progress: currentColor;
        --range-fill: 1;
        --range-p: 0.25rem;
        --range-bg: color-mix(in oklab, currentColor 10%, #0000);
        cursor: pointer;
        vertical-align: middle;
        --radius-selector-max: calc(var(--radius-selector) * 3);
        border-radius: calc(
            var(--radius-selector) + min(var(--range-p), var(--radius-selector-max))
        );
        width: clamp(3rem, 20rem, 100%);
        height: var(--range-thumb-size);
        background-color: #0000;
        border: none;
        overflow: hidden;
    }

    .range:focus {
        outline: none;
    }
    .range:focus-visible {
        outline-offset: 2px;
        outline: 2px solid;
    }

    .range::-webkit-slider-runnable-track {
        background-color: var(--range-bg);
        border-radius: var(--radius-selector);
        width: 100%;
        height: calc(var(--range-thumb-size) * 0.5);
    }
    .range::-webkit-slider-thumb {
        box-sizing: border-box;
        border-radius: calc(
            var(--radius-selector) + min(var(--range-p), var(--radius-selector-max))
        );
        background-color: var(--range-thumb);
        height: var(--range-thumb-size);
        width: var(--range-thumb-size);
        border: var(--range-p) solid;
        -webkit-appearance: none;
        appearance: none;
        color: var(--range-progress);
        box-shadow:
            0 -1px oklch(0% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 8px 0 -4px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 1px color-mix(in oklab, currentColor calc(var(--depth) * 10%), #0000),
            0 0 0 2rem var(--range-thumb) inset,
            calc(
                    (var(--range-dir, 1) * -100rem) -
                        (var(--range-dir, 1) * var(--range-thumb-size) / 2)
                )
                0 0 calc(100rem * var(--range-fill));
        position: relative;
        top: 50%;
        transform: translateY(-50%);
    }

    .range::-moz-range-track {
        background-color: var(--range-bg);
        border-radius: var(--radius-selector);
        width: 100%;
        height: calc(var(--range-thumb-size) * 0.5);
    }
    .range::-moz-range-thumb {
        box-sizing: border-box;
        border-radius: calc(
            var(--radius-selector) + min(var(--range-p), var(--radius-selector-max))
        );
        height: var(--range-thumb-size);
        width: var(--range-thumb-size);
        border: var(--range-p) solid;
        color: var(--range-progress);
        box-shadow:
            0 -1px oklch(0% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 8px 0 -4px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 1px color-mix(in oklab, currentColor calc(var(--depth) * 10%), #0000),
            0 0 0 2rem var(--range-thumb) inset,
            calc(
                    (var(--range-dir, 1) * -100rem) -
                        (var(--range-dir, 1) * var(--range-thumb-size) / 2)
                )
                0 0 calc(100rem * var(--range-fill));
        background-color: currentColor;
        position: relative;
        top: 50%;
    }

    .range:disabled {
        cursor: not-allowed;
        opacity: 0.3;
    }
</style>
