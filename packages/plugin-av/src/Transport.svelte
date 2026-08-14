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
                Ticket 10's waveform strip draws here, behind the buffered and
                played fills. Left empty rather than omitted so the stacking
                order it needs is already the one the styles describe.
            -->
            <div class="tri-av-peaks" aria-hidden="true"></div>
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
    .tri-av-peaks {
        inset-inline: 0;
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
