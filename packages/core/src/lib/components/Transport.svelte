<!--
    The **transport**: playback controls, rendered as one group of the viewer's
    control bar, beside the viewer’s own navigation.

    Everything shown comes from the registered chrome's view model, and every
    control is one of its port's commands — so the viewer's own chrome and a host
    application drive playback through one contract that cannot drift.

    The vocabulary here is deliberately generic. This component knows about a
    thing that plays, pauses, seeks, may offer alternative text tracks and may
    offer a readable text of itself; the medium, its clock, its formats, its
    words and where its reading surface lives are all the claimant's
    (`state/transportChrome.ts`).
-->
<script lang="ts">
    import { untrack } from 'svelte';
    import { Button, Range } from './ui';
    import PluginIcon from './PluginIcon.svelte';
    import { dismissible } from '../utils/dismissible';
    import type {
        RegisteredTransportChrome,
        TransportChromeView,
    } from '../state/transportChrome';

    let {
        chrome,
        /**
         * Whether the track list opens downwards. The bar can be docked to
         * either edge, so an unconditional direction would open the list off
         * the viewer half the time.
         */
        openDown = false,
        /**
         * The rendered group, for the bar to measure. `null` while the view has
         * nothing to drive, which is what keeps an absent transport from
         * holding its width floor open in the bar's layout.
         */
        element = $bindable<HTMLDivElement | null>(null),
        /**
         * Whether the track list is open, for the bar to read. The bar cannot
         * go idle over a popover it owns, and this list is the one popover in
         * the bar that a group of the bar owns rather than the bar itself.
         */
        listOpen = $bindable(false),
    }: {
        chrome: RegisteredTransportChrome;
        openDown?: boolean;
        element?: HTMLDivElement | null;
        listOpen?: boolean;
    } = $props();

    // Read on core's own cadence: the claimant already runs the cadences its
    // published state runs on, and `subscribe` is how it hands them over.
    //
    // `$state.raw`, so each read replaces the view wholesale. A deep proxy would
    // buy nothing — the claimant is entitled to hand back the same object it
    // mutated, so the assignment is the only signal there is — and would cost a
    // proxy per playback frame.
    let view = $state.raw<TransportChromeView>(untrack(() => chrome.view()));

    $effect(() => {
        const registered = chrome;
        // Untracked: a claimant's `view()` may touch reactive state, and a
        // dependency taken here would re-run this effect on every playback
        // frame — unsubscribing and resubscribing for each one.
        const read = () => {
            view = untrack(() => registered.view());
        };
        read();
        return registered.subscribe(read);
    });

    const port = $derived(chrome.port);
    const icons = $derived(chrome.icons);
    const labels = $derived(view.labels);
    const duration = $derived(view.duration);

    /**
     * `aria-valuemax` needs a number even before a duration is known. 0 is the
     * honest answer: a slider whose min and max coincide announces as having
     * nowhere to go, which is exactly the state of a scrubber with no timeline.
     */
    const max = $derived(duration ?? 0);

    /**
     * The strip is a claimant-supplied URL, so it is untrusted text going into
     * CSS. Quoting it — and escaping what would end the quoted string — keeps a
     * `)` or a `;` in it from closing the `url()` token and appending
     * declarations of its own. The `style:` directive sets it through
     * `setProperty`, which cannot be escaped out of in the first place; the
     * quoting is what makes the value itself inert.
     */
    const stripImage = $derived(
        view.strip
            ? `url("${view.strip.replace(/["\\]/g, '\\$&')}")`
            : undefined,
    );

    const clamp = (fraction: number) => Math.min(Math.max(fraction, 0), 1);

    /** Seconds in, a fraction out: core computes the coordinate, not the clock. */
    function seekBy(deltaSeconds: number): void {
        if (duration)
            port.seek(clamp((view.currentTime + deltaSeconds) / duration));
    }

    function onScrubberKeydown(event: KeyboardEvent): void {
        if (!duration) return;

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                seekBy(view.stepSmall);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                seekBy(-view.stepSmall);
                break;
            case 'PageUp':
                seekBy(view.stepLarge);
                break;
            case 'PageDown':
                seekBy(-view.stepLarge);
                break;
            case 'Home':
                port.seek(0);
                break;
            case 'End':
                port.seek(1);
                break;
            default:
                return;
        }
        // Only once a key has been recognized: an unhandled key must still
        // reach the viewer, so Tab still leaves and Escape still closes.
        event.preventDefault();
    }

    /** Seek to where the pointer is along the track, and keep seeking as it drags. */
    function onScrubberPointerdown(event: PointerEvent): void {
        // Primary button only, and only the primary pointer: a right-click must
        // not move the playhead or take capture, and a second finger landing
        // mid-drag must not open a seek loop of its own.
        if (!duration || event.button !== 0 || !event.isPrimary) return;
        const track = event.currentTarget as HTMLElement;

        const seekToPointer = (clientX: number): void => {
            const box = track.getBoundingClientRect();
            if (box.width > 0)
                port.seek(clamp((clientX - box.left) / box.width));
        };

        // Capture so a drag that leaves the track — off the control, off the
        // window — keeps scrubbing and still releases on the pointer's own up.
        track.setPointerCapture(event.pointerId);
        seekToPointer(event.clientX);
        // The default action of a pointerdown includes focusing the target, and
        // it is suppressed here to keep the gesture from selecting text — so the
        // focus the slider needs for its arrow keys is taken explicitly.
        event.preventDefault();
        track.focus();

        // Every listener is filtered by the pointer that opened the drag: a
        // second finger must not seek inside someone else's gesture, and its up
        // must not tear down the first pointer's listeners.
        const { pointerId } = event;
        const onMove = (move: PointerEvent): void => {
            if (move.pointerId === pointerId) seekToPointer(move.clientX);
        };
        const onUp = (end: PointerEvent): void => {
            if (end.pointerId !== pointerId) return;
            for (const type of POINTER_END)
                track.removeEventListener(type, onUp);
            track.removeEventListener('pointermove', onMove);
        };
        track.addEventListener('pointermove', onMove);
        for (const type of POINTER_END) track.addEventListener(type, onUp);
    }

    /** Capture lost to something else ends a drag as surely as an up does. */
    const POINTER_END = [
        'pointerup',
        'pointercancel',
        'lostpointercapture',
    ] as const;

    /**
     * The track list, "off" included and first: turning tracks off is then the
     * same gesture as choosing one, and the group announces the full set of
     * states a reader can be in. "Off" is `null` rather than a reserved id
     * string, so no id a claimant registers can collide with it.
     */
    const choices = $derived<{ id: string | null; label: string }[]>([
        { id: null, label: labels.tracksOff },
        ...view.tracks,
    ]);
    const tracksOn = $derived(view.activeTrack !== null);
    /** Several tracks need a list; one is a plain pressed/unpressed toggle. */
    const listed = $derived(view.tracks.length > 1);

    /**
     * The identity of the offered set, not the view object: the claimant hands
     * back a fresh view on every playback frame, so keying the reset below on
     * `view.tracks` itself would shut the list a few times a second.
     */
    const trackKey = $derived(view.tracks.map((track) => track.id).join('\n'));
    /**
     * The set the open list is a list OF. A plain `let`, not `$state`: only the
     * effect below reads or writes it, and nothing should re-render when it
     * changes. `null` until the effect first runs, which no key can equal.
     */
    let openedFor: string | null = null;
    /**
     * A list left open across a change of track set is a list addressing tracks
     * that are gone — it survives navigation to a canvas with one track or none,
     * where the button stops claiming to be expanded and so can no longer close
     * it, and it survives a canvas with none at all, where the whole control
     * unmounts and would come back already open with no gesture behind it.
     */
    $effect(() => {
        if (trackKey === openedFor) return;
        openedFor = trackKey;
        listOpen = false;
    });
    /**
     * Bound rather than queried, so neither the keyboard behaviour nor the
     * focus return can be broken by a selector — a `data-testid` least of all.
     */
    let tracksButton = $state<HTMLButtonElement | null>(null);
    let radios = $state<(HTMLButtonElement | null)[]>([]);

    function choose(id: string | null): void {
        port.setTrack(id);
    }

    function onTracksClick(): void {
        if (!listed) {
            choose(tracksOn ? null : view.tracks[0].id);
            return;
        }
        listOpen = !listOpen;
        if (!listOpen) return;
        // Opening moves focus into the list, which is what makes the control
        // operable from the keyboard at all. On the next frame, because the
        // list is not in the DOM until the reactive flush — and a microtask can
        // still land ahead of a flush that was already scheduled.
        const index = choices.findIndex(
            (choice) => choice.id === view.activeTrack,
        );
        requestAnimationFrame(() => radios[index]?.focus());
    }

    /**
     * Radio-group keyboard behaviour: the arrows move between tracks and
     * selection follows focus, which is what a radio group does everywhere
     * else. Escape and an outside pointer are the shared `dismissible` action's,
     * so this control dismisses by the same rule as the rest of core's chrome.
     */
    function onListKeydown(event: KeyboardEvent): void {
        const group = event.currentTarget as HTMLElement;
        const live = radios.filter(
            (radio): radio is HTMLButtonElement => !!radio,
        );
        const root = group.getRootNode() as Document | ShadowRoot;
        const at = live.indexOf(root.activeElement as HTMLButtonElement);

        let next = -1;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                next = (at + 1) % live.length;
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                next = (at - 1 + live.length) % live.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = live.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        const target = live[next];
        if (!target) return;
        target.focus();
        choose(choices[next]?.id ?? null);
    }
