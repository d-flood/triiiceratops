<script lang="ts">
    import { onMount } from 'svelte';

    import CopyLine from './CopyLine.svelte';
    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import HeroPanel from './HeroPanel.svelte';
    import { HERO_EXAMPLE } from './examples';
    import {
        HERO_CYCLE_START,
        HERO_START,
        advance,
        heroSnippet,
        heroTheme,
        retreat,
        stepAt,
        type Cycle,
        type HeroSettings,
        type Knob,
    } from './heroConfigurations';

    let { headline, lede }: { headline: string; lede: string } = $props();

    let settings = $state<HeroSettings>(HERO_START);
    let cycle = $state<Cycle>(HERO_CYCLE_START);
    let cycling = $state(false);
    let beat = $state(0);

    onMount(() => {
        const start = () => {
            cycling = true;
        };
        if (document.readyState === 'complete') {
            start();
            return;
        }
        addEventListener('load', start, { once: true });
        return () => removeEventListener('load', start);
    });

    $effect(() => {
        void beat;
        if (!cycling) return;
        const timer = setTimeout(forward, dwell);
        return () => clearTimeout(timer);
    });

    const themed = $derived(heroTheme(settings));
    const snippet = $derived(heroSnippet(settings));
    const dwell = $derived(stepAt(cycle).dwell);

    function forward() {
        const next = advance(cycle);
        settings = next.settings;
        cycle = next.cycle;
        beat += 1;
    }

    function back() {
        const previous = retreat(cycle);
        settings = previous.settings;
        cycle = previous.cycle;
        beat += 1;
    }

    function toggle() {
        cycling = !cycling;
        beat += 1;
    }

    function set(knob: Knob, value: string) {
        settings = knob.write(settings, value);
        cycling = false;
        beat += 1;
    }
</script>

<div class="hero">
    <h1>{headline}</h1>
    <p class="hero__lede">{lede}</p>
    <p class="hero__note">
        A fifth the size of viewers like Mirador and Universal Viewer while
        supporting more IIIF Cookbook recipes than either.
        <a href="/size/">See the measurements</a>
    </p>
</div>

<div class="heroband">
    <div class="heroband__stage">
        <EmbeddedViewer
            fill
            eager
            example={HERO_EXAMPLE}
            config={settings.config}
            theme={themed.theme}
            themeConfig={themed.themeConfig}
            label="Live viewer"
        />
    </div>
    <HeroPanel
        {settings}
        {set}
        {cycling}
        {beat}
        {dwell}
        at={cycle.at}
        onBack={back}
        onForward={forward}
        onToggle={toggle}
    />
</div>

<div class="herocode">
    <CopyLine text={snippet} label="viewer configuration" language="ts" />
</div>
