<script lang="ts">
    /*
     * /svelte/ demo — a real Svelte-package CONSUMER.
     *
     * Everything the viewer needs comes from the BUILT package (`triiiceratops`,
     * `triiiceratops/plugins/*`, `triiiceratops/style.css`) exactly as an
     * external app would import it — NOT from `src/lib`. This is the page that
     * would have caught the "styles missing from the Svelte dist" regression:
     * if `triiiceratops/style.css` lacked the tokens/themes, the viewer here
     * would render unstyled.
     *
     * The page CHROME (header/controls) is deliberately styled with the demo's
     * own fixed CSS — not the viewer's design tokens — because the published
     * stylesheet is scoped to `.viewer-root` and (correctly) does not leak onto
     * the host page. A consumer styles their own chrome; the viewer styles
     * itself.
     */
    import { TriiiceratopsViewer } from 'triiiceratops';
    import type { BuiltInTheme } from 'triiiceratops';
    import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
    import { AnnotationEditorPlugin } from 'triiiceratops/plugins/annotation-editor';
    import { PdfExportPlugin } from 'triiiceratops/plugins/pdf-export';
    import { ImageDownloadPlugin } from 'triiiceratops/plugins/image-download';

    const SUGGESTED = [
        {
            label: 'Wellcome Collection (b18035723)',
            url: 'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
        },
        {
            label: 'Harvard — Van Gogh Self-Portrait',
            url: 'https://iiif.harvardartmuseums.org/manifests/object/299843',
        },
        {
            label: 'IIIF Cookbook — Single Image',
            url: 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json',
        },
    ];

    const THEMES: Array<{ value: '' | BuiltInTheme; label: string }> = [
        { value: '', label: 'System default' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'Teal', label: 'Teal' },
        { value: 'dracula', label: 'Dracula' },
    ];

    const plugins = [
        ImageManipulationPlugin,
        AnnotationEditorPlugin,
        PdfExportPlugin,
        ImageDownloadPlugin,
    ];

    // Full-featured config so the viewer chrome renders like /viewer/.
    const config = {
        showToggle: true,
        toolbarOpen: true,
        showCanvasNav: true,
        showZoomControls: true,
        enableDragDrop: true,
        leftPanelWidth: '320px',
        rightPanelWidth: '320px',
        toolbar: {
            showSearch: true,
            showGallery: true,
            showAnnotations: true,
            showFullscreen: true,
            showInfo: true,
            showViewingMode: true,
        },
        gallery: { open: false, draggable: true, showCloseButton: true },
        search: { open: false, showCloseButton: true, query: '' },
        annotations: { open: false, showCloseButton: true },
        information: { open: false, showCloseButton: true, showButton: true },
        structures: { open: false, showCloseButton: true },
        collection: { open: false, showCloseButton: true },
    };

    const params = new URLSearchParams(window.location.search);

    let manifestUrl = $state(params.get('manifest') || SUGGESTED[0].url);
    let currentManifest = $state(params.get('manifest') || SUGGESTED[0].url);
    let canvasId = $state(params.get('canvas') || '');
    let theme = $state<'' | BuiltInTheme>(
        (params.get('theme') as BuiltInTheme) || '',
    );

    function load() {
        currentManifest = manifestUrl;
    }
</script>

<div class="page">
    <header class="chrome">
        <div class="brand">
            <strong>triiiceratops</strong>
            <span class="tag">/svelte/ — built package consumer</span>
        </div>
        <div class="row">
            <input
                class="url"
                type="text"
                bind:value={manifestUrl}
                placeholder="IIIF manifest URL"
                onkeydown={(e) => e.key === 'Enter' && load()}
            />
            <button class="btn" onclick={load}>Load</button>
            <label class="field">
                Theme
                <select bind:value={theme}>
                    {#each THEMES as t (t.value)}
                        <option value={t.value}>{t.label}</option>
                    {/each}
                </select>
            </label>
        </div>
        <div class="suggested">
            {#each SUGGESTED as s (s.url)}
                <button
                    class="chip"
                    onclick={() => {
                        manifestUrl = s.url;
                        load();
                    }}>{s.label}</button
                >
            {/each}
        </div>
    </header>

    <main class="viewer-pane">
        <TriiiceratopsViewer
            manifestId={currentManifest}
            {canvasId}
            {config}
            theme={theme || undefined}
            {plugins}
        />
    </main>
</div>

<style>
    /* Bespoke, token-independent chrome — represents the HOST app's own styling. */
    :global(html, body) {
        margin: 0;
        height: 100%;
    }
    .page {
        display: flex;
        flex-direction: column;
        height: 100vh;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
        background: #14161a;
        color: #e7e9ee;
    }
    .chrome {
        flex: 0 0 auto;
        padding: 0.75rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        border-bottom: 1px solid #2a2e37;
        background: #1b1e24;
    }
    .brand {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
    }
    .brand strong {
        font-size: 1.05rem;
        letter-spacing: 0.01em;
    }
    .tag {
        font-size: 0.75rem;
        color: #98a2b3;
    }
    .row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    .url {
        flex: 1 1 22rem;
        min-width: 12rem;
        padding: 0.45rem 0.6rem;
        border-radius: 0.4rem;
        border: 1px solid #343a45;
        background: #0f1114;
        color: #e7e9ee;
        font: inherit;
    }
    .btn {
        padding: 0.45rem 0.9rem;
        border-radius: 0.4rem;
        border: 1px solid #3a4658;
        background: #2b6cff;
        color: #fff;
        cursor: pointer;
        font: inherit;
    }
    .btn:hover {
        background: #1f5ae0;
    }
    .field {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        color: #98a2b3;
    }
    .field select {
        padding: 0.4rem 0.5rem;
        border-radius: 0.4rem;
        border: 1px solid #343a45;
        background: #0f1114;
        color: #e7e9ee;
        font: inherit;
    }
    .suggested {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .chip {
        padding: 0.3rem 0.6rem;
        border-radius: 999px;
        border: 1px solid #343a45;
        background: #23272f;
        color: #cdd3dd;
        cursor: pointer;
        font-size: 0.78rem;
    }
    .chip:hover {
        border-color: #2b6cff;
        color: #fff;
    }
    .viewer-pane {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
    }
    /* The viewer fills its pane (it styles ITSELF via the scoped package CSS). */
    .viewer-pane :global(.viewer-root) {
        position: absolute;
        inset: 0;
    }
</style>
