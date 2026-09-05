<!--
    A themed native `<select>`.

    The design system carries two select primitives because they buy different
    things. `Select` renders a custom listbox so the OPEN popup can be themed,
    coloured, and rounded like the rest of the chrome; it costs roughly 10 KB of
    listbox, positioning, and keyboard machinery to do it. This one is the
    browser's own control with the same closed-state skin — the popup is
    UA-rendered and cannot be styled, which is the whole of the trade.

    Reach for this wherever the popup's appearance is not worth its weight, and
    for anything on the shipped element's critical path. Reach for `Select` when
    the open list has to match the surrounding theme.
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLSelectAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends Omit<HTMLSelectAttributes, 'size'> {
        value?: unknown;
        size?: Size;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        value = $bindable(),
        size = 'md',
        class: className = '',
        style = '',
        children,
        ...rest
    }: Props = $props();

    // Height multipliers and font sizes are `Button`'s, not this control's own,
    // so a select and a button of the same `size` line up in a control row.
    const SIZE: Record<Size, string> = {
        xs: '--size:calc(var(--tri-size-field,0.25rem)*6);--fontsize:0.6875rem;',
        sm: '--size:calc(var(--tri-size-field,0.25rem)*8);--fontsize:0.75rem;',
        md: '--size:calc(var(--tri-size-field,0.25rem)*10);--fontsize:0.875rem;',
        lg: '--size:calc(var(--tri-size-field,0.25rem)*12);--fontsize:1.125rem;',
    };
    let computedStyle = $derived(`${SIZE[size]}${style}`);
</script>

<select
    class="native-select {className}"
    style={computedStyle}
    bind:value
    {...rest}
>
    {@render children?.()}
</select>

<style>
    .native-select {
        appearance: none;
        vertical-align: middle;
        /* `Select`'s field width, so the two are interchangeable in a layout. */
        width: clamp(3rem, 20rem, 100%);
        max-width: 100%;
        height: var(--size);
        font-size: var(--fontsize, 0.875rem);
        color: inherit;
        text-align: start;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
        touch-action: manipulation;
        /* Right padding clears the caret drawn in the background. */
        padding-inline: 0.75rem 1.75rem;
        border: var(--tri-border) solid var(--input-color);
        background-color: var(--tri-input-bg);
        border-start-start-radius: var(--join-ss, var(--tri-radius-buttons));
        border-start-end-radius: var(--join-se, var(--tri-radius-buttons));
        border-end-end-radius: var(--join-ee, var(--tri-radius-buttons));
        border-end-start-radius: var(--join-es, var(--tri-radius-buttons));
        box-shadow:
            0 1px
                color-mix(
                    in oklab,
                    var(--input-color) calc(var(--tri-depth) * 10%),
                    #0000
                )
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--tri-depth) * 0.1)) inset;
        /* Two triangles rather than an SVG: `appearance: none` removes the UA
           caret, and this draws the same one `Select` does with no data URI to
           percent-encode. */
        background-image:
            linear-gradient(45deg, #0000 50%, currentColor 50%),
            linear-gradient(135deg, currentColor 50%, #0000 50%);
        background-position:
            calc(100% - 20px) calc(1px + 50%),
            calc(100% - 16.1px) calc(1px + 50%);
        background-repeat: no-repeat;
        background-size:
            4px 4px,
            4px 4px;
        --input-color: color-mix(in oklab, var(--tri-content) 20%, #0000);
        --size: calc(var(--tri-size-field, 0.25rem) * 10);
    }

    .native-select:hover:not(:disabled) {
        --input-color: color-mix(in oklab, var(--tri-content) 40%, #0000);
    }

    .native-select:focus-visible {
        --input-color: var(--tri-content);
        box-shadow: 0 1px
            color-mix(
                in oklab,
                var(--input-color) calc(var(--tri-depth) * 10%),
                #0000
            );
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
        z-index: 1;
    }

    .native-select:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--tri-panel-bg);
        background-color: var(--tri-panel-bg);
        color: color-mix(in oklab, var(--tri-content) 40%, transparent);
    }

    /* The options belong to the caller, and the popup they appear in is the
       platform's. Engines that do paint option colours read them from here, and
       without this a dark theme renders light text on the UA's light default. */
    .native-select :global(option) {
        background-color: var(--tri-input-bg);
        color: var(--tri-content);
    }
</style>
