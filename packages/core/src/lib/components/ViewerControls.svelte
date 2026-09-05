<script lang="ts">
    import { getContext, untrack } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import Icon from './Icon.svelte';
    import type { IconName } from '../generated/icons';
    import { getMessages } from '../state/i18n.svelte';
    import { resolveLanguageValue } from '../utils/languageMap';
    import { getResourceId } from '../utils/iiifIds';
    import {
        canIdleHide,
        getCanvasNavLayout,
        getVisibleChoiceGroups,
        IDLE_CHROME_DELAY_MS,
        shouldShowGroupDivider,
        shouldUseAbbreviatedChoiceLabels,
        type ChoiceGroup,
    } from './viewerControls';
    import CanvasInfoPopover from './CanvasInfoPopover.svelte';
    import Toolbar from './Toolbar.svelte';
    import Transport from './Transport.svelte';
    import { Button, NativeSelect } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const m = getMessages();

    // `unified` controls: the toolbar buttons are embedded at the start of this
    // control bar instead of floating separately.
    const isUnified = $derived(viewerState.config.controls === 'unified');
    let viewerLocale = $derived(viewerState.activeLocale);

    let showNav = $derived(
        viewerState.showCanvasNav && viewerState.canvases.length > 1,
    );

    let currentCanvasId = $derived(viewerState.canvasId);
    let manifestId = $derived(viewerState.manifestId);
    let visibleChoiceGroups = $derived.by(() => {
        if (!manifestId || !currentCanvasId) return [] as ChoiceGroup[];

        return getVisibleChoiceGroups({
            canvases: manifestsState.getCanvases(manifestId),
            currentCanvasId,
            currentCanvasIndex: viewerState.currentCanvasIndex,
            viewingMode: viewerState.viewingMode,
            pagedOffset: viewerState.pagedOffset,
            viewingDirection: viewerState.viewingDirection,
            getSelectedChoice: (canvasId) =>
                viewerState.getSelectedChoice(canvasId),
        });
    });

    let leftChoiceGroup = $derived(
        visibleChoiceGroups.find((group) => group.side === 'left'),
    );
    let rightChoiceGroup = $derived(
        visibleChoiceGroups.find((group) => group.side === 'right'),
    );

    let showZoom = $derived(viewerState.showZoomControls);
    let hasChoices = $derived(visibleChoiceGroups.length > 0);
    let hasCenterControls = $derived(showZoom || showNav);
    let useAbbreviatedChoiceLabels = $derived(
        shouldUseAbbreviatedChoiceLabels(
            viewerState.viewingMode,
            visibleChoiceGroups,
        ),
    );
    let canvasNavLayout = $derived(
        getCanvasNavLayout(viewerState.viewingDirection),
    );

    function selectChoice(canvasId: string, item: any) {
        if (canvasId) {
            const id = getResourceId(item);
            if (id) viewerState.selectChoice(canvasId, id);
        }
    }

    function getChoiceLabel(choice: any, index: number) {
        // `label` is spelled the same in IIIF v2 and v3, and
        // `resolveLanguageValue` reads the v2 bare string and
        // `[{"@value","@language"}]` array as well as the v3 language map.
        if (choice.label) {
            const resolved = resolveLanguageValue(choice.label, viewerLocale);
            if (resolved) return resolved;
        }
        return `Option ${index + 1}`;
    }

    function getChoiceDisplayLabel(
        choice: any,
        index: number,
        abbreviated: boolean,
    ) {
        if (abbreviated) return `${index + 1}`;
        return getChoiceLabel(choice, index);
    }

    function getNavIcon(icon: 'left' | 'right' | 'up' | 'down'): IconName {
        switch (icon) {
            case 'up':
                return 'CaretUp';
            case 'down':
                return 'CaretDown';
            case 'right':
                return 'CaretRight';
            default:
                return 'CaretLeft';
        }
    }

    let leftNavIcon = $derived(getNavIcon(canvasNavLayout.leftIcon));
    let rightNavIcon = $derived(getNavIcon(canvasNavLayout.rightIcon));

    // The bar renders one registered transport chrome — the first, if a second
    // claimant ever registers (see `ViewerState.registerTransportChrome`). The
    // revision counter is the registry's notifying signal, exactly as with
    // overlay layers.
    // The revision counter read is what establishes the dependency — the
    // registry's list is a plain frozen array rebuilt on change, not reactive
    // state, exactly as the overlay-layer registry's is.
    //
    // The read must be part of the returned EXPRESSION, not a bare statement:
    // the element build's terser pass deletes a statement it can see no side
    // effect in, which is how the overlay-layer render site once shipped a
    // viewer that accepted registrations and rendered none. The guard is always
    // true; it exists so the read cannot be dropped.
    let transportChrome = $derived(
        viewerState.transportChromeRevision >= 0
            ? (viewerState.transportChrome[0] ?? null)
            : null,
    );
    // The bar can be docked to the top edge, where a track list opening upwards
    // would open off the viewer.
    let tracksOpenDown = $derived(viewerState.config.nav?.edge === 'top');

    // Which of the bar's groups share a row. CSS can't detect a flex-wrap
    // break, so we watch the bar's size and compare the groups' offset tops: on
    // a shared row they align to the same row box, so any difference means a
    // later group has dropped to its own. `null` is a group this configuration
    // does not render at all.
    let barEl: HTMLDivElement | undefined = $state();
    let toolbarEl: HTMLDivElement | undefined = $state();
    let transportEl = $state<HTMLDivElement | null>(null);
    let navEl: HTMLDivElement | undefined = $state();
    let toolbarTop = $state<number | null>(null);
    let transportTop = $state<number | null>(null);
    let navTop = $state<number | null>(null);

    $effect(() => {
        const bar = barEl;
        // Read so the effect re-runs — and re-measures — as groups come and go.
        const groups = [toolbarEl, transportEl, navEl];
        if (!bar) return;
        const update = () => {
            const [toolbar, transport, nav] = groups;
            toolbarTop = toolbar?.offsetTop ?? null;
            transportTop = transport?.offsetTop ?? null;
            navTop = nav?.offsetTop ?? null;
        };
        const ro = new ResizeObserver(update);
        ro.observe(bar);
        update();
        return () => ro.disconnect();
    });

    // One rule, two boundaries. `??` picks the next group actually rendered, so
    // the toolbar divides against the navigation when no chrome is registered.
    let dividerAfterToolbar = $derived(
        shouldShowGroupDivider(toolbarTop, transportTop ?? navTop),
    );
    let dividerAfterTransport = $derived(
        shouldShowGroupDivider(transportTop, navTop),
    );
    // Stacked rows get equal breathing room top and bottom; on a single row the
    // pill hugs its controls.
    let barWrapped = $derived.by(() => {
        const tops = [toolbarTop, transportTop, navTop].filter(
            (top): top is number => top !== null,
        );
        return tops.length > 1 && Math.max(...tops) !== Math.min(...tops);
    });

    // --- Idle chrome -------------------------------------------------------
    //
    // Over a claimed canvas this bar is drawn on top of the thing being read —
    // a video's caption cues, or a sound recording's waveform, which is the
    // whole rect. So while a recording plays and nothing is happening the bar
    // fades out and stops taking pointer events, and any interaction brings it
    // back.
    //
    // Hidden is `opacity: 0` plus `pointer-events: none`, never
    // `visibility`/`display`: the controls stay in the accessibility tree and
    // stay focusable, so a reader tabbing into them reveals them rather than
    // finding nothing there.
    //
    // The whole behaviour is gated on registered transport chrome, which is
    // manifest-scoped: a manifest of page images registers no timer and no
    // listeners at all and behaves exactly as it did before.
    //
    // Reduced motion needs nothing of its own here. The preference drops the
    // FADE, not the behaviour, and base.css's global guard already zeroes every
    // transition in the viewer when it is set — so the bar goes on hiding and
    // returning, instantly. Reading the preference again would be a second
    // answer to a question core already answers once.
    let idleHidden = $state(false);
    let trackListOpen = $state(false);
    // Plain `let`, not `$state`: these are read only when the idle timer fires
    // and when an event handler runs, and nothing re-renders on them.
    let pointerInBar = false;
    let playing = false;

    $effect(() => {
        const chrome = transportChrome;
        const bar = barEl;
        // The bar's own parent is the viewer area — the box a pointer move or a
        // key press has to land in to count as "over the viewer".
        const viewer = bar?.parentElement;
        if (!chrome || !bar || !viewer) return;

        let timer: ReturnType<typeof setTimeout> | undefined;

        const cancel = () => {
            clearTimeout(timer);
            timer = undefined;
        };

        const schedule = () => {
            cancel();
            if (!playing) return;
            timer = setTimeout(() => {
                timer = undefined;
                if (
                    canIdleHide({
                        playing,
                        pointerInBar,
                        // Asked of the DOM at the moment it matters rather than
                        // latched on focusin, because `:focus-visible` is the
                        // browser's own answer to "did this focus come from the
                        // keyboard" and it can change under a focus that never
                        // moved — a reader who clicked play and then reached
                        // for the keyboard.
                        keyboardFocusInBar:
                            !!bar.querySelector(':focus-visible'),
                        popoverOpen:
                            trackListOpen ||
                            viewerState.showCanvasInfo ||
                            // Under `controls: 'unified'` the toolbar renders
                            // inside the bar, and its flyouts — viewing mode,
                            // the sequence picker, and any plugin panel with
                            // `target: 'flyout'` — are plain descendants of it.
                            // Asked of the DOM rather than tracked, because the
                            // set is open-ended: a plugin's flyout is one the
                            // bar has no other way to know about.
                            !!bar.querySelector('[data-flyout-panel].open'),
                    })
                )
                    idleHidden = true;
                // Nothing is re-armed here. Every condition that pins the bar
                // visible has an event that lifts it — a pointer leaving, focus
                // going, a popover dismissed, playback resuming — and each of
                // those schedules again. Visible is the safe state to rest in.
            }, IDLE_CHROME_DELAY_MS);
        };

        const reveal = () => {
            idleHidden = false;
            schedule();
        };

        const enter = () => {
            pointerInBar = true;
            reveal();
        };
        const leave = () => {
            pointerInBar = false;
            schedule();
        };
        // Focus arriving reveals whichever way it came; whether it PINS the bar
        // is the keyboard question the timer asks for itself.
        const focusMoved = () => reveal();

        // `pointerdown` as well as `pointermove`, because a touch reader has no
        // pointer to move: a tap is the whole gesture.
        viewer.addEventListener('pointermove', reveal, { passive: true });
        viewer.addEventListener('pointerdown', reveal, { passive: true });
        viewer.addEventListener('keydown', reveal);
        bar.addEventListener('pointerenter', enter);
        bar.addEventListener('pointerleave', leave);
        bar.addEventListener('focusin', focusMoved);
        bar.addEventListener('focusout', focusMoved);

        // Playback state comes off the same subscription the transport renders
        // from. Only the transitions matter: stopping reveals and pins, and
        // starting — including from a host calling the port directly, with no
        // event of its own — is what starts the clock.
        const readPlayback = () => {
            // Untracked, as the transport's own read is: a claimant's `view()`
            // may touch reactive state, and a dependency taken here would
            // re-run this whole effect on every playback frame — tearing the
            // idle timer down and starting it again, so it could never fire.
            const view = untrack(() => chrome.view());
            const next = view.present && !view.paused;
            if (next === playing) return;
            playing = next;
            if (next) schedule();
            else reveal();
        };
        readPlayback();
        const unsubscribe = chrome.subscribe(readPlayback);

        return () => {
            cancel();
            unsubscribe();
            viewer.removeEventListener('pointermove', reveal);
            viewer.removeEventListener('pointerdown', reveal);
            viewer.removeEventListener('keydown', reveal);
            bar.removeEventListener('pointerenter', enter);
            bar.removeEventListener('pointerleave', leave);
            bar.removeEventListener('focusin', focusMoved);
            bar.removeEventListener('focusout', focusMoved);
            pointerInBar = false;
            playing = false;
            idleHidden = false;
        };
    });
