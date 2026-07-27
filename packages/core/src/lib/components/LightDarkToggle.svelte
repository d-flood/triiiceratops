<script lang="ts">
    import Sun from 'phosphor-svelte/lib/Sun';
    import Moon from 'phosphor-svelte/lib/Moon';
    import { m } from '../state/i18n.svelte';

    // Bindable so the demo can react to the page (demo) theme. Only ever
    // 'light' or 'dark' — the demo page itself is intentionally limited to the
    // two base modes; the four built-in themes live on the viewer instead.
    let { theme = $bindable('light') }: { theme?: 'light' | 'dark' } = $props();

    function toggle() {
        theme = theme === 'dark' ? 'light' : 'dark';
    }
</script>

<button
    type="button"
    class="trigger"
    title={m.change_theme_label()}
    aria-label={m.change_theme_label()}
    aria-pressed={theme === 'dark'}
    onclick={toggle}
>
    {#if theme === 'dark'}
        <Moon size={18} weight="fill" />
    {:else}
        <Sun size={18} weight="fill" />
    {/if}
</button>

<style>
    .trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: calc(var(--size-field, 0.25rem) * 8);
        width: calc(var(--size-field, 0.25rem) * 8);
        border-radius: var(--radius-buttons);
        border: var(--border) solid transparent;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        transition:
            color 0.2s,
            background-color 0.2s,
            border-color 0.2s;
    }
    @media (hover: hover) {
        .trigger:hover {
            background-color: color-mix(
                in oklab,
                var(--content) 10%,
                transparent
            );
        }
    }
    .trigger:focus-visible {
        outline: 2px solid var(--content);
        outline-offset: 2px;
    }
</style>
