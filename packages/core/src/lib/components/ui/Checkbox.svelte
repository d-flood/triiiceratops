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
        checked?: boolean;
        indeterminate?: boolean;
        size?: Size;
        color?: Color;
        class?: string;
        style?: string;
    }

    let {
        checked = $bindable(),
        indeterminate = $bindable(),
        size = 'md',
        color,
        class: className = '',
        style = '',
        ...rest
    }: Props = $props();

    // [--size multiplier, padding]
    const SIZE: Record<Size, string> = {
        xs: '--size:calc(var(--size-selector,0.25rem)*4);padding:0.125rem;',
        sm: '--size:calc(var(--size-selector,0.25rem)*5);padding:0.1875rem;',
        md: '--size:calc(var(--size-selector,0.25rem)*6);padding:0.25rem;',
        lg: '--size:calc(var(--size-selector,0.25rem)*7);padding:0.3125rem;',
    };
    let computedStyle = $derived(
        `${SIZE[size]}${color ? `--input-color:var(--color-${color});` : ''}${style}`,
    );
</script>

<input
    type="checkbox"
    class="checkbox {className}"
    bind:checked
    bind:indeterminate
    style={computedStyle}
    {...rest}
/>

<style>
    .checkbox {
        border: var(--border) solid
            var(
                --input-color,
                color-mix(in oklab, var(--content) 20%, #0000)
            );
        cursor: pointer;
        appearance: none;
        border-radius: var(--radius-selector);
        vertical-align: middle;
        color: var(--content);
        box-shadow:
            0 1px oklch(0% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 0 #0000 inset,
            0 0 #0000;
        --size: calc(var(--size-selector, 0.25rem) * 6);
        width: var(--size);
        height: var(--size);
        flex-shrink: 0;
        padding: 0.25rem;
        transition:
            background-color 0.2s,
            box-shadow 0.2s;
        display: inline-block;
        position: relative;
    }

    .checkbox::before {
        content: '';
        opacity: 0;
        clip-path: polygon(20% 100%, 20% 80%, 50% 80%, 50% 80%, 70% 80%, 70% 100%);
        width: 100%;
        height: 100%;
        box-shadow: 0px 3px 0 0px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        background-color: currentColor;
        font-size: 1rem;
        line-height: 0.75;
        transition:
            clip-path 0.3s 0.1s,
            opacity 0.1s 0.1s,
            rotate 0.3s 0.1s,
            translate 0.3s 0.1s;
        display: block;
        rotate: 45deg;
    }

    .checkbox:focus-visible {
        outline: 2px solid var(--input-color, currentColor);
        outline-offset: 2px;
    }

    .checkbox:checked,
    .checkbox[aria-checked='true'] {
        background-color: var(--input-color, #0000);
        box-shadow:
            0 0 #0000 inset,
            0 8px 0 -4px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset,
            0 1px oklch(0% 0 0 / calc(var(--depth) * 0.1));
    }
    .checkbox:checked::before,
    .checkbox[aria-checked='true']::before {
        clip-path: polygon(20% 100%, 20% 80%, 50% 80%, 50% 0%, 70% 0%, 70% 100%);
        opacity: 1;
    }

    .checkbox:indeterminate {
        background-color: var(
            --input-color,
            color-mix(in oklab, var(--content) 20%, #0000)
        );
    }
    .checkbox:indeterminate::before {
        opacity: 1;
        clip-path: polygon(20% 100%, 20% 80%, 50% 80%, 50% 80%, 80% 80%, 80% 100%);
        translate: 0 -35%;
        rotate: none;
    }

    .checkbox:disabled {
        cursor: not-allowed;
        opacity: 0.2;
    }
</style>
