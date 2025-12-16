<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import ThemeToggle from './ThemeToggle.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { manifestsState } from '../state/manifests.svelte';
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
        canvasId = $bindable(''),
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

    let canvases = $derived(
        manifestUrl ? manifestsState.getCanvases(manifestUrl) : [],
    );

    function getCanvasLabel(canvas: any, index: number) {
        try {
            if (canvas.getLabel) {
                const l = canvas.getLabel();
                if (Array.isArray(l) && l.length > 0) return l[0].value;
                if (typeof l === 'string') return l;
            } else if (canvas.label) {
                if (typeof canvas.label === 'string') return canvas.label;
                if (
                    typeof canvas.label === 'object' &&
                    !Array.isArray(canvas.label)
                ) {
                    const keys = Object.keys(canvas.label);
                    if (keys.length > 0) {
                        const val = canvas.label[keys[0]];
                        if (Array.isArray(val)) return val[0];
                        return val;
                    }
                }
            }
        } catch (e) {
            /* ignore */
        }
        return `Canvas ${index + 1}`;
    }

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

<header class="flex flex-col bg-base-200 shrink-0 border-b border-base-300">
    <!-- Top Row: Branding & Global Settings -->
    <div class="flex gap-4 items-center p-2 px-4 border-b border-base-300/50">
        <a href="/triiiceratops/" class="btn btn-sm btn-ghost font-bold text-lg"
            >Triiiceratops</a
        >
        <a href="/triiiceratops/" class="btn btn-sm btn-outline btn-primary"
            >{m.docs()}</a
        >

        <div class="flex-1"></div>

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

        <select
            class="select select-bordered select-sm w-auto"
            value={language.current}
            onchange={(e) => setLanguageTag(e.currentTarget.value as any)}
            aria-label="Select language"
        >
            {#each availableLanguageTags as lang}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </select>

        <ThemeToggle />
        <div class="tooltip tooltip-bottom" data-tip={m.github()}>
            <a
                href="https://github.com/d-flood/triiiceratops"
                class="btn btn-ghost btn-sm"
            >
                <GithubLogo size={20} />
            </a>
        </div>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="flex gap-4 items-center p-2 px-4 bg-base-300/30">
        <span class="text-xs font-bold uppercase tracking-wider opacity-70"
            >External Controls:</span
        >

        <!-- Manifest Selector -->
        <div class="flex gap-2 items-center">
            <label
                for="manifest-select"
                class="text-base-content text-sm whitespace-nowrap sr-only"
            >
                {m.iiif_manifest_label()}
            </label>
            <div class="flex gap-2 items-center">
                <select
                    id="manifest-select"
                    class="select select-bordered select-xs max-w-xs"
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
                        class="input input-bordered input-xs w-[300px] fade-in"
                        autocomplete="off"
                    />
                    <button onclick={onLoad} class="btn btn-primary btn-xs">
                        {m.load()}
                    </button>
                {/if}
            </div>
        </div>

        <div class="w-px h-4 bg-base-content/20 mx-2"></div>

        <!-- Canvas Selector -->
        <div class="flex gap-2 items-center">
            <label class="text-xs opacity-70" for="canvas-id-select">
                Active Canvas
            </label>
            <select
                id="canvas-id-select"
                bind:value={canvasId}
                class="select select-bordered select-xs w-[200px]"
                disabled={canvases.length === 0}
            >
                {#if canvases.length === 0}
                    <option value="" disabled>No canvases loaded</option>
                {:else}
                    {#each canvases as canvas, i}
                        <option value={canvas.id}>
                            {getCanvasLabel(canvas, i)}
                        </option>
                    {/each}
                {/if}
            </select>
        </div>
    </div>
</header>
