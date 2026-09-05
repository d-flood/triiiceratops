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
    import { AvPlugin } from '@triiiceratops/plugin-av';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    /*
     * Exactly the plugins needed to render or inspect the content a recipe
     * points at. Authoring tools — the annotation editor, image and PDF export —
     * are playground features and are not dependencies of this application.
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
     * The locales the viewer has messages for. Core does not export this list,
     * so it is named here; core exposing it would remove the duplication. It is
     * the only place the app names a locale.
     */
    const SUPPORTED_LOCALES = ['en', 'de'] as const;
    type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

    /*
     * The reader's most preferred language the viewer can actually speak,
     * matched on the primary subtag so `en-US` counts as `en`. A tag the viewer
     * has no messages for must not be handed through: core's compiled messages
     * end in their last locale rather than in a fallback, so `fr` would render
     * German. English is the base locale and the default.
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

    // The reader's own language, and nothing else: this application has no
    // settings, so `locale` is the browser's and `theme` is left unset, which is
    // what makes the viewer follow `prefers-color-scheme`.
    const config: ViewerConfig = { locale: readerLocale() };

    let viewerState = $state<ViewerState | undefined>();
    let contentState = $state<string | undefined>();
    let pasted = $state('');
    let dragOver = $state(false);
    let rejected = $state('');

    /*
     * The fallback is driven by what the viewer has, never by this page reading
     * the address bar: `read-content-state-from-url` hands the `iiif-content`
     * parameter to the viewer (ADR 0006), so the manifest it ends up with is the
     * only honest answer to "is there anything to show".
     *
     * The cache entry, not `manifestId`: an id is assigned even for a manifest
     * whose fetch failed, so a broken link would otherwise show neither a canvas
     * nor a way to type another URL. An entry still in flight is not a failure —
     * the fallback is opaque and covers the viewer, so it waits for the request
     * to settle rather than flashing over a manifest that is on its way.
     */
    const showFallback = $derived.by(() => {
        // A rejected drop has nowhere else to speak: the form is this page's
        // only text surface, and it is also the reader's way onward.
        if (rejected) return true;
        const entry = viewerState?.manifestEntry;
        if (!entry) return true;
        if (entry.error) return true;
        return !entry.json && !entry.isFetching;
    });

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
    <TriiiceratopsViewer
        bind:viewerState
        {config}
        {plugins}
        {contentState}
        readContentStateFromUrl
        onviewererror={onViewerError}
    />

    {#if showFallback}
        <form class="fallback" onsubmit={open}>
            <label for="content-state">Manifest URL or IIIF content state</label
            >
            <div class="row">
                <input
                    id="content-state"
                    name="content-state"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    data-testid="content-state-input"
                    bind:value={pasted}
                />
                <button type="submit" data-testid="content-state-open"
                    >Open</button
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
    .viewer-pane {
        position: relative;
        height: 100%;
    }

    .fallback {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1rem;
        /* Opaque: it stands in for the content, over an empty viewer. */
        background-color: #ffffff;
        color: #1a1a1a;
    }

    @media (prefers-color-scheme: dark) {
        .fallback {
            background-color: #1a1a1a;
            color: #f2f2f2;
        }
    }

    .rejected {
        margin: 0;
        max-width: min(40rem, 100%);
        text-align: center;
    }

    /* No permanent chrome: this exists only while a compatible drag is over the
       pane. */
    .drop-target {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        /* The drag must reach the pane, not this overlay: a drop landing on an
           element that appeared mid-drag would retarget the event. */
        pointer-events: none;
        text-align: center;
        color: #1a1a1a;
        background-color: #ffffffd9;
        outline: 3px dashed currentColor;
        outline-offset: -0.75rem;
    }

    @media (prefers-color-scheme: dark) {
        .drop-target {
            color: #f2f2f2;
            background-color: #1a1a1ad9;
        }
    }

    .row {
        display: flex;
        gap: 0.5rem;
        width: min(40rem, 100%);
    }

    input {
        flex: 1;
        min-width: 0;
        padding: 0.5rem;
        font: inherit;
    }

    button {
        padding: 0.5rem 1rem;
        font: inherit;
    }
</style>