</script>

{#snippet choiceControls(group: ChoiceGroup, abbreviated: boolean)}
    {@const crowded = group.choices.length > 4}
    <div class="choice-controls">
        <div class="choice-stack">
            <Icon name="Stack" size={14} />
        </div>

        {#if crowded}
            {@const selectedValue =
                group.selectedChoiceId ?? getResourceId(group.choices[0])}
            <div class="choice-select-wrap">
                <NativeSelect
                    size="xs"
                    value={selectedValue}
                    style="border-radius:var(--tri-radius-controls-buttons);max-width:20rem"
                    onchange={(e: Event) => {
                        const idx = (e.currentTarget as HTMLSelectElement)
                            .selectedIndex;
                        if (idx >= 0)
                            selectChoice(group.canvasId, group.choices[idx]);
                    }}
                >
                    {#each group.choices as choice, i (getResourceId(choice) || i)}
                        {@const id = getResourceId(choice)}
                        {@const displayLabel = getChoiceDisplayLabel(
                            choice,
                            i,
                            abbreviated,
                        )}
                        <option value={id}>
                            {displayLabel}
                        </option>
                    {/each}
                </NativeSelect>
            </div>
        {/if}

        <!-- One button per alternative, at every width. Narrow viewports show
             the bare ordinal for the alternatives that are not current and the
             full label for the one that is; from `640px` up every button shows
             its label, and a group too long to fit as buttons hands over to the
             select above. Which of the two spans is visible is CSS, so the live
             button count is the number of alternatives.

             The accessible name leads with the same ordinal, so whichever span
             is showing, the visible text is contained in the name (WCAG 2.5.3)
             and "click two" still reaches the button it names. -->
        <div class="join choice-join" class:crowded>
            {#each group.choices as choice, i (getResourceId(choice) || i)}
                {@const id = getResourceId(choice)}
                {@const label = getChoiceLabel(choice, i)}
                {@const isSelected = group.selectedChoiceId
                    ? group.selectedChoiceId === id
                    : i === 0}
                <Button
                    class="join-item choice-btn"
                    size="xs"
                    variant={isSelected ? 'primary' : 'default'}
                    ghost={!isSelected}
                    onclick={() => selectChoice(group.canvasId, choice)}
                    aria-pressed={isSelected}
                    aria-label={`${i + 1}: ${label}`}
                    title={abbreviated ? label : undefined}
                >
                    {#if abbreviated}
                        {i + 1}
                    {:else}
                        <span class="choice-full" class:current={isSelected}
                            >{label}</span
                        ><span class="choice-ordinal" class:current={isSelected}
                            >{i + 1}</span
                        >
                    {/if}
                </Button>
            {/each}
        </div>
    </div>
{/snippet}

{#if showNav || showZoom || hasChoices || isUnified || transportChrome}
    <div
        class="control-bar"
        class:elevated={viewerState.showCanvasInfo}
        class:wrapped={barWrapped}
        class:full-width={!!transportChrome}
        class:idle-hidden={idleHidden}
        data-testid="control-bar"
        bind:this={barEl}
    >
        {#if isUnified}
            <div class="toolbar-in-bar" bind:this={toolbarEl}>
                <Toolbar inline />
            </div>
            {#if dividerAfterToolbar}
                <div class="divider-v"></div>
            {/if}
        {/if}

        {#if transportChrome}
            <!-- The playback controls: a group of this bar, between the toolbar
                 buttons and the canvas navigation. The bar's `flex-wrap: wrap`
                 drops later items first, so the navigation is what moves and the
                 transport ends up on the row above it. Its root is bound rather
                 than wrapped, so a view with nothing to drive (`present: false`)
                 leaves no empty group holding a width floor open. -->
            <Transport
                chrome={transportChrome}
                openDown={tracksOpenDown}
                bind:element={transportEl}
                bind:listOpen={trackListOpen}
            />
            {#if dividerAfterTransport}
                <div class="divider-v"></div>
            {/if}
        {/if}

        {#if hasChoices || hasCenterControls}
            <!-- The canvas nav/zoom/choices are kept together as one no-wrap group:
             the bar's first break separates this cluster from the toolbar
             buttons (see .control-bar / .nav-cluster), and this cluster itself
             never breaks internally. -->
            <div class="nav-cluster" bind:this={navEl}>
                {#if leftChoiceGroup}
                    {@render choiceControls(
                        leftChoiceGroup,
                        useAbbreviatedChoiceLabels,
                    )}
                {/if}

                {#if leftChoiceGroup && (hasCenterControls || rightChoiceGroup)}
                    <div class="divider-v"></div>
                {/if}

                {#if hasCenterControls}
                    <div class="center-controls">
                        {#if showZoom}
                            <div class="btn-row">
                                <Button
                                    square
                                    size="sm"
                                    ghost
                                    onclick={() => viewerState.zoomOut()}
                                    aria-label="Zoom Out"
                                >
                                    <Icon
                                        name="MagnifyingGlassMinus"
                                        size={18}
                                    />
                                </Button>

                                <Button
                                    square
                                    size="sm"
                                    ghost
                                    onclick={() => viewerState.zoomIn()}
                                    aria-label="Zoom In"
                                >
                                    <Icon
                                        name="MagnifyingGlassPlus"
                                        size={18}
                                    />
                                </Button>
                            </div>
                        {/if}

                        {#if showZoom && showNav}
                            <div class="divider-v"></div>
                        {/if}

                        {#if showNav}
                            <div class="btn-row">
                                <Button
                                    square
                                    size="sm"
                                    ghost
                                    disabled={canvasNavLayout.leftButton ===
                                    'previous'
                                        ? !viewerState.hasPrevious
                                        : !viewerState.hasNext}
                                    onclick={() =>
                                        canvasNavLayout.leftButton ===
                                        'previous'
                                            ? viewerState.previousCanvas()
                                            : viewerState.nextCanvas()}
                                    aria-label={canvasNavLayout.leftButton ===
                                    'previous'
                                        ? m.previous_canvas()
                                        : m.next_canvas()}
                                >
                                    <Icon name={leftNavIcon} size={18} />
                                </Button>

                                <span class="nav-index">
                                    {viewerState.currentCanvasIndex + 1} / {viewerState
                                        .canvases.length}
                                </span>

                                <CanvasInfoPopover />

                                <Button
                                    square
                                    size="sm"
                                    ghost
                                    disabled={canvasNavLayout.rightButton ===
                                    'next'
                                        ? !viewerState.hasNext
                                        : !viewerState.hasPrevious}
                                    onclick={() =>
                                        canvasNavLayout.rightButton === 'next'
                                            ? viewerState.nextCanvas()
                                            : viewerState.previousCanvas()}
                                    aria-label={canvasNavLayout.rightButton ===
                                    'next'
                                        ? m.next_canvas()
                                        : m.previous_canvas()}
                                >
                                    <Icon name={rightNavIcon} size={18} />
                                </Button>
                            </div>
                        {/if}
                    </div>
                {/if}

                {#if rightChoiceGroup && (hasCenterControls || leftChoiceGroup)}
                    <div class="divider-v"></div>
                {/if}

                {#if rightChoiceGroup}
                    {@render choiceControls(
                        rightChoiceGroup,
                        useAbbreviatedChoiceLabels,
                    )}
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .control-bar {
        user-select: none;
        position: absolute;
        /* Alignment along the edge is set per data-nav-align below; center is default.
           Center via auto margins with left/right anchored to both edges rather
           than the `left:50% + translateX(-50%)` trick — the latter caps the
           box's available width at 50% of the container (the distance from the
           50% mark to the right edge), which forces the unified bar to
           wrap/shrink once its content exceeds half the viewport. Spanning both
           edges lets it grow to nearly the full width (minus the chrome inset on
           each side) before it's constrained. */
        left: var(--ui-nav-inset, 0);
        right: var(--ui-nav-inset, 0);
        width: fit-content;
        max-width: calc(100% - 2 * var(--ui-nav-inset, 0));
        margin-inline: auto;
        /* Anchored to whichever edge data-nav-edge selects (bottom by default). */
        bottom: var(--ui-nav-inset, 0);
        /*
           Above `.plugin-overlay-layer` (40), which is a SIBLING in
           `.viewer-area`. A plugin layer is transparent to pointer events, but
           its children opt back in — a claimed AV canvas's media element does,
           for tap-to-toggle — and a layer spans the whole viewer area, so at a
           lower z-index this bar is painted under that media and loses the hit
           test for every control in it. That cost the navigation and the zoom
           buttons whenever a recording was open, and it would now cost the
           playback controls the same plugin registers.

           Below `.plugin-overlay` (42), the box for a plugin panel positioned
           `overlay`: that is discrete chrome a reader operates, and only its
           own content takes pointer events, so where one overlaps the bar the
           panel is the thing being used. Still below core's annotation shapes
           (50): those are focusable targets carrying the viewer's own
           accessible names.
        */
        z-index: 41;
        display: flex;
        align-items: center;
        justify-content: center;
        /* Allow the bar to break: the toolbar-button group and the nav-cluster
           are the two flex items, so when combined they exceed the available
           width the (later) nav-cluster drops to its own row first. Row-gap
           matches the inline gap so stacked rows sit evenly. */
        flex-wrap: wrap;
        gap: var(--ui-gap, 0.5rem);
        padding-inline: var(--ui-chrome-pad, 0.5rem);
        /* Vertically centre the stacked rows (a no-op on a single row). */
        align-content: center;
        color: var(--tri-toolbar-content);
        border-radius: var(--tri-radius-controls);
        border: 1px solid var(--tri-surface-border);
        box-shadow: var(--ui-nav-shadow, none);
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }
    /* Glass on a ::before layer so `.control-bar` doesn't establish a
       backdrop-filter isolation root — this lets popovers anchored to the
       unified-bar buttons run their own backdrop-filter against the image.
       `.control-bar` has z-index/position (a stacking context), so the pseudo
       sits behind the bar's content but above the canvas. */
    .control-bar::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        /* Inset by the 1px border (inset:0 resolves to the padding box), so the
           radius must shrink by that same amount to stay concentric with the
           outer border — using the parent's radius as-is leaves a gap at the
           corners where the border's background peeks through. */
        border-radius: calc(
            var(--tri-radius-controls) - var(--tri-border, 1px)
        );
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-bg) 70%,
            transparent
        );
        backdrop-filter: blur(8px);
    }
    .control-bar.elevated {
        z-index: 1000;
    }

    /* Idle over a claimed canvas. Transparent AND inert: an invisible bar that
       still took clicks would be the original bug with the evidence removed.
       Deliberately not `visibility`/`display` — the controls stay in the
       accessibility tree and stay focusable, and focus arriving reveals them. */
    .control-bar.idle-hidden {
        opacity: 0;
        pointer-events: none;
    }
    /* Once broken into rows, give the stacked content equal breathing room top
       and bottom — on a single row the pill hugs the controls (no block
       padding), which reads as uneven spacing once a second row appears. */
    .control-bar.wrapped {
        padding-block: var(--ui-chrome-pad, 0.5rem);
    }

    /* nav-edge=top — anchor the bar to the top edge instead of the bottom. */
    :global([data-nav-edge='top']) .control-bar {
        top: var(--ui-nav-inset, 0);
        bottom: auto;
    }

    /* nav-style=docked — the bar sits flush to its edge: the two corners on that
       edge are squared and its border on that edge is dropped. */
    :global([data-nav-style='docked'][data-nav-edge='bottom']) .control-bar,
    :global([data-nav-style='docked'][data-nav-edge='bottom'])
        .control-bar::before {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }
    :global([data-nav-style='docked'][data-nav-edge='bottom']) .control-bar {
        border-bottom: 0;
    }
    :global([data-nav-style='docked'][data-nav-edge='top']) .control-bar,
    :global([data-nav-style='docked'][data-nav-edge='top'])
        .control-bar::before {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }
    :global([data-nav-style='docked'][data-nav-edge='top']) .control-bar {
        border-top: 0;
    }

    /* nav-align — placement of the control bar along its edge (offset honours the
       floating inset; 0 when docked). start/end are logical (LTR: left/right). */
    :global([data-nav-align='start']) .control-bar {
        inset-inline-start: var(--ui-nav-inset, 0);
        inset-inline-end: auto;
        transform: none;
        margin-inline: 0;
    }
    :global([data-nav-align='end']) .control-bar {
        inset-inline-start: auto;
        inset-inline-end: var(--ui-nav-inset, 0);
        transform: none;
        margin-inline: 0;
    }
    /* When docked into a corner, square the other corner on the touching side and
       drop that side's border too (the edge itself is already handled above).

       `:not(.full-width)` is what makes nav-align inert while transport chrome
       is registered: these are the only align-derived rules a later
       `.full-width` block could not outrank, so they opt out by not matching at
       all rather than by being restated — restating them would have to
       re-derive the corners the nav-edge docking already squared. */
    :global([data-nav-style='docked'][data-nav-align='start'])
        .control-bar:not(.full-width) {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
        border-inline-start: 0;
    }
    :global([data-nav-style='docked'][data-nav-align='end'])
        .control-bar:not(.full-width) {
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        border-inline-end: 0;
    }
    :global([data-nav-style='docked'][data-nav-align='start'])
        .control-bar:not(.full-width)::before {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
    }
    :global([data-nav-style='docked'][data-nav-align='end'])
        .control-bar:not(.full-width)::before {
        border-start-end-radius: 0;
        border-end-end-radius: 0;
    }

    /* While transport chrome is registered the bar spans its full available
       width, because the scrubber's width IS the resolution at which a reader
       can aim at a moment. The toolbar then hugs the start, the navigation hugs
       the end, and the transport takes the slack between them.

       This is also where nav-align goes inert: a full-width bar has nowhere to
       align, so the insets and margins the alignment rules above set are
       restored. Deliberately after them — the two selectors have equal
       specificity, so source order is what decides. The setting is not removed
       or deprecated; it resumes meaning the moment the chrome deregisters. */
    .control-bar.full-width {
        width: auto;
        inset-inline-start: var(--ui-nav-inset, 0);
        inset-inline-end: var(--ui-nav-inset, 0);
        margin-inline: auto;
    }

    /* Unified — the toolbar buttons sit at the start of the control bar,
       separated from the canvas nav/zoom by a divider. */
    .toolbar-in-bar {
        display: inline-flex;
        align-items: center;
    }
    /* The nav/zoom/choices group: stays on a single line (never breaks
       internally) so the only break here is between it and the toolbar
       buttons. */
    .nav-cluster {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: var(--ui-gap, 0.5rem);
    }

    .choice-controls {
        display: flex;
        align-items: center;
        gap: var(--ui-gap, 0.25rem);
    }
    .choice-stack {
        display: flex;
        align-items: center;
        padding-inline: 0.25rem;
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        opacity: 0.5;
    }

    .center-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .btn-row {
        display: flex;
        align-items: center;
        gap: var(--ui-gap, 0.25rem);
    }
    /* The pill's zoom/nav buttons inherit the controls-button radius (defaults to the
       field radius) rather than being forced circles. Scoped to .btn-row so the choice
       .join-item buttons keep their own join radii. */
    .control-bar .btn-row :global(.btn) {
        border-start-start-radius: var(--tri-radius-controls-buttons);
        border-start-end-radius: var(--tri-radius-controls-buttons);
        border-end-end-radius: var(--tri-radius-controls-buttons);
        border-end-start-radius: var(--tri-radius-controls-buttons);
    }

    .divider-v {
        height: 1rem;
        width: 1px;
        background-color: color-mix(
            in oklab,
            var(--tri-toolbar-content) 20%,
            transparent
        );
    }

    .nav-index {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            'Liberation Mono', 'Courier New', monospace;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        padding-inline: 0.25rem;
    }

    /* join group (radii handled by the join-aware primitives) */
    .join {
        display: inline-flex;
        align-items: stretch;
        --join-ss: 0;
        --join-se: 0;
        --join-es: 0;
        --join-ee: 0;
    }
    .join > :global(.join-item:first-child) {
        --join-ss: var(--tri-radius-buttons);
        --join-es: var(--tri-radius-buttons);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--tri-radius-buttons);
        --join-ee: var(--tri-radius-buttons);
    }
    .join > :global(.join-item:not(:first-child)) {
        margin-inline-start: calc(var(--tri-border, 1px) * -1);
    }

    /* The narrow-viewport presentation of a choice button: wide enough for an
       ordinal, and showing the label only for the current alternative. */
    .join > :global(.choice-btn) {
        min-width: 2rem;
    }
    .choice-full:not(.current),
    .choice-ordinal.current {
        display: none;
    }
    .choice-select-wrap {
        display: none;
    }
    @media (width >= 640px) {
        /* Room for every label, so the ordinals go away and a group too long to
           fit as buttons is shown as the select instead. */
        .join > :global(.choice-btn) {
            min-width: auto;
        }
        .choice-full:not(.current) {
            display: inline;
        }
        .choice-ordinal {
            display: none;
        }
        .choice-select-wrap {
            display: flex;
        }
        .choice-join.crowded {
            display: none;
        }
    }
</style>
