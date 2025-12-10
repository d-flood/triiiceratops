<script lang="ts">
    import CaretDown from 'phosphor-svelte/lib/CaretDown';
    import { onMount } from 'svelte';

    let theme = $state('light');

    const themes = [
        'light',
        'dark',
        'cupcake',
        'bumblebee',
        'emerald',
        'corporate',
        'synthwave',
        'retro',
        'cyberpunk',
        'valentine',
        'halloween',
        'garden',
        'forest',
        'aqua',
        'lofi',
        'pastel',
        'fantasy',
        'wireframe',
        'black',
        'luxury',
        'dracula',
        'cmyk',
        'autumn',
        'business',
        'acid',
        'lemonade',
        'night',
        'coffee',
        'winter',
        'dim',
        'nord',
        'sunset',
    ];

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

<div title="Change Theme" class="dropdown dropdown-end">
    <div
        tabindex="0"
        role="button"
        class="btn group btn-sm gap-1.5 px-1.5 btn-ghost"
        aria-label="Change Theme"
    >
        <div
            class="bg-base-100 group-hover:border-base-content/20 border-base-content/10 grid shrink-0 grid-cols-2 gap-0.5 rounded-md border p-1 transition-colors"
        >
            <div class="bg-base-content size-1 rounded-full"></div>
            <div class="bg-primary size-1 rounded-full"></div>
            <div class="bg-secondary size-1 rounded-full"></div>
            <div class="bg-accent size-1 rounded-full"></div>
        </div>
        <CaretDown size={16} />
    </div>
    <div
        tabindex="-1"
        class="dropdown-content bg-base-200 text-base-content rounded-box top-px h-122 max-h-[calc(100vh-8.6rem)] overflow-y-auto border border-white/5 shadow-2xl outline outline-black/5 mt-16"
    >
        <ul class="menu w-56">
            <li class="menu-title text-xs">Theme</li>
            {#each themes as t}
                <li>
                    <button class="gap-3 px-2" onclick={() => onThemeChange(t)}>
                        <div
                            data-theme={t}
                            class="bg-base-100 grid shrink-0 grid-cols-2 gap-0.5 rounded-md p-1 shadow-sm"
                        >
                            <div
                                class="bg-base-content size-1 rounded-full"
                            ></div>
                            <div class="bg-primary size-1 rounded-full"></div>
                            <div class="bg-secondary size-1 rounded-full"></div>
                            <div class="bg-accent size-1 rounded-full"></div>
                        </div>
                        <div class="w-32 truncate">
                            {t}
                        </div>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class={theme === t
                                ? 'h-3 w-3 shrink-0'
                                : 'invisible h-3 w-3 shrink-0'}
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
