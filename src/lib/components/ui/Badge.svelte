<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';
    type Variant =
        | 'default'
        | 'primary'
        | 'secondary'
        | 'accent'
        | 'neutral'
        | 'info'
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
            '--badge-color:var(--color-primary);--badge-fg:var(--color-primary-content);',
        secondary:
            '--badge-color:var(--color-secondary);--badge-fg:var(--color-secondary-content);',
        accent: '--badge-color:var(--color-accent);--badge-fg:var(--color-accent-content);',
        neutral:
            '--badge-color:var(--color-neutral);--badge-fg:var(--color-neutral-content);',
        info: '--badge-color:var(--color-info);--badge-fg:var(--color-info-content);',
        success:
            '--badge-color:var(--color-success);--badge-fg:var(--color-success-content);',
        warning:
            '--badge-color:var(--color-warning);--badge-fg:var(--color-warning-content);',
        error: '--badge-color:var(--color-error);--badge-fg:var(--color-error-content);',
    };
    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--size-selector,0.25rem)*4)',
        sm: 'calc(var(--size-selector,0.25rem)*5)',
        md: 'calc(var(--size-selector,0.25rem)*6)',
        lg: 'calc(var(--size-selector,0.25rem)*7)',
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
        border-radius: var(--radius-selector);
        vertical-align: middle;
        color: var(--badge-fg);
        border: var(--border) solid var(--badge-color, var(--color-base-200));
        background-color: var(--badge-bg);
        --badge-bg: var(--badge-color, var(--color-base-100));
        --badge-fg: var(--color-base-content);
        --size: calc(var(--size-selector, 0.25rem) * 6);
        width: fit-content;
        height: var(--size);
        padding-inline: calc(var(--size) / 2 - var(--border));
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        display: inline-flex;
    }

    .outline {
        color: var(--badge-color);
        --badge-bg: #0000;
        border-color: currentColor;
    }

    .soft {
        color: var(--badge-color, var(--color-base-content));
        background-color: color-mix(
            in oklab,
            var(--badge-color, var(--color-base-content)) 8%,
            var(--color-base-100)
        );
        border-color: color-mix(
            in oklab,
            var(--badge-color, var(--color-base-content)) 10%,
            var(--color-base-100)
        );
    }
</style>
