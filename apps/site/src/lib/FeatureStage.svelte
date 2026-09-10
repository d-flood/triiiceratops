<script lang="ts">
    import { replaceState } from '$app/navigation';
    import { onMount } from 'svelte';
    import type { ViewTarget } from '@triiiceratops/config';
    import type { CanvasRegion, ViewerState } from 'triiiceratops';

    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import type { Example } from './examples';
    import { FEATURES, type DragChip, type FeatureGroup } from './features';
    import { resolveDroppedView } from './playground/drop';
    import { featureSearch, parseFeatureIndex } from './featureSelection';
    import type { SitePlugin } from './sitePlugins';
    import { SITE_VIEWER_THEME } from './viewerTheme';

    /**
     * What the viewer can do, one feature at a time, in one stage.
     *
     * Picking a feature does not describe it: it puts the running viewer into
     * the state that shows it. The manifest that has the feature is loaded, the
     * canvas worth opening on is selected, the panel or mode it lives in is
     * opened, and anything left over is driven by command — so a reader sees
     * the feature working rather than a claim that it works.
     *
     * Every feature also arrives shut of the previous one. The stage is a
     * single viewer instance, so each feature's arrangement names the whole
     * chrome rather than its own corner of it (see `features.ts`): pick the
     * grid and the grid opens; pick anything else and the grid collapses.
     *
     * One viewer rather than twelve, and only the feature showing is fetched —
     * including its plugin, where the feature is a plugin.
     *
     * This page shows capability, not configurability: every feature runs in
     * the route's one shared chrome. The instrument for configuring is
     * `/configure/`. There is deliberately no cycle and no transport here
     * either: a reader explores the features, and nothing advances underneath
     * them.
     *
     * The rail sits left of the stage and first in the document, on purpose.
     * The viewer's own pager turns the leaves of the material showing; the rail
     * turns the features. A control that moved features from inside the stage
     * would read as a slideshow inside a slideshow, and a rail that came after
     * the viewer would make a keyboard reader tab through the whole chrome
     * before reaching the control that changes what it shows.
     */

    let at = $state(0);
    let viewerState = $state<ViewerState | undefined>(undefined);

    const total = FEATURES.length;
    const active = $derived(FEATURES[at] ?? FEATURES[0]);
    /**
     * Where each heading falls in the rail: the index of the first feature of
     * each group. Order in `FEATURES` is what groups them, so a feature moves
     * between headings by moving in that list and nowhere else.
     */
    const headings = new Map<number, FeatureGroup>(
        FEATURES.flatMap((feature, index) =>
            FEATURES[index - 1]?.group === feature.group
                ? []
                : [[index, feature.group] as const],
        ),
    );
    /**
     * The chrome this route wears: the site's own tokens with a rounded
     * control radius throughout. Route-wide rather than per feature — this
     * page demonstrates capability, and the theming comparison lives
     * elsewhere — so a feature's own override only ever changes its panel
     * ground, never the radius.
     */
    const themeConfig = $derived({
        ...SITE_VIEWER_THEME,
        radiusButtons: '1rem',
        ...active.themeConfig,
    });

    /**
     * Which feature has been driven, and which has had its plugin asked for.
     *
     * Both are commands rather than mirrors of state, and both are plain
     * variables for that reason. Selecting the same annotation twice clears it
     * and the reader is free to clear it themselves, so an effect that re-ran
     * on the state it sets would fight whoever is holding the mouse.
     */
    let driven = -1;
    let asked = -1;

    /**
     * The plugin the feature showing is about, once its package has arrived.
     *
     * `$state.raw` is load-bearing. A plugin's activation lifetime follows the
     * plugin OBJECT's identity inside the array a host passes, so that a host
     * re-evaluating its array keeps its plugins; deep state would hand the
     * viewer a fresh proxy of the same plugin on every assignment, and the
     * viewer would read that as one plugin leaving and another arriving. The
     * AV features all name the same plugin, so what a switch between two of
     * them cost was the whole plugin: its stages torn down and rebuilt, the
     * media element replaced, its caption tracks re-parsed from the network —
     * and a caption list the arriving feature had just opened shut again,
     * because a list standing over tracks that have gone is a list addressing
     * nothing.
     */
    let plugin = $state.raw<SitePlugin | undefined>(undefined);

    /**
     * Fetch the feature's plugin, for the one feature that is a plugin.
     *
     * The page's argument is that the viewer is light, so the plugin is on the
     * same deferral as the viewer itself: a reader who never picks the image
     * tools never downloads them.
     */
    $effect(() => {
        const load = active.plugin;
        const want = at;
        if (!load) {
            plugin = undefined;
            // Leaving a plugin feature also forgets that it was asked for, so
            // coming back to it asks again rather than reading as in flight.
            asked = -1;
            return;
        }
        if (asked === want) return;
        asked = want;
        void load().then((loaded) => {
            // The reader may have moved on while the package was in flight.
            if (at === want) plugin = loaded;
        });
    });

    /**
     * Put the reader in front of the feature that has been opened.
     *
     * Config can only open a panel; a feature whose point is a single note has
     * to select that note, and the note is named in a manifest that has to have
     * loaded first — so this waits for the feature's own manifest rather than
     * driving whatever is on the stage.
     */
    $effect(() => {
        const viewer = viewerState;
        if (viewer?.isManifestReady(active.example.manifest) !== true) return;
        if (driven === at) return;
        driven = at;
        active.drive?.(viewer);
    });

    /**
     * Show the captions, for the feature whose subject is that they exist.
     *
     * Captions start off in every viewer, and there is no config leaf for them:
     * a track is only selectable once its file has parsed with cues in it, so
     * the honest way to ask is to wait for the offer and take it. The plugin's
     * published AVState is the seam — `getAVState` is imported from the same
     * already-loaded chunk as the plugin, so this costs no second fetch.
     *
     * Once, and once only, like the other commands on this page: a reader who
     * turns the captions back off has said something, and a subscriber that
     * re-applied the wish on the notification that reader's own click produced
     * would be arguing with them.
     */
    $effect(() => {
        if (!active.captionsOn) return;
        const viewer = viewerState;
        if (!viewer || !plugin) return;

        let stop: (() => void) | undefined;
        let cancelled = false;

        void import('@triiiceratops/plugin-av').then(({ getAVState }) => {
            if (cancelled) return;
            const av = getAVState(viewer);
            if (!av) return;

            const take = () => {
                const first = av.captionTracks[0];
                if (!first) return;
                av.setCaptionTrack(first.url);
                stop?.();
                stop = undefined;
            };
            // Subscribed before the first read, so a set that settles between
            // the two is not missed.
            stop = av.subscribe(take);
            take();
        });

        return () => {
            cancelled = true;
            stop?.();
        };
    });

    let railEl: HTMLElement | undefined = $state();

    onMount(() => {
        // The route prerenders, so there is no query string at render time:
        // the served markup is the first feature and the requested one is read
        // here, before the viewer module has loaded, so the viewer starts on
        // the linked feature rather than flashing through the first.
        at = parseFeatureIndex(window.location.search, total);
        showSelectedInRail();
    });

    /**
     * Bring the checked option into the rail, for an arrival that did not
     * scroll there itself.
     *
     * A shared link can name any feature, and the rail is longer than it is
     * tall — so a reader following one would otherwise land with the option
     * that is checked somewhere below the fold, and no sign of which feature
     * they were sent to. Only on arrival: a click leaves the rail where the
     * reader put it, and the arrow keys move focus, which scrolls of itself.
     *
     * The rail's own scroll, rather than `scrollIntoView`: the strip is a band
     * of a longer page, and nudging the nearest scrollable ancestor would move
     * the page under a reader who has not asked for it.
     */
    function showSelectedInRail() {
        const rail = railEl;
        const option =
            rail?.querySelectorAll<HTMLElement>('[role="radio"]')[at];
        if (!rail || !option) return;
        rail.scrollTop =
            option.offsetTop - rail.clientHeight / 2 + option.offsetHeight / 2;
    }

    /**
     * The material a drop replaced the feature's own with, or `undefined` while
     * the stage shows what the feature named.
     *
     * A drop naming another manifest cannot be handed to the viewer as a
     * `contentState`: the stage always names a manifest, and the viewer's
     * precedence ladder discards a content state whenever a discrete manifest
     * prop is present (ADR 0006). So the stage resolves the payload itself and
     * takes the manifest over — which means it also owes the reader the
     * reserved box for the material it swapped in.
     *
     * A command, not a mirror of anything, and cleared by the switch that ends
     * it: a feature the reader picks shows its OWN material.
     */
    let carried = $state<
        | {
              readonly example: Example;
              readonly canvasId: string;
              readonly region: CanvasRegion | null;
          }
        | undefined
    >(undefined);

    /** The material on the stage: what a drop carried in, or the feature's own. */
    const shown = $derived(
        carried ?? {
            example: active.example,
            canvasId: active.canvasId,
            region: null,
        },
    );

    /**
     * Take a view carried in from outside — a chip beside this feature, or
     * anything else a IIIF publisher hands out.
     *
     * One rule for both chips, so neither has a special case: a view naming the
     * manifest on the stage moves the view INSIDE it, and a view naming any
     * other replaces it. Only a manifest one of this feature's chips declares
     * can be shown — the stage owes a reader a reserved shape for
     * whatever it loads, and it has none for a manifest it has never heard of — so anything else is refused rather than silently reframed.
     */
    function takeView(view: ViewTarget | null) {
        if (!view?.canvasId) return;

        if (view.manifestId === shown.example.manifest) {
            viewerState?.setCanvas(view.canvasId, null, view.region ?? null);
            return;
        }

        const chip = active.dragPayloads?.find(
            (candidate) =>
                (candidate.carries?.example.manifest ??
                    active.example.manifest) === view.manifestId,
        );
        if (!chip) return;

        carried = {
            example: chip.carries?.example ?? active.example,
            canvasId: view.canvasId,
            region: view.region ?? null,
        };
    }

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
        takeView(resolveDroppedView(event.dataTransfer));
    }

    let dragOver = $state(false);

    /** Carry a chip's content state, for a drop anywhere that takes one. */
    function onDragStart(event: DragEvent, chip: DragChip) {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(chip.state));
        event.dataTransfer.effectAllowed = 'copy';
    }

    /**
     * The same view, for a reader who is not holding a mouse. A drag has no
     * keyboard equivalent, so each chip is a button as well as a drag source.
     */
    function applyPayload(chip: DragChip) {
        takeView(
            resolveDroppedView({
                types: ['text/plain'],
                getData: () => JSON.stringify(chip.state),
            }),
        );
    }

    /**
     * Keep the address bar on the feature showing, so the page can be linked.
     *
     * SvelteKit's `replaceState`, not the History API's: the router owns this
     * history entry, and writing it behind the router's back leaves the two
     * disagreeing about which page is current — which the framework warns about
     * on every call, and which surfaces as a feature switch that snaps back to
     * the previous one when a reader moves through the rail quickly.
     */
    function syncUrl() {
        replaceState(featureSearch(at), {});
    }

    /** Show one feature. */
    function select(next: number) {
        at = (next + total) % total;
        // A picked feature shows its own material, never the one a drop on the
        // previous feature left standing.
        carried = undefined;
        syncUrl();
    }

    function onRailKeys(event: KeyboardEvent) {
        const forward =
            event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
        const back =
            event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 1 : 0;
        if (forward + back !== 1) return;
        event.preventDefault();
        const next = (at + forward - back + total) % total;
        select(next);
        // Focus follows the selection for arrow keys only: a click leaves focus
        // where the reader put it.
        const group = (event.currentTarget as HTMLElement).closest(
            '[role="radiogroup"]',
        );
        group
            ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
            [next]?.focus();
    }