</script>

{#if view.present}
    <div
        bind:this={element}
        class="transport"
        data-testid="transport"
        role="group"
        aria-label={labels.transport}
    >
        <Button
            size="sm"
            square
            ghost
            type="button"
            data-testid="transport-play"
            aria-label={view.paused ? labels.play : labels.pause}
            onclick={() => port.toggle()}
        >
            <PluginIcon
                descriptor={view.paused ? icons.play : icons.pause}
                size={18}
            />
        </Button>

        <!--
            The clock readings are hidden from assistive technology rather than
            labelled: a `<span>` maps to role `generic`, which prohibits an
            accessible name, so a label here is dropped and two undifferentiated
            readings are announced. The scrubber's `aria-valuetext` already
            carries the whole reading ("0:25 of 1:40"), so nothing is lost.
        -->
        <span class="time" data-testid="transport-elapsed" aria-hidden="true"
            >{view.elapsedText}</span
        >

        <!--
            A real slider, not a styled div with a click handler: arrow and page
            keys, an announced position, and a focus ring are the accessibility
            contract. `aria-valuetext` carries a clock reading because "127" is
            not a position a listener can place.
        -->
        <div
            class="scrubber"
            data-testid="transport-scrubber"
            role="slider"
            tabindex="0"
            aria-label={labels.seek}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={Math.min(view.currentTime, max)}
            aria-valuetext={view.positionText}
            onkeydown={onScrubberKeydown}
            onpointerdown={onScrubberPointerdown}
        >
            <div class="track">
                <!--
                    A static, non-interactive picture of the whole recording,
                    behind the buffered and played fills. A background image
                    rather than a live surface because it never changes and never
                    responds — everything that moves over it is the scrubber's
                    own DOM.
                -->
                {#if view.strip}
                    <div
                        class="fill strip"
                        data-testid="transport-strip"
                        aria-hidden="true"
                        style:background-image={stripImage}
                    ></div>
                {/if}
                {#each view.buffered as span (span.start)}
                    <div
                        class="fill buffered"
                        style="left:{span.start * 100}%;width:{(span.end -
                            span.start) *
                            100}%"
                    ></div>
                {/each}
                <div
                    class="fill played"
                    style="width:{view.fraction * 100}%"
                ></div>
                <div class="thumb" style="left:{view.fraction * 100}%"></div>
            </div>
        </div>

        <span class="time" data-testid="transport-duration" aria-hidden="true"
            >{view.durationText}</span
        >

        <Button
            size="sm"
            square
            ghost
            type="button"
            data-testid="transport-mute"
            aria-pressed={view.muted}
            aria-label={view.muted ? labels.unmute : labels.mute}
            onclick={() => port.setMuted(!view.muted)}
        >
            <PluginIcon
                descriptor={view.muted ? icons.mute : icons.unmute}
                size={18}
            />
        </Button>

        {#if view.volumeSettable}
            <Range
                class="volume"
                size="xs"
                min={0}
                max={1}
                step={0.05}
                data-testid="transport-volume"
                aria-label={labels.volume}
                value={view.muted ? 0 : view.volume}
                oninput={(event: Event) =>
                    port.setVolume(
                        Number((event.currentTarget as HTMLInputElement).value),
                    )}
            />
        {/if}

        <!--
            Rendered ONLY for tracks the claimant reports as loaded, so there is
            no state in which this control is visible and does nothing. One track
            toggles; several open a radio list of the tracks and "off", which is
            the only thing that can express "which".
        -->
        {#if view.tracks.length}
            <div class="tracks">
                <Button
                    bind:element={tracksButton}
                    size="sm"
                    square
                    ghost
                    type="button"
                    data-testid="transport-tracks"
                    aria-pressed={tracksOn}
                    aria-expanded={listed ? listOpen : undefined}
                    aria-label={labels.tracks}
                    onclick={onTracksClick}
                >
                    <PluginIcon descriptor={icons.tracks} size={18} />
                </Button>
                {#if listOpen}
                    <!--
                        A real radio group: one tab stop, arrows between the
                        tracks, and every option announced with its own state.
                    -->
                    <div
                        use:dismissible={{
                            onDismiss: () => (listOpen = false),
                            invoker: tracksButton,
                            within: [tracksButton],
                            // `onTracksClick` puts focus on the ACTIVE radio;
                            // the action would take it to the group instead.
                            focusOnMount: false,
                        }}
                        class="track-list"
                        class:down={openDown}
                        data-testid="transport-track-list"
                        role="radiogroup"
                        aria-label={labels.tracks}
                        tabindex="-1"
                        onkeydown={onListKeydown}
                    >
                        <!--
                            Keyed by position, not by track id: "off" has no id
                            of its own, and a reserved id string for it could be
                            collided with by a track a claimant registers. The
                            list is rebuilt wholesale anyway, and `radios` is
                            index-parallel to it.
                        -->
                        {#each choices as choice, index (index)}
                            <button
                                bind:this={radios[index]}
                                type="button"
                                role="radio"
                                class="track-option"
                                aria-checked={choice.id === view.activeTrack}
                                tabindex={choice.id === view.activeTrack
                                    ? 0
                                    : -1}
                                onclick={() => choose(choice.id)}
                                >{choice.label}</button
                            >
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!--
            Rendered ONLY where the claimant reports a readable text, by the same
            rule as the track control above: no state in which this is visible
            and does nothing. `aria-pressed` rather than `aria-expanded` because
            what it shows is a surface elsewhere in the viewer, not a popover
            this button owns.
        -->
        {#if view.transcript}
            <Button
                size="sm"
                square
                ghost
                type="button"
                data-testid="transport-transcript"
                aria-pressed={view.transcriptOpen}
                aria-label={labels.transcript}
                onclick={() => port.setTranscript(!view.transcriptOpen)}
            >
                <PluginIcon descriptor={icons.transcript} size={18} />
            </Button>
        {/if}
    </div>
{/if}

<style>
    /*
        One group of the bar, and never broken internally: the bar may break
        BETWEEN its groups, which is what puts the transport on the row above the
        navigation rather than squeezing either off the bar.

        `min-width` is what makes that break happen at all. Without it the
        scrubber's `flex-grow` absorbs every reduction and the bar never wraps —
        it just produces a seek bar too narrow to aim with.
    */
    .transport {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: nowrap;
        min-width: 18rem;
        align-items: center;
        gap: var(--ui-gap, 0.5rem);
        font-size: 0.75rem;
        line-height: 1;
    }

    .time {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .scrubber {
        flex: 1 1 auto;
        min-width: 3rem;
        /* A tall hit area around a thin line: the line is the affordance, the
           padding is the touch target. */
        padding: 0.75rem 0;
        cursor: pointer;
        touch-action: none;
    }
    .scrubber:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        border-radius: 2px;
    }

    .track {
        position: relative;
        height: 0.25rem;
        border-radius: 3.40282e38px;
        background: color-mix(in oklab, currentColor 25%, transparent);
    }

    .fill {
        position: absolute;
        inset-block: 0;
        border-radius: inherit;
    }
    /* Stretched to the track rather than tiled: the strip is one rendering of
       the whole recording, so its x axis IS the scrubber's, at whatever width
       the bar ends up giving it. */
    .strip {
        inset-inline: 0;
        background-repeat: no-repeat;
        background-size: 100% 100%;
    }
    .buffered {
        background: color-mix(in oklab, currentColor 40%, transparent);
    }
    .played {
        left: 0;
        background: var(--tri-color-primary, currentColor);
    }

    .thumb {
        position: absolute;
        top: 50%;
        width: 0.75rem;
        height: 0.75rem;
        margin-left: -0.375rem;
        border-radius: 3.40282e38px;
        background: var(--tri-color-primary, currentColor);
        transform: translateY(-50%);
    }

    .tracks {
        position: relative;
        display: flex;
    }

    .track-list {
        position: absolute;
        bottom: 100%;
        margin-bottom: 0.375rem;
        right: 0;
        z-index: 1001;
        display: flex;
        flex-direction: column;
        min-width: max-content;
        padding: 0.25rem;
        background: var(--tri-panel-bg);
        border: 1px solid var(--tri-surface-border);
        border-radius: var(--tri-radius-panels);
    }
    /* The bar can be docked to the top edge, where opening upwards would put the
       list off the viewer. */
    .track-list.down {
        bottom: auto;
        top: 100%;
        margin: 0.375rem 0 0;
    }

    .track-option {
        appearance: none;
        /* 44px of height, so the list is aimable with a thumb. */
        min-height: 2.75rem;
        padding: 0 0.75rem;
        text-align: start;
        white-space: nowrap;
        color: inherit;
        font: inherit;
        background: none;
        border: 0;
        border-radius: calc(var(--tri-radius-panels) - 0.25rem);
        cursor: pointer;
    }
    .track-option[aria-checked='true'] {
        background: color-mix(in oklab, currentColor 20%, transparent);
    }
    .track-option:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -2px;
    }

    .transport :global(.volume) {
        flex: 0 1 4rem;
        width: 4rem;
        min-width: 0;
    }

    /*
        Below the group's usable width the volume slider goes and mute stays —
        it is the control that matters without a slider beside it, and the
        device's own hardware keys already own the level. Keyed off the pointer
        rather than the viewport: the slider is dropped because no thumb can aim
        at it at 4rem wide.
    */
    @media (pointer: coarse) {
        .track {
            height: 0.375rem;
        }
        .thumb {
            width: 1rem;
            height: 1rem;
            margin-left: -0.5rem;
        }
        .transport :global(.volume) {
            display: none;
        }
    }
</style>
