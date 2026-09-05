<script lang="ts">
    import { onDestroy, onMount } from 'svelte';

    import CopyLine from './CopyLine.svelte';
    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import HeroPanel from './HeroPanel.svelte';
    import { HERO_EXAMPLE } from './examples';
    import {
        HERO_CYCLE_START,
        HERO_FIRST_STRIDE,
        HERO_START,
        HERO_STRIDE,
        HERO_STRIDE_PAUSE,
        advance,
        heroSnippet,
        heroTheme,
        retreat,
        stepAt,
        strideMoves,
        type Cycle,
        type HeroSettings,
        type Knob,
    } from './heroConfigurations';
    import type { ViewerState } from 'triiiceratops';

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
     * The material stands still for a whole lap and moves between them. The
     * claim being made is that the chrome recomposes without remounting, and
     * material moving underneath it is the one thing that could be mistaken for
     * the chrome being rebuilt.
     */
    let { headline, lede }: { headline: string; lede: string } = $props();

    let settings = $state<HeroSettings>(HERO_START);
    let cycle = $state<Cycle>(HERO_CYCLE_START);
    let cycling = $state(false);
    let viewerState = $state<ViewerState | undefined>(undefined);
    /**
     * Which way through the material the laps are walking.
     *
     * The stride does not divide eleven, so it runs off both ends. Reflecting
     * rather than wrapping is what makes the resting canvas land on a different
     * one each time the walk crosses the material, so the whole set is reached.
     */
    let heading: 1 | -1 = 1;
    /**
     * Canvases the sequence has asked for and the viewer cannot deliver yet.
     *
     * The cycle starts on the page's load event and the viewer's own module is
     * fetched after it, so the first lap asks for its canvas before there is a
     * manifest to count. The debt is kept and paid the moment there is one.
     */
    let owed = 0;
    let strideTimer: ReturnType<typeof setTimeout> | undefined;
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
            // The page is served on the first canvas, so the opening lap runs
            // on the third rather than skipping past what a reader was just
            // looking at while the viewer loaded.
            owed += HERO_FIRST_STRIDE;
            schedule();
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

    /**
     * Turn the material through `moves`, resting a pause on each canvas.
     *
     * Every move is made from inside the timer and never from the caller, which
     * is not only about pacing: `nextCanvas` reads `hasNext`, so a move made in
     * an effect's body would register the canvas as that effect's dependency
     * and the effect would re-enter itself until the material ran out. A timer
     * callback tracks nothing.
     */
    function walk(moves: readonly (1 | -1)[]) {
        if (moves.length === 0) return;
        strideTimer = setTimeout(() => {
            const state = viewerState;
            if (state === undefined) return;
            if (moves[0] === 1) state.nextCanvas();
            else state.previousCanvas();
            walk(moves.slice(1));
        }, HERO_STRIDE_PAUSE);
    }

    onDestroy(() => clearTimeout(strideTimer));

    /** Turn whatever the laps owe into moves to play, once there is an index. */
    function schedule() {
        const state = viewerState;
        if (owed === 0 || state === undefined) return;
        const index = state.currentCanvasIndex;
        // Before the manifest has arrived there is no index to move from, and
        // the debt waits for the effect below rather than being spent on
        // nothing.
        if (index < 0) return;

        const strode = strideMoves(index, state.canvases.length, heading, owed);
        heading = strode.heading;
        // Cleared before the walk starts, so a re-entrant call owes nothing.
        owed = 0;
        // A reader clicking forward across the seam can start a lap while the
        // last one is still turning; the newer stride is the live one.
        clearTimeout(strideTimer);
        walk(strode.moves);
    }

    $effect(() => {
        // Read for the dependency: a debt taken on before the manifest arrived
        // is paid the moment there is an index to move from. It re-runs on
        // every canvas the walk turns through too, and owes nothing by then.
        void viewerState?.currentCanvasIndex;
        schedule();
    });

    function forward() {
        const next = advance(cycle);
        settings = next.settings;
        cycle = next.cycle;
        // A lap has turned over. Back does not undo this: the material is a
        // backdrop to the route rather than a step of it, and a reader stepping
        // over the seam is reading the arrangement, not counting folios.
        if (next.cycle.at === 0) {
            owed += HERO_STRIDE;
            schedule();
        }
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
</div>

<div class="heroband">
    <div class="heroband__stage">
        <EmbeddedViewer
            bind:viewerState
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
