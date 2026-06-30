<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLButtonAttributes } from 'svelte/elements';

    type Variant =
        | 'default'
        | 'primary'
        | 'neutral'
        | 'success'
        | 'warning'
        | 'error';
    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends HTMLButtonAttributes {
        variant?: Variant;
        size?: Size;
        /** Square button sized to its height, fully rounded. */
        circle?: boolean;
        /** Square button sized to its height, normal radius. */
        square?: boolean;
        /** Transparent background until hover/focus. */
        ghost?: boolean;
        /** Transparent with colored border/text until hover/focus. */
        outline?: boolean;
        /** Force the pressed/active visual state. */
        active?: boolean;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        variant = 'default',
        size = 'md',
        circle = false,
        square = false,
        ghost = false,
        outline = false,
        active = false,
        class: className = '',
        style = '',
        children,
        ...rest
    }: Props = $props();

    // The button is driven entirely through custom properties. Setting them
    // inline per variant/size keeps a single static `.btn` rule (and avoids Svelte
    // pruning dynamically-applied utility classes).
    const VARIANT_VARS: Record<Variant, string> = {
        default: '',
        primary:
            '--btn-color:var(--color-primary);--btn-fg:var(--color-primary-content);',
        neutral:
            '--btn-color:var(--color-neutral);--btn-fg:var(--color-neutral-content);',
        success:
            '--btn-color:var(--color-success);--btn-fg:var(--color-success-content);',
        warning:
            '--btn-color:var(--color-warning);--btn-fg:var(--color-warning-content);',
        error: '--btn-color:var(--color-error);--btn-fg:var(--color-error-content);',
    };
    // [--fontsize, --btn-p, size multiplier of --size-field]
    const SIZE_VARS: Record<Size, string> = {
        xs: '--fontsize:0.6875rem;--btn-p:0.5rem;--size:calc(var(--size-field,0.25rem)*6);',
        sm: '--fontsize:0.75rem;--btn-p:0.75rem;--size:calc(var(--size-field,0.25rem)*8);',
        md: '--fontsize:0.875rem;--btn-p:1rem;--size:calc(var(--size-field,0.25rem)*10);',
        lg: '--fontsize:1.125rem;--btn-p:1.25rem;--size:calc(var(--size-field,0.25rem)*12);',
    };

    let computedStyle = $derived(
        `${SIZE_VARS[size]}${VARIANT_VARS[variant]}${style}`,
    );
</script>

<button
    class="btn {className}"
    class:circle
    class:square
    class:ghost
    class:outline
    class:active
    style={computedStyle}
    {...rest}
>
    {@render children?.()}
</button>

<style>
    .btn {
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        cursor: pointer;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        font-weight: 600;
        height: var(--size);
        padding-inline: var(--btn-p);
        font-size: var(--fontsize, 0.875rem);
        color: var(--btn-fg);
        background-color: var(--btn-bg);
        border-width: var(--border);
        border-style: solid;
        border-color: var(--btn-border);
        border-start-start-radius: var(--join-ss, var(--radius-field));
        border-start-end-radius: var(--join-se, var(--radius-field));
        border-end-end-radius: var(--join-ee, var(--radius-field));
        border-end-start-radius: var(--join-es, var(--radius-field));
        outline-offset: 2px;
        outline-color: var(--btn-color, var(--content));
        text-shadow: 0 0.5px oklch(100% 0 0 / calc(var(--depth) * 0.15));
        box-shadow:
            0 0.5px 0 0.5px oklch(100% 0 0 / calc(var(--depth) * 6%)) inset,
            var(--btn-shadow);
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);

        /* defaults (overridable via inline size/variant vars) */
        --size: calc(var(--size-field, 0.25rem) * 10);
        --btn-bg: var(--btn-color, var(--toolbar-bg));
        --btn-fg: var(--content);
        --btn-p: 1rem;
        --btn-border: color-mix(in oklab, var(--btn-bg), #000 calc(var(--depth) * 5%));
        --btn-shadow:
            0 3px 2px -2px
                color-mix(in oklab, var(--btn-bg) calc(var(--depth) * 30%), #0000),
            0 4px 3px -2px
                color-mix(in oklab, var(--btn-bg) calc(var(--depth) * 30%), #0000);
    }

    @media (hover: hover) {
        .btn:hover {
            --btn-bg: color-mix(
                in oklab,
                var(--btn-color, var(--toolbar-bg)),
                #000 7%
            );
        }
    }

    .btn:focus-visible {
        isolation: isolate;
        outline-width: 2px;
        outline-style: solid;
    }

    .btn:active:not(.active) {
        --btn-bg: color-mix(
            in oklab,
            var(--btn-color, var(--toolbar-bg)),
            #000 5%
        );
        --btn-border: color-mix(
            in oklab,
            var(--btn-color, var(--toolbar-bg)),
            #000 7%
        );
        --btn-shadow:
            0 0 0 0 oklch(0% 0 0 / 0),
            0 0 0 0 oklch(0% 0 0 / 0);
        translate: 0 0.5px;
    }

    .btn.active {
        --btn-bg: color-mix(
            in oklab,
            var(--btn-color, var(--toolbar-bg)),
            #000 7%
        );
    }

    .btn:disabled,
    .btn[disabled] {
        pointer-events: none;
        --btn-border: #0000;
        --btn-fg: color-mix(in oklch, var(--content) 20%, #0000);
    }

    .btn:disabled:not(.ghost):not(.outline),
    .btn[disabled]:not(.ghost):not(.outline) {
        background-color: color-mix(
            in oklab,
            var(--content) 10%,
            transparent
        );
        box-shadow: none;
    }

    .circle {
        width: var(--size);
        height: var(--size);
        border-radius: 3.40282e38px;
        padding-inline: 0;
    }

    .square {
        width: var(--size);
        height: var(--size);
        padding-inline: 0;
    }

    /* Ghost: transparent until interaction; text takes the variant color
       (falls back to base-content for the default variant). */
    .ghost {
        --btn-bg: transparent;
        --btn-border: transparent;
        --btn-fg: var(--btn-color, var(--content));
        box-shadow: none;
        text-shadow: none;
    }
    @media (hover: hover) {
        .ghost:hover {
            --btn-bg: color-mix(
                in oklab,
                var(--content) 10%,
                transparent
            );
        }
    }
    .ghost:active:not(.active),
    .ghost.active {
        --btn-bg: color-mix(in oklab, var(--content) 10%, transparent);
        --btn-border: transparent;
    }

    /* Outline: colored border/text until interaction, then fills. */
    .outline:not(:hover):not(:active):not(:focus-visible):not(.active):not(
            :disabled
        ):not([disabled]) {
        --btn-bg: transparent;
        --btn-fg: var(--btn-color, var(--content));
        --btn-border: var(--btn-color, var(--content));
        box-shadow: none;
        text-shadow: none;
    }
</style>
