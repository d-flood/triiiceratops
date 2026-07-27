<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';
    type Variant =
        | 'default'
        | 'primary'
        | 'neutral'
        | 'success'
        | 'warning'
        | 'error';

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        variant?: Variant;
        size?: Size;
        outline?: boolean;
        soft?: boolean;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        variant = 'default',
        size = 'md',
        outline = false,
        soft = false,
        class: className = '',
        style = '',
        children,
        ...rest
    }: Props = $props();

    const VARIANT: Record<Variant, string> = {
        default: '',
        primary:
            '--badge-color:var(--tri-color-primary);--badge-color-text:var(--tri-color-primary-text);--badge-fg:var(--tri-color-primary-content);',
        neutral:
            '--badge-color:var(--tri-color-neutral);--badge-fg:var(--tri-color-neutral-content);',
        success:
            '--badge-color:var(--tri-color-success);--badge-fg:var(--tri-color-success-content);',
        warning:
            '--badge-color:var(--tri-color-warning);--badge-fg:var(--tri-color-warning-content);',
        error: '--badge-color:var(--tri-color-error);--badge-fg:var(--tri-color-error-content);',
    };
    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--tri-size-selector,0.25rem)*4)',
        sm: 'calc(var(--tri-size-selector,0.25rem)*5)',
        md: 'calc(var(--tri-size-selector,0.25rem)*6)',
        lg: 'calc(var(--tri-size-selector,0.25rem)*7)',
    };
    let computedStyle = $derived(
        `--size:${SIZE[size]};${VARIANT[variant]}${style}`,
    );
</script>

<span
    class="badge {className}"
    class:outline
    class:soft
    style={computedStyle}
    {...rest}
>
    {@render children?.()}
</span>

<style>
    .badge {
        border-radius: var(--tri-radius-selector);
        vertical-align: middle;
        color: var(--badge-fg);
        border: var(--tri-border) solid var(--badge-color, var(--tri-surface-border));
        background-color: var(--badge-bg);
        --badge-bg: var(--badge-color, var(--tri-input-bg));
        --badge-fg: var(--tri-content);
        --size: calc(var(--tri-size-selector, 0.25rem) * 6);
        width: fit-content;
        height: var(--size);
        padding-inline: calc(var(--size) / 2 - var(--tri-border));
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        display: inline-flex;
    }

    .outline {
        color: var(--badge-color-text, var(--badge-color));
        --badge-bg: #0000;
        border-color: currentColor;
    }

    .soft {
        color: var(--badge-color-text, var(--badge-color, var(--tri-content)));
        background-color: color-mix(
            in oklab,
            var(--badge-color, var(--tri-content)) 8%,
            var(--tri-input-bg)
        );
        border-color: color-mix(
            in oklab,
            var(--badge-color, var(--tri-content)) 10%,
            var(--tri-input-bg)
        );
    }
</style>
