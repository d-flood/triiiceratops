<script lang="ts">
    import DemoIcon from './DemoIcon.svelte';
    import { m } from './i18n.svelte';

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
        <DemoIcon name="moonFill" size={18} />
    {:else}
        <DemoIcon name="sunFill" size={18} />
    {/if}
</button>

<style>
    .trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 2rem;
        width: 2rem;
        border-radius: 4px;
        border: 1px solid transparent;
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
                currentColor 10%,
                transparent
            );
        }
    }
    .trigger:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }
</style>
