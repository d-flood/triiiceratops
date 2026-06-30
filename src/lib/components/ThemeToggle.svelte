<script lang="ts">
    import CaretDown from 'phosphor-svelte/lib/CaretDown';
    import { onMount } from 'svelte';
    import { m } from '../state/i18n.svelte';
    import { DAISYUI_THEMES } from '../theme/types';

    let theme = $state('light');
    const themes = DAISYUI_THEMES;

    onMount(() => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) {
            theme = storedTheme;
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        }
        document.documentElement.setAttribute('data-theme', theme);
    });

    function onThemeChange(newTheme: string) {
        theme = newTheme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }
</script>

<div title={m.change_theme_label()} class="dropdown dropdown-end">
    <div
        tabindex="0"
        role="button"
        class="trigger"
        aria-label={m.change_theme_label()}
    >
        <div class="swatch swatch-trigger">
            <div class="dot dot-base"></div>
            <div class="dot dot-primary"></div>
            <div class="dot dot-secondary"></div>
            <div class="dot dot-accent"></div>
        </div>
        <CaretDown size={16} />
    </div>
    <div tabindex="-1" class="dropdown-content">
        <ul class="menu theme-menu">
            <li class="menu-title">{m.theme_menu_title()}</li>
            {#each themes as t (t)}
                <li>
                    <button
                        class="theme-item"
                        onclick={() => onThemeChange(t)}
                    >
                        <div data-theme={t} class="swatch swatch-preview">
                            <div class="dot dot-base"></div>
                            <div class="dot dot-primary"></div>
                            <div class="dot dot-secondary"></div>
                            <div class="dot dot-accent"></div>
                        </div>
                        <div class="theme-name">
                            {t}
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="check"
                            class:hidden={theme !== t}
                            ><path
                                d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
                            ></path></svg
                        >
                    </button>
                </li>
            {/each}
        </ul>
    </div>
</div>

<style>
    /* dropdown (focus-within reveal) */
    .dropdown {
        position: relative;
        display: inline-block;
    }
    .dropdown-content {
        position: absolute;
        z-index: 999;
        top: 1px;
        margin-top: 4rem;
        opacity: 0;
        scale: 95%;
        display: none;
        transform-origin: top;
        overflow: hidden;
        background-color: var(--color-base-200);
        color: var(--color-base-content);
        border-radius: var(--radius-box);
        border: 1px solid rgb(255 255 255 / 0.05);
        outline: 1px solid rgb(0 0 0 / 0.05);
        box-shadow: 0 25px 50px -12px #00000040;
    }
    .dropdown-end .dropdown-content {
        inset-inline-end: 0;
    }
    .dropdown:focus-within .dropdown-content {
        opacity: 1;
        scale: 100%;
        display: block;
    }
    @media (prefers-reduced-motion: no-preference) {
        .dropdown-content {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                scale 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                display 0.2s allow-discrete;
        }
    }

    /* trigger: ghost sm button (a div, so styled directly) */
    .trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        height: calc(var(--size-field, 0.25rem) * 8);
        padding-inline: 0.375rem;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: var(--radius-field);
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
                var(--color-base-content) 10%,
                transparent
            );
        }
    }
    .trigger:focus-visible {
        outline: 2px solid var(--color-base-content);
        outline-offset: 2px;
    }

    .swatch {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.125rem;
        flex-shrink: 0;
        padding: 0.25rem;
        border-radius: 0.375rem;
        background-color: var(--color-base-100);
    }
    .swatch-trigger {
        border: 1px solid color-mix(in oklab, var(--color-base-content) 10%, transparent);
        transition: border-color 0.2s;
    }
    .trigger:hover .swatch-trigger {
        border-color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
    }
    .swatch-preview {
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
    }
    .dot {
        width: 0.25rem;
        height: 0.25rem;
        border-radius: 9999px;
    }
    .dot-base {
        background-color: var(--color-base-content);
    }
    .dot-primary {
        background-color: var(--color-primary);
    }
    .dot-secondary {
        background-color: var(--color-secondary);
    }
    .dot-accent {
        background-color: var(--color-accent);
    }

    /* menu */
    .menu {
        display: flex;
        flex-flow: column nowrap;
        width: fit-content;
        padding: 0.5rem;
        font-size: 0.875rem;
    }
    .theme-menu {
        width: 14rem;
        height: 30.5rem;
        max-height: calc(100vh - 8.6rem);
        overflow-y: auto;
    }
    .menu-title {
        color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
        padding-block: 0.5rem;
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 600;
    }
    .theme-item {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(auto, max-content) auto max-content;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        text-align: start;
        border-radius: var(--radius-field);
        padding-block: 0.375rem;
        padding-inline: 0.5rem;
        cursor: pointer;
        background-color: transparent;
        border: 0;
        color: inherit;
        transition:
            color 0.2s,
            background-color 0.2s,
            box-shadow 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    @media (hover: hover) {
        .theme-item:hover {
            background-color: color-mix(
                in oklab,
                var(--color-base-content) 10%,
                transparent
            );
        }
    }
    .theme-name {
        width: 8rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .check {
        height: 0.75rem;
        width: 0.75rem;
        flex-shrink: 0;
    }
    .check.hidden {
        visibility: hidden;
    }
</style>
