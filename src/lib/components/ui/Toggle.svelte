<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends Omit<HTMLInputAttributes, 'size'> {
        checked?: boolean;
        size?: Size;
        class?: string;
        style?: string;
    }

    let {
        checked = $bindable(),
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
    };
    let computedStyle = $derived(`--size:${SIZE[size]};${style}`);
</script>

<input
    type="checkbox"
    class="toggle {className}"
    bind:checked
    style={computedStyle}
    {...rest}
/>

<style>
    .toggle {
        border: var(--border) solid currentColor;
        color: var(--input-color);
        cursor: pointer;
        appearance: none;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        --radius-selector-max: calc(var(--radius-selector) * 3);
        border-radius: calc(
            var(--radius-selector) +
                min(var(--toggle-p), var(--radius-selector-max)) +
                min(var(--border), var(--radius-selector-max))
        );
        padding: var(--toggle-p);
        box-shadow: 0 1px
            color-mix(in oklab, currentColor calc(var(--depth) * 10%), #0000)
            inset;
        --input-color: color-mix(in oklab, var(--color-base-content) 50%, #0000);
        --toggle-p: calc(var(--size) * 0.125);
        --size: calc(var(--size-selector, 0.25rem) * 6);
        width: calc((var(--size) * 2) - (var(--border) + var(--toggle-p)) * 2);
        height: var(--size);
        flex-shrink: 0;
        grid-template-columns: 0fr 1fr 1fr;
        place-content: center;
        transition:
            color 0.3s,
            grid-template-columns 0.2s;
        display: inline-grid;
        position: relative;
    }

    .toggle::before {
        aspect-ratio: 1;
        border-radius: var(--radius-selector);
        content: '';
        height: 100%;
        box-shadow:
            0 -1px oklch(0% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 8px 0 -4px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 1px color-mix(in oklab, currentColor calc(var(--depth) * 10%), #0000);
        background-color: currentColor;
        grid-row-start: 1;
        grid-column-start: 2;
        transition:
            background-color 0.1s,
            translate 0.2s,
            inset-inline-start 0.2s;
        position: relative;
        inset-inline-start: 0;
        translate: 0;
    }

    .toggle:focus-visible {
        outline-offset: 2px;
        outline: 2px solid;
    }

    .toggle:checked,
    .toggle[aria-checked='true'] {
        background-color: var(--color-base-100);
        --input-color: var(--color-base-content);
        grid-template-columns: 1fr 1fr 0fr;
    }
    .toggle:checked::before {
        background-color: currentColor;
    }

    .toggle:disabled {
        cursor: not-allowed;
        opacity: 0.3;
    }
    .toggle:disabled::before {
        border: var(--border) solid currentColor;
        background-color: #0000;
    }
</style>
