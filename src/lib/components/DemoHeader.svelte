<script lang="ts">
    import GithubLogo from 'phosphor-svelte/lib/GithubLogo';
    import ThemeToggle from './ThemeToggle.svelte';

    let { manifestUrl = $bindable(), onLoad } = $props();

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            onLoad();
        }
    }
</script>

<header class="p-4 bg-base-200 flex gap-4 items-center shrink-0">
    <a href="/triiiceratops/" class="btn btn-outline btn-primary">Docs</a>
    <label
        for="manifest-input"
        class="text-base-content text-sm whitespace-nowrap"
    >
        IIIF Manifest:
    </label>
    <input
        id="manifest-input"
        type="text"
        bind:value={manifestUrl}
        onkeydown={handleKeydown}
        placeholder="Enter IIIF manifest URL"
        class="input input-bordered flex-1"
    />
    <button onclick={onLoad} class="btn btn-primary"> Load </button>
    <ThemeToggle />
    <div class="tooltip tooltip-bottom" data-tip="GitHub">
        <a href="https://github.com/dflood/triiiceratops" class="btn btn-ghost">
            <GithubLogo size={24} />
        </a>
    </div>
</header>
