<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';

    type Placement = 'top' | 'bottom' | 'left' | 'right';
    type Color =
        | 'neutral'
        | 'primary'
        | 'secondary'
        | 'accent'
        | 'info'
        | 'success'
        | 'warning'
        | 'error';

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        /** Tooltip text. */
        tip?: string;
        placement?: Placement;
        color?: Color;
        /** Force the tooltip open. */
        open?: boolean;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        tip = '',
        placement = 'top',
        color,
        open = false,
        class: className = '',
        style = '',
        children,
        ...rest
    }: Props = $props();

    let computedStyle = $derived(
        `${color ? `--tt-bg:var(--color-${color});--tt-fg:var(--color-${color}-content);` : ''}${style}`,
    );
</script>

<span
    class="tooltip {placement} {className}"
    class:tooltip-open={open}
    data-tip={tip}
    style={computedStyle}
    {...rest}
>
    {@render children?.()}
</span>

<style>
    .tooltip {
        --tt-bg: var(--color-neutral);
        --tt-fg: var(--color-neutral-content);
        --tt-off: calc(100% + 0.5rem);
        --tt-tail: calc(100% + 1px + 0.25rem);
        display: inline-block;
        position: relative;
    }

    .tooltip[data-tip]:not([data-tip=''])::before {
        border-radius: var(--radius-buttons);
        text-align: center;
        white-space: normal;
        max-width: 20rem;
        color: var(--tt-fg);
        opacity: 0;
        background-color: var(--tt-bg);
        pointer-events: none;
        z-index: 2;
        content: attr(data-tip);
        width: max-content;
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25;
        position: absolute;
    }

    .tooltip[data-tip]:not([data-tip=''])::after {
        opacity: 0;
        background-color: var(--tt-bg);
        content: '';
        pointer-events: none;
        --mask-tooltip: url("data:image/svg+xml,%3Csvg width='10' height='4' viewBox='0 0 8 4' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0.500009 1C3.5 1 3.00001 4 5.00001 4C7 4 6.5 1 9.5 1C10 1 10 0.499897 10 0H0C-1.99338e-08 0.5 0 1 0.500009 1Z' fill='black'/%3E%3C/svg%3E%0A");
        width: 0.625rem;
        height: 0.25rem;
        mask-position: -1px 0;
        mask-repeat: no-repeat;
        mask-image: var(--mask-tooltip);
        display: block;
        position: absolute;
    }

    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]::before,
        .tooltip[data-tip]::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms,
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms;
        }
    }

    .tooltip[data-tip]:not([data-tip='']):hover::before,
    .tooltip[data-tip]:not([data-tip='']):hover::after,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::before,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::after,
    .tooltip-open[data-tip]:not([data-tip=''])::before,
    .tooltip-open[data-tip]:not([data-tip=''])::after {
        opacity: 1;
        --tt-pos: 0rem;
    }
    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]:not([data-tip='']):hover::before,
        .tooltip[data-tip]:not([data-tip='']):hover::after,
        .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::before,
        .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
    }

    /* Placements */
    .top::before {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-off) 50%;
    }
    .top::after {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-tail) 50%;
    }
    .bottom::before {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 50%;
    }
    .bottom::after {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem))
            rotate(180deg);
        inset: var(--tt-tail) auto auto 50%;
    }
    .left::before {
        transform: translateX(calc(var(--tt-pos, 0.25rem) - 0.25rem))
            translateY(-50%);
        inset: 50% var(--tt-off) auto auto;
    }
    .left::after {
        transform: translateX(var(--tt-pos, 0.25rem)) translateY(-50%)
            rotate(-90deg);
        inset: 50% calc(var(--tt-tail) + 1px) auto auto;
    }
    .right::before {
        transform: translateX(calc(var(--tt-pos, -0.25rem) + 0.25rem))
            translateY(-50%);
        inset: 50% auto auto var(--tt-off);
    }
    .right::after {
        transform: translateX(var(--tt-pos, -0.25rem)) translateY(-50%)
            rotate(90deg);
        inset: 50% auto auto calc(var(--tt-tail) + 1px);
    }
</style>