</script>

<div class="featstage">
    <div class="featstage__rail" bind:this={railEl}>
        <div class="featstage__group" role="radiogroup" aria-label="Features">
            {#each FEATURES as feature, index (feature.name)}
                <!-- Headings rule the rail into its four kinds of feature.
                     `aria-hidden`, and inside the group rather than around it:
                     a radio group's children are its radios, and a reader
                     arrowing through them should not have to leave and re-enter
                     one at every rule. -->
                {#if headings.has(index)}
                    <p class="featstage__head" aria-hidden="true">
                        {headings.get(index)}
                    </p>
                {/if}
                <button
                    type="button"
                    role="radio"
                    aria-checked={index === at}
                    class="featstage__opt"
                    class:on={index === at}
                    onclick={() => select(index)}
                    onkeydown={onRailKeys}
                >
                    <span class="featstage__name">{feature.name}</span>
                    <span class="featstage__say">{feature.what}</span>
                </button>
                <!-- The one feature the reader has to act on, and the chips sit
                     under the option that asked for them: the drag source and
                     the thing it is dragged onto are then on screen together,
                     which is the whole of what this feature has to show. -->
                {#if index === at}
                    {#each feature.dragPayloads ?? [] as chip (chip.label)}
                        <button
                            type="button"
                            class="featstage__chip"
                            draggable="true"
                            ondragstart={(event) => onDragStart(event, chip)}
                            onclick={() => applyPayload(chip)}
                        >
                            <span aria-hidden="true">⠿</span>
                            {chip.label}
                        </button>
                    {/each}
                {/if}
            {/each}
        </div>
        <p class="vh" role="status">
            Showing feature {at + 1} of {total}: {active.name}
        </p>
    </div>
    <div
        class="featstage__viewer"
        class:over={dragOver}
        ondragover={(event) => {
            event.preventDefault();
            dragOver = true;
        }}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
        role="presentation"
    >
        <EmbeddedViewer
            bind:viewerState
            fill
            eager
            example={shown.example}
            canvasId={shown.canvasId}
            initialCanvasRegion={shown.region}
            config={active.config}
            plugins={plugin ? [plugin] : false}
            {themeConfig}
            label={shown.example.label}
        />
    </div>
</div>

<noscript>
    {#each FEATURES as feature (feature.name)}
        <section>
            <h2>{feature.name}</h2>
            <p>{feature.what}</p>
            <p>
                {feature.material} —
                <a href={feature.source.href}>{feature.source.who}</a>
            </p>
        </section>
    {/each}
</noscript>
