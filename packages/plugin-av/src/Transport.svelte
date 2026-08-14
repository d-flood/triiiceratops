<!--
    The **transport**: canvas-anchored playback chrome for the claimed canvas
    whose media AVState currently addresses.

    Two rules shape everything here.

    1. **Every control is an AVState command.** Nothing touches a media element,
       so the plugin's own chrome and a host application drive playback through
       one contract that cannot drift. The single exception is `buffered`, which
       is a network fact rather than playback state and has no member to read.
    2. **It is a consumer, never a source of truth.** Every value rendered comes
       from the view model the host module keeps in step with AVState's two
       cadences, so a command issued elsewhere moves this chrome identically.

    Geometry is deliberately absent: the wrapper's position is written per frame
    by `transport.svelte.ts`, in screen pixels, because the chrome must not
    scale with the zoom the picture under it does.
-->
<script lang="ts">
    import { Button, Range } from '@triiiceratops/ui';

    import {
        SEEK_STEP_LARGE,
        SEEK_STEP_SMALL,
        formatMediaTime,
    } from './transport';
    import type { TransportPort, TransportView } from './transport.svelte';

    const { view, port }: { view: TransportView; port: TransportPort } =
        $props();

    const duration = $derived(view.duration);
    const elapsed = $derived(formatMediaTime(view.currentTime, duration));
    const total = $derived(formatMediaTime(duration, duration));

    /**
     * `aria-valuemax` needs a number even before a duration is known. 0 is the
     * honest answer: a slider whose min and max coincide announces as having
     * nowhere to go, which is exactly the state of a scrubber with no timeline.
     */
    const max = $derived(duration ?? 0);
    const now = $derived(Math.min(view.currentTime, max));

    function seekBy(delta: number): void {
        if (duration === null) return;
        port.seek(Math.min(Math.max(now + delta, 0), duration));
    }

    function onScrubberKeydown(event: KeyboardEvent): void {
        if (duration === null) return;

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                seekBy(SEEK_STEP_SMALL);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                seekBy(-SEEK_STEP_SMALL);
                break;
            case 'PageUp':
                seekBy(SEEK_STEP_LARGE);
                break;
            case 'PageDown':
                seekBy(-SEEK_STEP_LARGE);
                break;
            case 'Home':
                port.seek(0);
                break;
            case 'End':
                port.seek(duration);
                break;
            default:
                return;
        }
        // Only once a key has been recognized: an unhandled key must still
        // reach the viewer, so Tab still leaves and Escape still closes.
        event.preventDefault();
    }

    /**
     * The id the "off" option carries. Captions-off is `null` everywhere behind
     * the port, but a radio in a group needs an id of its own, so the two
     * representations meet here and nowhere else.
     */
    const CAPTIONS_OFF = '';

    /**
     * The caption list, "off" included and first.
     *
     * "Off" is an option in the same group rather than a separate control, so
     * turning captions off is the same gesture as choosing a language and the
     * group announces the full set of states a reader can be in.
     */
    const captionChoices = $derived([
        { id: CAPTIONS_OFF, label: view.labels.captionsOff },
        ...view.captions.options,
    ]);
    const activeCaptionId = $derived(view.captions.active ?? CAPTIONS_OFF);
    const captionsOn = $derived(view.captions.active !== null);

    /** Open state of the multi-track list. One track needs no list at all. */
    let listOpen = $state(false);

    /**
     * The chrome the list needs to reach: the button focus returns to, and the
     * radios the arrow keys walk. Bound rather than queried, so neither the
     * keyboard behaviour nor the focus return can be broken by a selector — a
     * `data-testid` least of all.
     */
    let captionsButton = $state<HTMLButtonElement | null>(null);
    let radios = $state<(HTMLButtonElement | null)[]>([]);

    function chooseCaption(id: string): void {
        port.setCaptionTrack(id === CAPTIONS_OFF ? null : id);
    }

    /** The bound radios that are actually in the DOM, in list order. */
    function liveRadios(): HTMLButtonElement[] {
        return radios.filter((radio): radio is HTMLButtonElement => !!radio);
    }

    function toggleList(): void {
        listOpen = !listOpen;
        if (!listOpen) return;
        // Opening moves focus into the list, which is what makes the control
        // operable from the keyboard at all. On the next frame, because the
        // list is not in the DOM until the reactive flush — and a microtask
        // can still land ahead of a flush that was already scheduled.
        const index = captionChoices.findIndex(
            (choice) => choice.id === activeCaptionId,
        );
        requestAnimationFrame(() => radios[index]?.focus());
    }

    /**
     * Focus leaving the control closes the list.
     *
     * Without it the panel sits over the picture until Escape or a second click
     * on `CC`, and a reader who simply looked elsewhere has no way of knowing
     * either is what dismisses it. A pointer press outside blurs the list too,
     * so this is the click-away dismissal as well as the blur one.
     */
    function onCaptionsFocusout(event: FocusEvent): void {
        const next = event.relatedTarget as Node | null;
        if (next && (event.currentTarget as HTMLElement).contains(next)) return;
        listOpen = false;
    }

    /**
     * Radio-group keyboard behaviour: the arrows move between tracks and
     * selection follows focus, which is what a radio group does everywhere
     * else. Escape closes the list and hands focus back to the button that
     * opened it, so the keyboard never ends up somewhere it cannot leave.
     */
    function onListKeydown(event: KeyboardEvent): void {
        const group = event.currentTarget as HTMLElement;
        const live = liveRadios();
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
            case 'Escape':
                listOpen = false;
                captionsButton?.focus();
                event.preventDefault();
                return;
            default:
                return;
        }

        event.preventDefault();
        const target = live[next];
        if (!target) return;
        target.focus();
        chooseCaption(target.dataset.trackId ?? CAPTIONS_OFF);
    }

    /** Seek to where the pointer is along the track, and keep seeking as it drags. */
    function onScrubberPointerdown(event: PointerEvent): void {
        if (duration === null) return;
        const track = event.currentTarget as HTMLElement;

        const seekToPointer = (clientX: number): void => {
            const box = track.getBoundingClientRect();
            if (box.width <= 0) return;
            port.seek(
                Math.min(Math.max((clientX - box.left) / box.width, 0), 1) *
                    duration,
            );
        };

        // Capture so a drag that leaves the track — off the canvas, off the
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
            track.removeEventListener('pointermove', onMove);
            track.removeEventListener('pointerup', onUp);
            track.removeEventListener('pointercancel', onUp);
            // Capture lost to something else ends the drag as surely as an up.
            track.removeEventListener('lostpointercapture', onUp);
        };
        track.addEventListener('pointermove', onMove);
        track.addEventListener('pointerup', onUp);
        track.addEventListener('pointercancel', onUp);
        track.addEventListener('lostpointercapture', onUp);
    }
