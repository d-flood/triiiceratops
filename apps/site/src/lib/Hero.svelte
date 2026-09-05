<script lang="ts">
    import { onMount } from 'svelte';

    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import { HERO_EXAMPLE } from './examples';
    import { HERO_CONFIGURATIONS, HERO_DWELL } from './heroConfigurations';

    /**
     * The front page's running viewer.
     *
     * It cycles arrangements of the viewer's own chrome, and it does so only
     * once the page is interactive: the prerendered markup is the first
     * arrangement, standing still, which is what a reader on a slow link or
     * with script disabled gets. A cycle that started during load would be
     * animation on the critical path of the page arguing the viewer is light.
     */
    let { headline, lede }: { headline: string; lede: string } = $props();

    let index = $state(0);
    let cycling = $state(false);

    onMount(() => {
        // Not before load: the cycle is the reward for a page that has already
        // arrived, and starting it during load would put chrome animation on
        // the critical path. Hydration can finish either side of the load
        // event, so both orders are handled.
        if (document.readyState === 'complete') {
            cycling = true;
            return;
        }
        const start = () => (cycling = true);
        addEventListener('load', start, { once: true });
        return () => removeEventListener('load', start);
    });

    const current = $derived(HERO_CONFIGURATIONS[index]);

    $effect(() => {
        if (!cycling) return;
        const timer = setInterval(() => {
            index = (index + 1) % HERO_CONFIGURATIONS.length;
        }, HERO_DWELL);
        return () => clearInterval(timer);
    });

    function show(next: number) {
        index = next;
        // A reader who has chosen an arrangement is reading it, not watching a
        // slideshow. Choosing one stops the cycle for good.
        cycling = false;
    }
</script>

<div class="hero">
    <div class="hero__grid">
        <div class="hero__say">
            <h1>{headline}</h1>
            <p class="hero__lede">{lede}</p>
        </div>

        <div class="hero__show">
            <EmbeddedViewer
                eager
                example={HERO_EXAMPLE}
                config={current.config}
                label="The viewer, running"
            />
            <div
                class="hero__pick"
                role="group"
                aria-label="Chrome arrangement"
            >
                {#each HERO_CONFIGURATIONS as arrangement, at (arrangement.label)}
                    <button
                        type="button"
                        class:on={at === index}
                        aria-pressed={at === index}
                        onclick={() => show(at)}>{arrangement.label}</button
                    >
                {/each}
            </div>
        </div>
    </div>
</div>
