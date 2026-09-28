<script lang="ts">
    import { replaceState } from '$app/navigation';
    import { onMount, tick } from 'svelte';
    import type { ViewTarget } from '@triiiceratops/config';
    import type { CanvasRegion, ViewerState } from 'triiiceratops';

    import { dragContentState } from './dragSource';
    import { describeDroppedManifest, firstCanvasId } from './droppedMaterial';
    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import type { Example } from './examples';
    import {
        FEATURE_GROUPS,
        FEATURE_GROUP_TABS,
        FEATURES,
        type DragChip,
        type FeatureGroup,
    } from './features';
    import { resolveDroppedView } from './droppedView';
    import { featureSearch, parseFeatureIndex } from './featureSelection';
    import type { SitePlugin } from './sitePlugins';
    import { SITE_VIEWER_THEME } from './viewerTheme';

    let at = $state(0);
    let viewerState = $state<ViewerState | undefined>(undefined);

    const total = FEATURES.length;
    const active = $derived(FEATURES[at] ?? FEATURES[0]);
    const byGroup = new Map<FeatureGroup, readonly number[]>(
        FEATURE_GROUPS.map((group) => [
            group,
            FEATURES.flatMap((feature, index) =>
                feature.group === group ? [index] : [],
            ),
        ]),
    );
    const openTab = $derived(active.group);
    const listed = $derived(byGroup.get(openTab) ?? []);
    const themeConfig = $derived({
        ...SITE_VIEWER_THEME,
        radiusButtons: '1rem',
        ...active.themeConfig,
    });

    let driven = -1;
    let asked = -1;

    /* $state.raw: plugin identity is the activation lifetime; a proxy would read as leave+arrive. */
    let plugin = $state.raw<SitePlugin | undefined>(undefined);

    $effect(() => {
        const load = active.plugin;
        const want = at;
        if (!load) {
            plugin = undefined;
            asked = -1;
            return;
        }
        if (asked === want) return;
        asked = want;
        void load().then((loaded) => {
            if (at === want) plugin = loaded;
        });
    });

    $effect(() => {
        const viewer = viewerState;
        if (viewer?.isManifestReady(active.example.manifest) !== true) return;
        if (driven === at) return;
        driven = at;
        active.drive?.(viewer);
    });

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
        at = parseFeatureIndex(window.location.search, total);
        showSelectedInRail();
    });

    function showSelectedInRail() {
        const rail = railEl;
        const option = rail?.querySelector<HTMLElement>(
            '[role="radio"][aria-checked="true"]',
        );
        if (!rail || !option) return;
        rail.scrollTop =
            option.offsetTop - rail.clientHeight / 2 + option.offsetHeight / 2;
    }

    let carried = $state<
        | {
              readonly example: Example;
              readonly canvasId: string;
              readonly region: CanvasRegion | null;
          }
        | undefined
    >(undefined);

    const shown = $derived(
        carried ?? {
            example: active.example,
            canvasId: active.canvasId,
            region: null,
        },
    );

    async function takeView(view: ViewTarget | null) {
        if (!view?.manifestId) return;

        const same = (manifest: string) =>
            new URL(manifest, location.href).href === view.manifestId;

        if (same(shown.example.manifest)) {
            if (!view.canvasId) return;
            viewerState?.setCanvas(view.canvasId, null, view.region ?? null);
            return;
        }

        const chip = active.dragPayloads?.find((candidate) =>
            same(
                candidate.carries?.example.manifest ?? active.example.manifest,
            ),
        );
        if (chip && view.canvasId) {
            carried = {
                example: chip.carries?.example ?? active.example,
                canvasId: view.canvasId,
                region: view.region ?? null,
            };
            return;
        }

        await carryUnknown(view);
    }

    async function carryUnknown(view: ViewTarget) {
        const { manifestId } = view;
        dropping = manifestId;

        let json: unknown;
        try {
            const response = await fetch(manifestId);
            if (!response.ok) return;
            json = await response.json();
        } catch {
            return;
        }

        if (dropping !== manifestId) return;
        dropping = undefined;

        const canvasId = view.canvasId || firstCanvasId(json);
        if (!canvasId) return;

        carried = {
            example: describeDroppedManifest(manifestId, json),
            canvasId,
            region: view.region ?? null,
        };
    }

    let dropping = $state<string | undefined>(undefined);

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;
        void takeView(resolveDroppedView(event.dataTransfer));
    }

    let dragOver = $state(false);

    function onDragStart(event: DragEvent, chip: DragChip) {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData(
            'text/plain',
            dragContentState(chip.state, location.href),
        );
        event.dataTransfer.effectAllowed = 'copy';
    }

    function applyPayload(chip: DragChip) {
        const state = dragContentState(chip.state, location.href);
        void takeView(
            resolveDroppedView({
                types: ['text/plain'],
                getData: () => state,
            }),
        );
    }

    /* SvelteKit's `replaceState`: the router owns this history entry. */
    function syncUrl() {
        replaceState(featureSearch(at), {});
    }

    function select(next: number) {
        at = (next + total) % total;
        carried = undefined;
        dropping = undefined;
        syncUrl();
    }

    function onRailKeys(event: KeyboardEvent) {
        const step =
            event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const here = listed.indexOf(at);
        const nextAt = listed[(here + step + listed.length) % listed.length];
        if (nextAt === undefined) return;
        select(nextAt);
        void focusIn(`[role="radio"][data-at="${nextAt}"]`);
    }

    function selectGroup(group: FeatureGroup) {
        const first = byGroup.get(group)?.[0];
        if (first !== undefined) select(first);
    }

    function onTabKeys(event: KeyboardEvent) {
        const step =
            event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const here = FEATURE_GROUPS.indexOf(openTab);
        const next =
            FEATURE_GROUPS[
                (here + step + FEATURE_GROUPS.length) % FEATURE_GROUPS.length
            ];
        if (!next) return;
        selectGroup(next);
        void focusIn(`[role="tab"][data-tab="${next}"]`);
    }

    async function focusIn(selector: string) {
        await tick();
        railEl?.querySelector<HTMLButtonElement>(selector)?.focus();
    }
</script>

<div class="featstage">
    <div class="featstage__rail" bind:this={railEl}>
        <div
            class="featstage__tabs"
            role="tablist"
            aria-label="Kinds of feature"
        >
            {#each FEATURE_GROUPS as group (group)}
                <button
                    type="button"
                    role="tab"
                    data-tab={group}
                    aria-selected={group === openTab}
                    aria-controls="featstage-list"
                    tabindex={group === openTab ? 0 : -1}
                    class="featstage__tab"
                    class:on={group === openTab}
                    onclick={() => selectGroup(group)}
                    onkeydown={onTabKeys}
                >
                    {FEATURE_GROUP_TABS[group]}
                </button>
            {/each}
        </div>
        <div
            class="featstage__group"
            id="featstage-list"
            role="radiogroup"
            aria-label={openTab}
        >
            {#each listed as index (FEATURES[index].name)}
                {@const feature = FEATURES[index]}
                <button
                    type="button"
                    role="radio"
                    data-at={index}
                    aria-checked={index === at}
                    class="featstage__opt"
                    class:on={index === at}
                    onclick={() => select(index)}
                    onkeydown={onRailKeys}
                >
                    <span class="featstage__name">{feature.name}</span>
                    <span class="featstage__say">{feature.what}</span>
                </button>
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
            acceptDroppedContentState={false}
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
