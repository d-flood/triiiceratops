<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLSelectAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends Omit<HTMLSelectAttributes, 'size'> {
        value?: unknown;
        size?: Size;
        /** Transparent until focus. */
        ghost?: boolean;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        value = $bindable(),
        size = 'md',
        ghost = false,
        class: className = '',
        style = '',
        children,
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

<select
    class="select {className}"
    class:ghost
    bind:value
    style={computedStyle}
    {...rest}
>
    {@render children?.()}
</select>

<style>
    .select {
        border: var(--border) solid var(--input-color);
        appearance: none;
        background-color: var(--input-bg);
        vertical-align: middle;
        width: clamp(3rem, 20rem, 100%);
        height: var(--size);
        touch-action: manipulation;
        white-space: nowrap;
        text-overflow: ellipsis;
        box-shadow:
            0 1px
                color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000)
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        --input-color: color-mix(in oklab, var(--content) 20%, #0000);
        --size: calc(var(--size-field, 0.25rem) * 10);
        background-image: linear-gradient(45deg, #0000 50%, currentColor 50%),
            linear-gradient(135deg, currentColor 50%, #0000 50%);
        background-position:
            calc(100% - 20px) calc(1px + 50%),
            calc(100% - 16.1px) calc(1px + 50%);
        background-repeat: no-repeat;
        background-size:
            4px 4px,
            4px 4px;
        border-start-start-radius: var(--join-ss, var(--radius-field));
        border-start-end-radius: var(--join-se, var(--radius-field));
        border-end-end-radius: var(--join-ee, var(--radius-field));
        border-end-start-radius: var(--join-es, var(--radius-field));
        flex-shrink: 1;
        align-items: center;
        gap: 0.375rem;
        padding-inline: 0.75rem 1.75rem;
        font-size: 0.875rem;
        display: inline-flex;
        position: relative;
        cursor: pointer;
        color: inherit;
    }

    .select:focus,
    .select:focus-within {
        --input-color: var(--content);
        box-shadow: 0 1px
            color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000);
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
        z-index: 1;
    }

    .select:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--panel-bg);
        background-color: var(--panel-bg);
        color: color-mix(in oklab, var(--content) 40%, transparent);
    }

    .ghost {
        box-shadow: none;
        background-color: #0000;
        border-color: #0000;
        transition: background-color 0.2s;
    }
    .ghost:focus,
    .ghost:focus-within {
        background-color: var(--input-bg);
        color: var(--content);
        box-shadow: none;
        border-color: #0000;
    }
</style>
