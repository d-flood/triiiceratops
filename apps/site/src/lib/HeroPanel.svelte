<script lang="ts">
    import {
        HERO_GROUPS,
        LAYOUT_KNOBS,
        LAYOUT_SAY,
        THEME_KNOBS,
        THEME_SAY,
        type HeroSettings,
        type Knob,
    } from './heroConfigurations';

    /**
     * The hero's configuration surface: two labelled groups in one column.
     *
     * Neither group scrolls and neither is behind a tab. A tab would put one of
     * the two axes out of sight, and — more to the point — every other control
     * here changes the viewer, so a control that only changed the panel would be
     * the one dead click in a surface whose whole argument is causation. Fixed
     * halves with a scroll region each were the other candidate; two nested
     * scrollers inside a page that also scrolls is worse on a trackpad and has
     * to become something else entirely on a phone. What makes one column fit
     * instead is the shown set — five theme knobs and six layout ones — with
     * each group's heading stating the real count behind them, and a label that
     * sits beside its control rather than above it.
     *
     * Native radios, one group per knob: a segmented control is a
     * one-of-several choice, and the platform's radio gives arrow-key
     * navigation, the roving tab stop and the group semantics for nothing. The
     * input covers its label, so the label is the hit target and the focus ring
     * belongs to it.
     *
     * The group headings are `h2`, not `h3`: they are the first headings under
     * the page's `h1`, and a level skipped there is a real navigation defect for
     * anyone moving by heading, whatever the size looks like.
     *
     * Above both groups, the transport: what is moving the panel, and the three
     * controls over it. A cycle a reader cannot stop is the panel taking the
     * surface away from them at a fixed rate, and the countdown is what makes
     * the next move something they are waiting for rather than something that
     * happens to them. Back and forward step the same sequence the cycle is
     * walking, so a reader who missed a change can go and look at it.
     *
     * A group's accessible name is exactly its visible label — the configuration
     * path, nothing appended — so the two cannot disagree. The reason a knob is
     * currently inert is a description rather than part of the name, which is
     * what it is: the control still sets `toolbar.side`, and what has changed is
     * whether anything reads it.
     */
    let {
        settings,
        set,
        cycling,
        beat,
        dwell,
        at,
        onBack,
        onForward,
        onToggle,
    }: {
        settings: HeroSettings;
        /** Called with a knob and the value a reader picked on it. */
        set: (knob: Knob, value: string) => void;
        /** Whether the cycle is running, which is what the middle control says. */
        cycling: boolean;
        /**
         * Bumped by the hero whenever a fresh dwell starts. The countdown is
         * keyed to it, so the bar restarts with the step it is counting to and
         * the two cannot come apart.
         */
        beat: number;
        /** How long the step now showing holds, which the countdown sweeps. */
        dwell: number;
        /** Which step of `HERO_SEQUENCE` the panel stands on. */
        at: number;
        onBack: () => void;
        onForward: () => void;
        onToggle: () => void;
    } = $props();

    /** Unique per instance, so two panels on one page cannot share a group. */
    const uid = $props.id();

    /**
     * Play the wash that marks a knob as the one that just moved.
     *
     * On update only, never on create: the pulse says a value changed, and a
     * panel that flashed all eleven rows the moment it hydrated would be saying
     * it about nothing. Restarting a CSS animation means taking the class off,
     * forcing layout to flush the removal, and putting it back — reading
     * `offsetWidth` is what makes the browser treat it as two states rather
     * than one no-op.
     */
    function pulse(node: HTMLElement, value: string) {
        let showing = value;
        return {
            update(next: string) {
                if (next === showing) return;
                showing = next;
                node.classList.remove('hp__pulse--on');
                void node.offsetWidth;
                node.classList.add('hp__pulse--on');
            },
        };
    }

    function name(knob: Knob): string {
        return `${uid}-${knob.path}`;
    }
</script>

