<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import ThemeToggle from './ThemeToggle.svelte';
    import { m, language } from '../state/i18n.svelte';
    import {
        availableLanguageTags,
        setLanguageTag,
    } from '../paraglide/runtime.js';

    let { manifestUrl = $bindable(), onLoad } = $props();

    const languageNames: Record<string, string> = {
        en: 'English',
        de: 'Deutsch',
    };

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            onLoad();
        }
    }
</script>

<header class="p-4 bg-base-200 flex gap-4 items-center shrink-0">
    <a href="/triiiceratops/" class="btn btn-outline btn-primary">{m.docs()}</a>
    <label
        for="manifest-input"
        class="text-base-content text-sm whitespace-nowrap"
    >
        {m.iiif_manifest_label()}
    </label>
    <input
        id="manifest-input"
        type="text"
        bind:value={manifestUrl}
        onkeydown={handleKeydown}
        placeholder={m.manifest_placeholder()}
        class="input input-bordered flex-1"
    />
    <button onclick={onLoad} class="btn btn-primary"> {m.load()} </button>

    <select
        class="select select-bordered select-sm w-auto"
        value={language.current}
        onchange={(e) => setLanguageTag(e.currentTarget.value)}
    >
        {#each availableLanguageTags as lang}
            <option value={lang}>{languageNames[lang] || lang}</option>
        {/each}
    </select>

    <ThemeToggle />
    <div class="tooltip tooltip-bottom" data-tip={m.github()}>
        <a href="https://github.com/dflood/triiiceratops" class="btn btn-ghost">
            <GithubLogo size={24} />
        </a>
    </div>
</header>
