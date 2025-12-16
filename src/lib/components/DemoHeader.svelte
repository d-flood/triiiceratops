<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import ThemeToggle from './ThemeToggle.svelte';
    import { m, language } from '../state/i18n.svelte';
    import {
        availableLanguageTags,
        setLanguageTag,
    } from '../paraglide/runtime.js';

    import { onMount } from 'svelte';

    const SUGGESTED_MANIFESTS = [
        {
            label: 'Wellcome Collection (b18035723)',
            url: 'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
        },
        {
            label: 'Self-Portrait Dedicated to Paul Gauguin',
            url: 'https://iiif.harvardartmuseums.org/manifests/object/299843',
        },
        {
            label: 'CSNTM (MNTGRCP40)',
            url: 'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
        },
        {
            label: 'Bodleian Library MS. Ind. Inst. Misc. 22',
            url: 'https://iiif.bodleian.ox.ac.uk/iiif/manifest/e32a277e-91e2-4a6d-8ba6-cc4bad230410.json',
        },
        {
            label: 'Yugoslavia',
            url: 'https://zavicajna.digitalna.rs/iiif/api/presentation/3/96571949-03d6-478e-ab44-a2d5ad68f935%252F00000001%252Fostalo01%252F00000071/manifest',
        },
    ];

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
    } = $props();

    onMount(() => {
        if (!manifestUrl) {
            manifestUrl = SUGGESTED_MANIFESTS[0].url;
            onLoad();
        }
    });

    let isCustom = $derived(
        !SUGGESTED_MANIFESTS.some((m) => m.url === manifestUrl),
    );

    function handleSelectChange(e: Event) {
        const value = (e.currentTarget as HTMLSelectElement).value;
        if (value !== 'custom') {
            manifestUrl = value;
            onLoad();
        } else {
            manifestUrl = '';
        }
    }

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
        for="manifest-select"
        class="text-base-content text-sm whitespace-nowrap"
    >
        {m.iiif_manifest_label()}
    </label>

    <!-- Container for Select + Input -->
    <div class="flex gap-2 flex-1 items-center">
        <select
            id="manifest-select"
            class="select select-bordered flex-1 max-w-xs"
            value={isCustom ? 'custom' : manifestUrl}
            onchange={handleSelectChange}
        >
            {#each SUGGESTED_MANIFESTS as manifest}
                <option value={manifest.url}>{manifest.label}</option>
            {/each}
            <option value="custom">Try your own...</option>
        </select>

        {#if isCustom}
            <input
                id="manifest-input"
                type="text"
                bind:value={manifestUrl}
                onkeydown={handleKeydown}
                placeholder={m.manifest_placeholder()}
                class="input input-bordered flex-1 fade-in"
                autocomplete="off"
            />
        {/if}
    </div>

    {#if isCustom}
        <button onclick={onLoad} class="btn btn-primary"> {m.load()} </button>
    {/if}

    <select
        class="select select-bordered select-sm w-auto"
        value={language.current}
        onchange={(e) => setLanguageTag(e.currentTarget.value)}
        aria-label="Select language"
    >
        {#each availableLanguageTags as lang}
            <option value={lang}>{languageNames[lang] || lang}</option>
        {/each}
    </select>

    <div class="join">
        <input
            class="join-item btn btn-sm"
            type="radio"
            name="viewerMode"
            aria-label="Core"
            value="core"
            bind:group={viewerMode}
        />
        <input
            class="join-item btn btn-sm"
            type="radio"
            name="viewerMode"
            aria-label="Full"
            value="image"
            bind:group={viewerMode}
        />
    </div>

    <ThemeToggle />
    <div class="tooltip tooltip-bottom" data-tip={m.github()}>
        <a href="https://github.com/d-flood/triiiceratops" class="btn btn-ghost">
            <GithubLogo size={24} />
        </a>
    </div>
</header>
