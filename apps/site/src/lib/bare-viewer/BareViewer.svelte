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
    import { replaceState } from '$app/navigation';
    import { AvPlugin } from '@triiiceratops/plugin-av';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';

    import { SITE_VIEWER_THEME } from '$lib/viewerTheme';

    import { recipeChrome } from './recipePanels';

    const plugins: readonly SdkPlugin[] = [AvPlugin, ImageManipulationPlugin];

    type ViewerConfig = NonNullable<
        ComponentProps<typeof TriiiceratopsViewer>['config']
    >;

    const SUPPORTED_LOCALES = ['en', 'de'] as const;
    type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

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

    const BASE_CONFIG: ViewerConfig = {
        locale: readerLocale(),
        controls: 'unified',
        loadMessages: async (locale) =>
            locale === 'de'
                ? (await import('triiiceratops/locales/de.json')).default
                : undefined,
    };

    const themeConfig: ThemeConfig = {
        ...SITE_VIEWER_THEME,
        radiusButtons: '1rem',
    };

    let viewerState = $state<ViewerState | undefined>();
    let contentState = $state<string | undefined>();
    let pasted = $state('');
    let dragOver = $state(false);
    let rejected = $state('');

    /* Opened, never closed: the viewer applies a config only when its value moves, and this moves only when the manifest does. */
    const config: ViewerConfig = $derived.by(() => {
        const chrome = recipeChrome(viewerState?.manifestId);
        if (!chrome) return BASE_CONFIG;
        return {
            ...BASE_CONFIG,
            toolbarOpen: true,
            information: { open: chrome.panel === 'information' },
            annotations: { open: chrome.panel === 'annotations' },
            collection: { open: chrome.panel === 'collection' },
            structures: { open: chrome.panel === 'structures' },
            plugins: { av: { open: chrome.panel === 'av' } },
        };
    });

    let canvasInfoOpenedFor = $state<string | undefined>();
    $effect(() => {
        const manifestId = viewerState?.manifestId;
        if (!manifestId || canvasInfoOpenedFor === manifestId) return;
        canvasInfoOpenedFor = manifestId;
        if (recipeChrome(manifestId)?.canvasInfo && viewerState) {
            viewerState.showCanvasInfo = true;
        }
    });

    const openedOnContentState = new URLSearchParams(location.search).has(
        'iiif-content',
    );

    /* Cache entry, not `manifestId`: an id exists even for a failed fetch. */
    const showFallback = $derived.by(() => {
        if (rejected) return true;
        const entry = viewerState?.manifestEntry;
        if (!entry) return !openedOnContentState && !contentState;
        if (entry.error) return true;
        return !entry.json && !entry.isFetching;
    });

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
        publish(value);
    }

    /* SvelteKit's `replaceState`: the router owns this history entry. Loop-safe: the viewer reads `iiif-content` once, on mount. */
    function publish(value: string) {
        const carried = [...new URLSearchParams(location.search)].filter(
            ([name]) => name !== 'iiif-content',
        );
        const params = new URLSearchParams([
            ...carried,
            ['iiif-content', value],
        ]);
        replaceState(`${location.pathname}?${params}`, {});
    }

    function onDragOver(event: DragEvent) {
        if (!carriesContentState(event.dataTransfer)) return;
        event.preventDefault();
        dragOver = true;
    }

    function onDragLeave(event: DragEvent) {
        const pane = event.currentTarget as HTMLElement;
        const entered = event.relatedTarget as Node | null;
        if (entered && pane.contains(entered)) return;
        dragOver = false;
    }

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
    .viewer-pane {
        position: relative;
        flex: 1;
        min-height: 0;
    }

    /* Stacking context: the viewer's own `z-index: 41` bar must not paint through the panes below. */
    .stage {
        position: absolute;
        inset: 0;
        z-index: 0;
    }

    .fallback {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s3);
        padding: var(--s4);
        background: var(--bone);
        color: var(--ink);
    }

    .waiting {
        position: absolute;
        inset: 0;
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

    .drop-target {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s4);
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
