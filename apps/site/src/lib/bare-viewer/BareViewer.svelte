<script lang="ts">
    import type { ComponentProps } from 'svelte';
    import {
        TriiiceratopsViewer,
        type SdkPlugin,
        type ViewerError,
        type ViewerState,
    } from 'triiiceratops/svelte';
    import {
        carriesContentState,
        readDroppedContentState,
    } from '@triiiceratops/config';
    import type { ThemeConfig } from 'triiiceratops';
    import { AvPlugin } from '@triiiceratops/plugin-av';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    import { SITE_VIEWER_THEME } from '$lib/viewerTheme';

    import { recipeChrome } from './recipePanels';

    /*
     * Exactly the plugins needed to render or inspect the content a recipe
     * points at. The export plugins are features of the viewer rather than of
     * any recipe, and `/features/` is where each of those is shown.
     */
    const plugins: readonly SdkPlugin[] = [AvPlugin, ImageManipulationPlugin];

    /*
     * Core does not export `ViewerConfig` by name; the viewer component's own
     * prop type is the public way to name it.
     */
    type ViewerConfig = NonNullable<
        ComponentProps<typeof TriiiceratopsViewer>['config']
    >;

    /*
     * The locales this host offers chrome in. Core ships only English inline;
     * German is core's published `triiiceratops/locales/de.json` asset, which a
     * host is the one to supply — see `config` below, where it is declared and
     * fetched. The bundler needs that import specifier literal, so this list and
     * that import are the two places the app names a locale.
     */
    const SUPPORTED_LOCALES = ['en', 'de'] as const;
    type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

    /*
     * The reader's most preferred language this host can supply chrome for,
     * matched on the primary subtag so `en-US` counts as `en`. English is the
     * base locale and the default.
     */
    function readerLocale(): SupportedLocale {
        const preferred = navigator.languages?.length
            ? navigator.languages
            : [navigator.language];

        for (const tag of preferred) {
            const primary = tag.split('-')[0]?.toLowerCase();
            const supported = SUPPORTED_LOCALES.find(
                (locale) => locale === primary,
            );
            if (supported) return supported;
        }

        return 'en';
    }

    // The reader's own language, and one layout choice: a single bar keeps the
    // chrome out of the way of material this route exists to show.
    const BASE_CONFIG: ViewerConfig = {
        locale: readerLocale(),
        controls: 'unified',
        /*
         * The German catalog is fetched only for a reader `readerLocale` put
         * there. The toolbar's language picker offers the manifest's languages,
         * not this one — which language the chrome is written in is this host's
         * call, made by `locale` above.
         */
        loadMessages: async (locale) =>
            locale === 'de'
                ? (await import('triiiceratops/locales/de.json')).default
                : undefined,
    };

    /*
     * The site's own theme, as every embedded viewer in the tree wears. Its
     * slots are token references, so the viewer re-steps with the page whenever
     * the bar's toggle moves `data-theme`. No built-in `theme` is passed,
     * because one would win over this.
     *
     * One slot is this route's own: the site's 2px corners are the prose
     * routes' idiom, where a viewer is a figure set in a page. Here the viewer
     * is the page, and its controls float over the material rather than sitting
     * in a frame with it. `radiusToolbar` and both `radiusControls*` slots
     * default to this one, so the whole of the chrome rounds together.
     */
    const themeConfig: ThemeConfig = {
        ...SITE_VIEWER_THEME,
        radiusButtons: '1rem',
    };

    let viewerState = $state<ViewerState | undefined>();
    let contentState = $state<string | undefined>();
    let pasted = $state('');
    let dragOver = $state(false);
    let rejected = $state('');

    /*
     * The base config plus whatever the loaded manifest's recipe asks the chrome
     * to open. The manifest comes from the viewer rather than from this page
     * reading the address bar, for the reason `showFallback` gives below.
     *
     * Chrome is opened, never closed: this reads as the page's opening state, so
     * a reader who shuts the bar or the panel must not have it spring back. That
     * holds because the viewer applies a config only when its value moves, and
     * this one moves only when the manifest does.
     */
    const config: ViewerConfig = $derived.by(() => {
        const chrome = recipeChrome(viewerState?.manifestId);
        if (!chrome) return BASE_CONFIG;
        return {
            ...BASE_CONFIG,
            // Every recognised recipe opens it: see `recipeChrome`.
            toolbarOpen: true,
            information: { open: chrome.panel === 'information' },
            annotations: { open: chrome.panel === 'annotations' },
            collection: { open: chrome.panel === 'collection' },
            structures: { open: chrome.panel === 'structures' },
            /*
             * `av` is the id `@triiiceratops/plugin-av` registers its chrome
             * under, and the key a host addresses that chrome by. Harmless on a
             * manifest with no recording: the plugin marks itself unavailable
             * and core renders no panel for it.
             */
            plugins: { av: { open: chrome.panel === 'av' } },
        };
    });

    /*
     * Whether the address this page was opened at named anything to show.
     *
     * Read once, and only for its presence: resolving it stays the viewer's, as
     * `read-content-state-from-url` and ADR 0006 have it. What the page cannot
     * get from the viewer is the difference between "nothing was asked for" and
     * "something was, and has not come back yet" — before a content state
     * resolves there is no manifest to ask about, and those two states want
     * opposite screens.
     */
    const openedOnContentState = new URLSearchParams(location.search).has(
        'iiif-content',
    );

    /*
     * The fallback is driven by what the viewer has: the manifest it ends up
     * with is the only honest answer to "is there anything to show".
     *
     * The cache entry, not `manifestId`: an id is assigned even for a manifest
     * whose fetch failed, so a broken link would otherwise show neither a canvas
     * nor a way to type another URL. An entry still in flight is not a failure —
     * the fallback is opaque and covers the viewer, so it waits for the request
     * to settle rather than flashing over a manifest that is on its way.
     *
     * No entry at all is the same wait one step earlier: a content state is
     * dereferenced before there is a manifest to have an entry for, and offering
     * the reader a box to type a manifest URL into, over the manifest their link
     * already named, is the flash that window used to produce. Every way that
     * wait can end badly has its own signal — a failed fetch is `entry.error`, an
     * unresolvable content state is `rejected` — so nothing is swallowed by
     * waiting for one of them.
     */
    const showFallback = $derived.by(() => {
        // A rejected drop has nowhere else to speak: the form is this page's
        // only text surface, and it is also the reader's way onward.
        if (rejected) return true;
        const entry = viewerState?.manifestEntry;
        if (!entry) return !openedOnContentState && !contentState;
        if (entry.error) return true;
        return !entry.json && !entry.isFetching;
    });

    /*
     * The counterpart of `showFallback`'s wait: the same window, from the other
     * side. One of the two covers the viewer whenever it has nothing to show, so
     * its empty stage is never what the reader is looking at.
     */
    const showWaiting = $derived(
        !showFallback && !viewerState?.manifestEntry?.json,
    );

    const REJECTED_MESSAGE =
        'That was not a IIIF manifest URL or content state.';

    function open(event: SubmitEvent) {
        event.preventDefault();
        const value = pasted.trim();
        if (value) {
            accept(value);
        }
    }

    function accept(value: string) {
        rejected = '';
        contentState = value;
    }

    function onDragOver(event: DragEvent) {
        if (!carriesContentState(event.dataTransfer)) return;
        // Without this the browser treats the pane as a non-target and never
        // fires `drop`.
        event.preventDefault();
        dragOver = true;
    }

    /*
     * `dragleave` bubbles from every descendant the pointer crosses, so a
     * pointer still inside the pane would otherwise flicker the drop state off
     * and on for the whole drag.
     */
    function onDragLeave(event: DragEvent) {
        const pane = event.currentTarget as HTMLElement;
        const entered = event.relatedTarget as Node | null;
        if (entered && pane.contains(entered)) return;
        dragOver = false;
    }

    /*
     * A drop is one more writer of `contentState`: this page sets no discrete
     * manifest props, so the viewer's own precedence ladder ingests what a drop
     * carries, down the same resolution path the URL parameter and the form
     * already take (ADR 0006).
     */
    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;

        const payload = readDroppedContentState(event.dataTransfer);
        if (!payload) {
            rejected = REJECTED_MESSAGE;
            return;
        }
        accept(payload);
    }

    /*
     * The viewer's own verdict on a content state it could not resolve. Anything
     * else on the channel is a developer-facing failure this page has no surface
     * for and no answer to.
     */
    function onViewerError(error: ViewerError) {
        if (
            error.scope === 'content-state' &&
            error.code === 'content-state-unresolved'
        ) {
            rejected = REJECTED_MESSAGE;
        }
    }
