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
        set: (knob: Knob, value: string) => void;
        cycling: boolean;
        beat: number;
        dwell: number;
        at: number;
        onBack: () => void;
        onForward: () => void;
        onToggle: () => void;
    } = $props();

    const uid = $props.id();

    /* Update-only: restart the CSS animation via a forced reflow. */
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
            aria-label="Previous example"
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
            aria-label={cycling ? 'Pause examples' : 'Play examples'}
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
            aria-label="Next example"
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
