<script lang="ts">
    import type { ComponentProps } from 'svelte';
    import {
        TriiiceratopsViewer,
        type SdkPlugin,
        type ViewerState,
    } from 'triiiceratops/svelte';
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
        const entry = viewerState?.manifestEntry;
        if (!entry) return true;
        if (entry.error) return true;
        return !entry.json && !entry.isFetching;
    });

    function open(event: SubmitEvent) {
        event.preventDefault();
        const value = pasted.trim();
        if (value) {
            contentState = value;
        }
    }
</script>

<div class="viewer-pane">
    <TriiiceratopsViewer
        bind:viewerState
        {config}
        {plugins}
        {contentState}
        readContentStateFromUrl
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
        </form>
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