</script>

<div
    class="viewer-pane"
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    role="presentation"
>
    <div class="stage">
        <TriiiceratopsViewer
            acceptDroppedContentState
            bind:viewerState
            {config}
            {themeConfig}
            {plugins}
            {contentState}
            readContentStateFromUrl
            onviewererror={onViewerError}
        />
    </div>

    {#if showWaiting}
        <!--
            The route's own `.appwait` in the viewer's clothing: it hands over the
            moment this component mounts, which is long before there is a canvas,
            and two different grounds either side of that handover read as a
            flash. Same words and same ground, so the reader sees one screen from
            first paint to first canvas. `aria-hidden`: the message it duplicates
            has already been announced.
        -->
        <div class="waiting" data-testid="content-waiting" aria-hidden="true">
            <p>Loading the viewer…</p>
        </div>
    {/if}

    {#if showFallback}
        <form class="fallback" onsubmit={open}>
            <label for="content-state">Manifest URL or IIIF content state</label
            >
            <div class="row">
                <input
                    class="sh-field field"
                    id="content-state"
                    name="content-state"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    data-testid="content-state-input"
                    bind:value={pasted}
                />
                <button
                    class="sh-btn"
                    type="submit"
                    data-testid="content-state-open">Open</button
                >
            </div>
            {#if rejected}
                <p
                    class="rejected"
                    role="alert"
                    data-testid="content-state-rejected"
                >
                    {rejected}
                </p>
            {/if}
        </form>
    {/if}

    {#if dragOver}
        <div class="drop-target" data-testid="drop-target">
            <span>Drop a IIIF link or content state to open it</span>
        </div>
    {/if}
</div>

<style>
    /*
     * The page's colour, type and space come from the site's tokens; nothing
     * here restates a value. The scheme follows `<html data-theme>` through
     * them, so the page and the viewer step together.
     */
    .viewer-pane {
        position: relative;
        /* The route lays this out as a flex column under its bar; `min-height`
           keeps the canvas from being sized by its own content. */
        flex: 1;
        min-height: 0;
    }

    /*
     * A stacking context around the viewer, so that the panes below cover it
     * whole. Without one, chrome the viewer lifts within itself — the control
     * bar sits at `z-index: 41` in its own stylesheet — paints through a pane
     * that is supposed to stand in for the view, and the site would have to
     * answer with a number of its own and keep it ahead of core's.
     */
    .stage {
        position: absolute;
        inset: 0;
        z-index: 0;
    }

    .fallback {
        position: absolute;
        inset: 0;
        /* Above `.stage`'s context, which is the whole of the viewer. */
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s3);
        padding: var(--s4);
        /* Opaque: it stands in for the content, over an empty viewer. */
        background: var(--bone);
        color: var(--ink);
    }

    /* `.fallback`'s geometry on the route's ground: this stands in for the
       viewer while it is still empty, where the fallback stands in for the
       content when there will not be any. */
    .waiting {
        position: absolute;
        inset: 0;
        /* See `.fallback`. */
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--s4);
        text-align: center;
        color: var(--ink);
        background: var(--bench);
    }

    .rejected {
        margin: 0;
        max-width: min(40rem, 100%);
        text-align: center;
        color: var(--ink-2);
    }

    /* No permanent chrome: this exists only while a compatible drag is over the
       pane. */
    .drop-target {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s4);
        /* The drag must reach the pane, not this overlay: a drop landing on an
           element that appeared mid-drag would retarget the event. */
        pointer-events: none;
        text-align: center;
        color: var(--ink);
        background: color-mix(in srgb, var(--bone) 85%, transparent);
        outline: 3px dashed currentColor;
        outline-offset: -0.75rem;
    }

    .row {
        display: flex;
        gap: var(--s3);
        width: min(40rem, 100%);
    }

    .field {
        flex: 1;
        min-width: 0;
    }
</style>
