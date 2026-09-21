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

    /**
     * The front page's running viewer, and the settings that compose it.
     *
     * Three strips. The heading and its sentence come first, so the page's claim
     * lands before the demonstration argues it and so the document opens on its
     * own `h1`. Then one band, full width of the column, carrying the viewer and
     * the configuration surface side by side. Then the configuration itself, as
     * source a reader can copy.
     *
     * The band moves on its own once the page is interactive: the prerendered
     * markup is `HERO_START`, standing still, which is what a reader on a slow
     * link or with script disabled gets — and it is the arrangement
     * `ChromeSkeleton` draws, so the live viewer lands its chrome where the
     * markup already put it. A cycle that started during load would be animation
     * on the critical path of the page arguing the viewer is light.
     *
     * What it walks is a written route — see `HERO_SEQUENCE` — grouped into four
     * runs, each taking one part of the viewer's surface while the rest of the
     * arrangement holds still. The step that opens a run holds for a full dwell
     * and the rest of it for half, because a reader has to read a new
     * arrangement and only to notice a value change.
     *
     * The material stands still throughout. The claim being made is that the
     * chrome recomposes without remounting, and material moving underneath it
     * is the one thing that could be mistaken for the chrome being rebuilt.
     */
    let { headline, lede }: { headline: string; lede: string } = $props();

    let settings = $state<HeroSettings>(HERO_START);
    let cycle = $state<Cycle>(HERO_CYCLE_START);
    let cycling = $state(false);
    /**
     * Bumped whenever a fresh dwell starts. The timer below re-arms on it, and
     * the panel's countdown is keyed to it, so the bar and the step it counts
     * down to cannot come apart.
     */
    let beat = $state(0);

    onMount(() => {
        // Not before load: the cycle is the reward for a page that has already
        // arrived. Hydration can finish either side of the load event, so both
        // orders are handled.
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
        // Read for the dependency: a fresh dwell — a drawn step, a resume, a
        // reader moving a knob — re-arms the timer from zero instead of letting
        // the one already running finish somebody else's countdown.
        void beat;
        if (!cycling) return;
        const timer = setTimeout(forward, dwell);
        return () => clearTimeout(timer);
    });

    const themed = $derived(heroTheme(settings));
    const snippet = $derived(heroSnippet(settings));
    /** How long the step now showing holds, which the panel counts down. */
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
        // A reader who has moved a control is reading the result, not watching
        // a slideshow. The cycle holds until they start it again.
        cycling = false;
        beat += 1;
    }
</script>

<div class="hero">
    <h1>{headline}</h1>
    <p class="hero__lede">{lede}</p>
    <p class="hero__note">
        A fifth the size of viewers like Mirador and Universal Viewer while
        covering considerably more of the IIIF spec than either.
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
            label="The viewer, running"
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