{#snippet group(title: string, say: string, knobs: readonly Knob[])}
    <div class="hp__group">
        <h2>{title}</h2>
        <p class="hp__say">{say}</p>
        {#each knobs as knob (knob.path)}
            {@const inert = knob.inert?.(settings)}
            {@const on = knob.read(settings)}
            <div class="hp__knob" class:hp__knob--inert={inert !== undefined}>
                <span class="hp__pulse" use:pulse={on} aria-hidden="true"
                ></span>
                <div class="hp__row">
                    <code class="hp__path" id="{name(knob)}-label"
                        >{knob.path}</code
                    >
                    <div
                        class="hp__seg"
                        class:hp__seg--swatch={knob.kind === 'swatches'}
                        role="radiogroup"
                        aria-labelledby="{name(knob)}-label"
                        aria-describedby={knob.inert
                            ? `${name(knob)}-why`
                            : undefined}
                    >
                        {#each knob.values as value (value)}
                            <label
                                class="hp__opt"
                                class:on={value === on}
                                style={knob.kind === 'swatches'
                                    ? `--swatch: ${value}`
                                    : undefined}
                            >
                                <input
                                    type="radio"
                                    name={name(knob)}
                                    {value}
                                    checked={value === on}
                                    onchange={() => set(knob, value)}
                                />
                                <span class="hp__opt__t">{value}</span>
                            </label>
                        {/each}
                    </div>
                </div>
                <!--
                    Present for every knob, holding its line whether or not this
                    one has a reason to show — even whether or not it is a knob
                    that can go inert at all. Two things need it: a reason
                    arriving would otherwise move every knob below it (and the
                    cycle toggles `controls`, so that would happen on every turn
                    of a page whose layout stability is measured), and a line
                    reserved only on the knobs that can go inert made those rows
                    taller than their neighbours, which read as a gap opening in
                    the middle of the list.
                -->
                <span class="hp__why" id="{name(knob)}-why"
                    >{inert === undefined ? '' : `— ${inert}`}</span
                >
            </div>
        {/each}
    </div>
{/snippet}

<div class="hp" style="--hp-dwell: {dwell}ms">
    <div class="hp__transport">
        <h2 class="hp__what">Layout Examples</h2>
        <button
            type="button"
            class="hp__tbtn"
            onclick={onBack}
            aria-label="Back one setting"
        >
            <!-- Skip-back rather than a bare triangle: play is a bare
                 triangle, and two of those side by side are one control. -->
            <svg viewBox="0 0 16 16" aria-hidden="true"
                ><path d="M4.5 3.5H6v9H4.5zM12 3.5v9L7 8z" /></svg
            >
        </button>
        <button
            type="button"
            class="hp__tbtn"
            onclick={onToggle}
            aria-label={cycling ? 'Hold the cycle' : 'Run the cycle'}
        >
            {#if cycling}
                <svg viewBox="0 0 16 16" aria-hidden="true"
                    ><path d="M5 3.5h2v9H5zm4 0h2v9H9z" /></svg
                >
            {:else}
                <svg viewBox="0 0 16 16" aria-hidden="true"
                    ><path d="M5.5 3.5l7 4.5-7 4.5z" /></svg
                >
            {/if}
        </button>
        <button
            type="button"
            class="hp__tbtn"
            onclick={onForward}
            aria-label="Forward one setting"
        >
            <svg viewBox="0 0 16 16" aria-hidden="true"
                ><path d="M10 3.5h1.5v9H10zM4 3.5v9l5-4.5z" /></svg
            >
        </button>
        <!--
            Where the sequence stands: a dot per example, in the four runs the
            route is grouped into, so a reader can see both how far through a
            run they are and that there are three more coming.

            The current dot fills over its own dwell, keyed on the beat so it
            restarts with the step it is counting down rather than running on a
            clock of its own. Decorative: what it counts to is the panel below
            it, which a screen reader is already reading.
        -->
        <span class="hp__line" aria-hidden="true">
            {#each HERO_GROUPS as group (group.name)}
                <span class="hp__grp">
                    {#each group.steps as step (step)}
                        <span
                            class="hp__dot"
                            class:hp__dot--done={step < at}
                            class:hp__dot--now={step === at}
                        >
                            {#if step === at}
                                {#key beat}
                                    <span
                                        class="hp__fill"
                                        class:hp__fill--running={cycling}
                                    ></span>
                                {/key}
                            {/if}
                        </span>
                    {/each}
                </span>
            {/each}
        </span>
    </div>
    {@render group('Theme', THEME_SAY, THEME_KNOBS)}
    <span class="hp__rule"></span>
    {@render group('Layout', LAYOUT_SAY, LAYOUT_KNOBS)}
</div>