</script>

<div
    class="tri-av-transport"
    data-testid="av-transport"
    role="group"
    aria-label={view.labels.transport}
>
    <Button
        size="sm"
        square
        ghost
        type="button"
        data-testid="av-play"
        aria-label={view.paused ? view.labels.play : view.labels.pause}
        onclick={() => port.toggle()}
    >
        {#if view.paused}▶{:else}❚❚{/if}
    </Button>

    <span
        class="tri-av-time"
        data-testid="av-elapsed"
        aria-label={view.labels.elapsed}
    >
        {elapsed}
    </span>

    <!--
        A real slider, not a styled div with a click handler: arrow and page
        keys, an announced position, and a focus ring are the accessibility
        contract this ticket exists to keep. `aria-valuetext` carries clock
        readings because "127" is not a position a listener can place.
    -->
    <div
        class="tri-av-scrubber"
        data-testid="av-scrubber"
        role="slider"
        tabindex="0"
        aria-label={view.labels.seek}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={now}
        aria-valuetext={view.position}
        onkeydown={onScrubberKeydown}
        onpointerdown={onScrubberPointerdown}
    >
        <div class="tri-av-track">
            <!--
                The waveform strip: a static, non-interactive picture of the
                whole recording, behind the buffered and played fills. A
                background image rather than a live surface because it never
                changes and never responds — everything that moves over it is
                the scrubber's own DOM.
            -->
            {#if view.peaksStrip}
                <div
                    class="tri-av-peaks"
                    data-testid="av-peaks-strip"
                    aria-hidden="true"
                    style="background-image:url({view.peaksStrip})"
                ></div>
            {/if}
            {#each view.buffered as span (span.start)}
                <div
                    class="tri-av-buffered"
                    style="left:{span.start * 100}%;width:{(span.end -
                        span.start) *
                        100}%"
                ></div>
            {/each}
            <div
                class="tri-av-played"
                style="width:{view.fraction * 100}%"
            ></div>
            <div class="tri-av-thumb" style="left:{view.fraction * 100}%"></div>
        </div>
    </div>

    <span
        class="tri-av-time"
        data-testid="av-duration"
        aria-label={view.labels.duration}
    >
        {total}
    </span>

    <Button
        size="sm"
        square
        ghost
        type="button"
        data-testid="av-mute"
        aria-pressed={view.muted}
        aria-label={view.muted ? view.labels.unmute : view.labels.mute}
        onclick={() => port.setMuted(!view.muted)}
    >
        {#if view.muted}🔇{:else}🔊{/if}
    </Button>

    {#if view.volumeSettable}
        <Range
            class="tri-av-volume"
            size="xs"
            min={0}
            max={1}
            step={0.05}
            data-testid="av-volume"
            aria-label={view.labels.volume}
            value={view.muted ? 0 : view.volume}
            oninput={(event: Event) =>
                port.setVolume(
                    Number((event.currentTarget as HTMLInputElement).value),
                )}
        />
    {/if}

    <!--
        Captions, last in the row per the SPEC's v1 inventory. Rendered ONLY for
        tracks that loaded — the stage drops the ones the browser refused — so
        there is no state in which this control is visible and does nothing
        (user story 46). One track is a plain pressed/unpressed toggle; several
        open a radio list of the tracks and "off", which is the only thing that
        can express "which language".

        The `CC` label is wrapped in a `<span>`: a BARE text child of a
        component compiles to `$.next()`, which is not in core's shared Svelte
        runtime export list, and the plugin reads that list off
        `window.Triiiceratops` — so it would fail at runtime, in the browser,
        rather than at build time. The buttons above avoid it by accident,
        their contents being `{#if}` blocks.
    -->
    {#if view.captions.options.length === 1}
        <Button
            size="sm"
            square
            ghost
            type="button"
            data-testid="av-captions"
            aria-pressed={captionsOn}
            aria-label={view.labels.captions}
            onclick={() =>
                chooseCaption(
                    captionsOn ? CAPTIONS_OFF : view.captions.options[0].id,
                )}><span>CC</span></Button
        >
    {:else if view.captions.options.length > 1}
        <div class="tri-av-captions" onfocusout={onCaptionsFocusout}>
            <Button
                bind:element={captionsButton}
                size="sm"
                square
                ghost
                type="button"
                data-testid="av-captions"
                aria-pressed={captionsOn}
                aria-expanded={listOpen}
                aria-label={view.labels.captions}
                onclick={toggleList}><span>CC</span></Button
            >
            {#if listOpen}
                <!--
                    A real radio group: one tab stop, arrows between the
                    tracks, and every option announced with its own state.
                -->
                <div
                    class="tri-av-caption-list"
                    data-testid="av-caption-list"
                    role="radiogroup"
                    aria-label={view.labels.captions}
                    tabindex="-1"
                    onkeydown={onListKeydown}
                >
                    {#each captionChoices as choice, index (choice.id)}
                        <button
                            bind:this={radios[index]}
                            type="button"
                            role="radio"
                            class="tri-av-caption-option"
                            data-track-id={choice.id}
                            aria-checked={choice.id === activeCaptionId}
                            tabindex={choice.id === activeCaptionId ? 0 : -1}
                            onclick={() => chooseCaption(choice.id)}
                        >
                            {choice.label}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .tri-av-transport {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.5rem;
        color: var(--tri-content, #fff);
        background: color-mix(
            in oklab,
            var(--tri-toolbar-bg, #1a1a1a) 85%,
            transparent
        );
        border-radius: var(--tri-radius-panels, 0.5rem);
        /* The layer is transparent to pointer events; the chrome opts back in. */
        pointer-events: auto;
        font-size: 0.75rem;
        line-height: 1;
    }

    .tri-av-time {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .tri-av-scrubber {
        flex: 1 1 auto;
        min-width: 3rem;
        /* A 44px-tall hit area around a 4px-tall line: the line is the
           affordance, the padding is the touch target. */
        padding: 0.75rem 0;
        cursor: pointer;
        touch-action: none;
    }
    .tri-av-scrubber:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        border-radius: 2px;
    }

    .tri-av-track {
        position: relative;
        height: 0.25rem;
        border-radius: 3.40282e38px;
        background: color-mix(in oklab, currentColor 25%, transparent);
        overflow: visible;
    }

    .tri-av-peaks,
    .tri-av-buffered,
    .tri-av-played {
        position: absolute;
        inset-block: 0;
        border-radius: inherit;
    }
    /*
        Stretched to the track rather than tiled: the strip is one rendering of
        the whole recording, so its x axis IS the scrubber's, whatever width the
        transport ends up at.
    */
    .tri-av-peaks {
        inset-inline: 0;
        background-repeat: no-repeat;
        background-size: 100% 100%;
    }
    .tri-av-buffered {
        background: color-mix(in oklab, currentColor 40%, transparent);
    }
    .tri-av-played {
        left: 0;
        background: var(--tri-color-primary, currentColor);
    }

    .tri-av-thumb {
        position: absolute;
        top: 50%;
        width: 0.75rem;
        height: 0.75rem;
        margin-left: -0.375rem;
        border-radius: 3.40282e38px;
        background: var(--tri-color-primary, currentColor);
        transform: translateY(-50%);
    }

    /*
        The caption list sits ABOVE its button rather than below it: the
        transport is anchored to the bottom edge of the canvas rect, so
        anything opening downwards would open off the picture it belongs to.
    */
    .tri-av-captions {
        position: relative;
        display: flex;
    }

    .tri-av-caption-list {
        position: absolute;
        bottom: 100%;
        right: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        min-width: max-content;
        margin-bottom: 0.375rem;
        padding: 0.25rem;
        background: var(--tri-toolbar-bg, #1a1a1a);
        border: 1px solid var(--tri-surface-border, rgb(255 255 255 / 0.2));
        border-radius: var(--tri-radius-panels, 0.5rem);
    }

    .tri-av-caption-option {
        appearance: none;
        /* 44px of height, so the list is aimable with a thumb as it stands. */
        min-height: 2.75rem;
        padding: 0 0.75rem;
        text-align: start;
        white-space: nowrap;
        color: inherit;
        font: inherit;
        background: none;
        border: 0;
        border-radius: calc(var(--tri-radius-panels, 0.5rem) - 0.25rem);
        cursor: pointer;
    }
    .tri-av-caption-option[aria-checked='true'] {
        background: color-mix(in oklab, currentColor 20%, transparent);
    }
    .tri-av-caption-option:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -2px;
    }

    :global(.tri-av-transport .tri-av-volume) {
        flex: 0 1 4rem;
        width: 4rem;
        min-width: 0;
    }

    /*
        Mobile: coarse pointers get bigger targets and lose the volume slider,
        which no thumb can aim at 4rem wide and which the device's own hardware
        keys already own. Mute stays — it is the control that matters without a
        slider beside it.
    */
    @media (pointer: coarse) {
        .tri-av-transport {
            gap: 0.5rem;
            padding: 0.375rem 0.5rem;
            font-size: 0.8125rem;
        }
        .tri-av-track {
            height: 0.375rem;
        }
        .tri-av-thumb {
            width: 1rem;
            height: 1rem;
            margin-left: -0.5rem;
        }
        :global(.tri-av-transport .tri-av-volume) {
            display: none;
        }
    }
</style>
