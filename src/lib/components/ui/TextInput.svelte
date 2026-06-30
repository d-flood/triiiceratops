<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends Omit<HTMLInputAttributes, 'size'> {
        value?: string;
        size?: Size;
        /** Transparent until focus. */
        ghost?: boolean;
        class?: string;
        style?: string;
    }

    let {
        value = $bindable(),
        size = 'md',
        ghost = false,
        type = 'text',
        class: className = '',
        style = '',
        ...rest
    }: Props = $props();

    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--size-field,0.25rem)*6)',
        sm: 'calc(var(--size-field,0.25rem)*8)',
        md: 'calc(var(--size-field,0.25rem)*10)',
        lg: 'calc(var(--size-field,0.25rem)*12)',
    };
    let computedStyle = $derived(`--size:${SIZE[size]};${style}`);
</script>

<input
    {type}
    class="input {className}"
    class:ghost
    bind:value
    style={computedStyle}
    {...rest}
/>

<style>
    .input {
        cursor: text;
        border: var(--border) solid var(--input-color);
        appearance: none;
        background-color: var(--input-bg);
        vertical-align: middle;
        width: clamp(3rem, 20rem, 100%);
        height: var(--size);
        font-size: max(var(--font-size, 0.875rem), 0.875rem);
        touch-action: manipulation;
        box-shadow:
            0 1px
                color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000)
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        --size: calc(var(--size-field, 0.25rem) * 10);
        --input-color: color-mix(in oklab, var(--content) 20%, #0000);
        border-start-start-radius: var(--join-ss, var(--radius-field));
        border-start-end-radius: var(--join-se, var(--radius-field));
        border-end-end-radius: var(--join-ee, var(--radius-field));
        border-end-start-radius: var(--join-es, var(--radius-field));
        flex-shrink: 1;
        align-items: center;
        gap: 0.5rem;
        padding-inline: 0.75rem;
        display: inline-flex;
        position: relative;
        color: inherit;
    }

    .input:focus,
    .input:focus-within {
        --input-color: var(--content);
        box-shadow: 0 1px
            color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000);
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
        z-index: 1;
    }

    .input:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--panel-bg);
        background-color: var(--panel-bg);
        color: color-mix(in oklab, var(--content) 40%, transparent);
        box-shadow: none;
    }
    .input:is(:disabled, [disabled])::placeholder {
        color: color-mix(in oklab, var(--content) 20%, transparent);
    }

    .ghost {
        box-shadow: none;
        background-color: #0000;
        border-color: #0000;
    }
    .ghost:focus,
    .ghost:focus-within {
        background-color: var(--input-bg);
        color: var(--content);
        box-shadow: none;
        border-color: #0000;
    }
</style>
