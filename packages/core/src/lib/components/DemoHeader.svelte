<script lang="ts">
    import LightDarkToggle from './LightDarkToggle.svelte';
    import SettingsMenu from './SettingsMenu.svelte';
    import { Button, Select, TextInput, Tooltip } from './ui';

    import { m, language } from '../state/i18n.svelte';
    import type { BuiltInTheme } from '../theme/types';
    import { manifestsState } from '../state/manifests.svelte';
    import { locales, setLocale } from '../paraglide/runtime.js';
    import { getCanvasLabel } from '../utils/canvasLabels';
    // Canvases are raw IIIF JSON: `id` in v3, `@id` in v2.
    import { getCanvasId } from '../utils/iiifIds';

    import { onMount } from 'svelte';

    const isDev = import.meta.env.DEV;
    const multiTargetDemoManifestUrl = `${import.meta.env.BASE_URL}demo-manifests/multi-target-array/manifest.json`;

    /**
     * The audiovisual Cookbook recipes, at their canonical `iiif.io` URLs.
     *
     * Exactly the fifteen listed in the vendored corpus's `PROVENANCE.md` — the
     * recipes whose canvases carry a `Sound` or `Video` painting body. Fourteen
     * are supported; `0489-multimedia-canvas` is the documented degradation
     * (its image body paints, its spatially placed video renders full-rect).
     * They need `@triiiceratops/plugin-av` registered to do anything, which the
     * demo does in `Demo.svelte`.
     */
    const AV_MANIFESTS = [
        {
            label: '0002 Simplest Manifest - Audio',
            url: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
        },
        {
            label: '0003 Simplest Manifest - Video',
            url: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
        },
        {
            label: '0013 Placeholder Canvas (poster)',
            url: 'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/manifest.json',
        },
        {
            label: '0014 Accompanying Canvas (album art)',
            url: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
        },
        {
            label: '0015 Start Playback at a Given Time',
            url: 'https://iiif.io/api/cookbook/recipe/0015-start/manifest.json',
        },
        {
            label: '0017 Transcript of A/V Content',
            url: 'https://iiif.io/api/cookbook/recipe/0017-transcription-av/manifest.json',
        },
        {
            label: '0026 Table of Contents for A/V Content',
            url: 'https://iiif.io/api/cookbook/recipe/0026-toc-opera/manifest.json',
        },
        {
            label: '0064 Opera on One Canvas (temporal composition)',
            url: 'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/manifest.json',
        },
        {
            label: '0065 Opera Across Multiple Canvases',
            url: 'https://iiif.io/api/cookbook/recipe/0065-opera-multiple-canvases/manifest.json',
        },
        {
            label: '0074 Multiple Language Captions',
            url: 'https://iiif.io/api/cookbook/recipe/0074-multiple-language-captions/manifest.json',
        },
        {
            label: '0103 Annotating a Time-Based Region',
            url: 'https://iiif.io/api/cookbook/recipe/0103-poetry-reading-annotations/manifest.json',
        },
        {
            label: '0219 Using Caption and Subtitle Files',
            url: 'https://iiif.io/api/cookbook/recipe/0219-using-caption-file/manifest.json',
        },
        {
            label: '0229 Video Navigation with Ranges',
            url: 'https://iiif.io/api/cookbook/recipe/0229-behavior-ranges/manifest.json',
        },
        {
            label: '0434 Choice of Audio Formats',
            url: 'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
        },
        {
            label: '0489 Multimedia Canvas (degraded: image only)',
            url: 'https://iiif.io/api/cookbook/recipe/0489-multimedia-canvas/manifest.json',
        },
    ];

    const IMAGE_MANIFESTS = [
        {
            label: 'Wellcome Collection (b18035723)',
            url: 'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
        },
        {
            label: 'Self-Portrait Dedicated to Paul Gauguin',
            url: 'https://iiif.harvardartmuseums.org/manifests/object/299843',
        },
        {
            label: 'CSNTM (MNTGRCP40)',
            url: 'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
        },
        {
            label: 'Bodleian Library MS. Ind. Inst. Misc. 22',
            url: 'https://iiif.bodleian.ox.ac.uk/iiif/manifest/e32a277e-91e2-4a6d-8ba6-cc4bad230410.json',
        },
        {
            label: 'Yugoslavia',
            url: 'https://zavicajna.digitalna.rs/iiif/api/presentation/3/96571949-03d6-478e-ab44-a2d5ad68f935%252F00000001%252Fostalo01%252F00000071/manifest',
        },
        {
            label: '0001 Simplest Manifest - Single Image',
            url: 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json',
        },
        {
            label: '0004 Image and Canvas with Differing Dimensions',
            url: 'https://iiif.io/api/cookbook/recipe/0004-canvas-size/manifest.json',
        },
        {
            label: '0005 IIIF Image Service',
            url: 'https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json',
        },
        {
            label: '0006 Internationalization and Multi-language Values',
            url: 'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json',
        },
        {
            label: '0007 Embedding HTML in Descriptive Properties',
            url: 'https://iiif.io/api/cookbook/recipe/0007-string-formats/manifest.json',
        },
        {
            label: '0008 Rights Statement',
            url: 'https://iiif.io/api/cookbook/recipe/0008-rights/manifest.json',
        },
        {
            label: '0009 Simple Manifest - Book',
            url: 'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
        },
        {
            label: '0010 Viewing Direction (RTL)',
            url: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
        },
        {
            label: '0010 Viewing Direction (TTB)',
            url: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-ttb.json',
        },
        {
            label: '0011 Book Behavior Variations (Continuous)',
            url: 'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-continuous.json',
        },
        {
            label: '0011 Book Behavior Variations (Individuals)',
            url: 'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-individuals.json',
        },
        {
            label: '0019 HTML in Annotations',
            url: 'https://iiif.io/api/cookbook/recipe/0019-html-in-annotations/manifest.json',
        },
        {
            label: '0021 Simple Annotation - Tagging',
            url: 'https://iiif.io/api/cookbook/recipe/0021-tagging/manifest.json',
        },
        {
            label: '0024 Table of Contents',
            url: 'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
        },
        {
            label: '0027 Alternative Page Sequences',
            url: 'https://iiif.io/api/cookbook/recipe/0027-alternative-page-order/manifest.json',
        },
        {
            label: '0029 Metadata on Any Resource',
            url: 'https://iiif.io/api/cookbook/recipe/0029-metadata-anywhere/manifest.json',
        },
        {
            label: '0030 Multi-volume Work',
            url: 'https://iiif.io/api/cookbook/recipe/0030-multi-volume/collection.json',
        },
        {
            label: '0031 Multiple Volumes in a Single Bound Volume',
            url: 'https://iiif.io/api/cookbook/recipe/0031-bound-multivolume/manifest.json',
        },
        {
            label: '0032 Simple Collection',
            url: 'https://iiif.io/api/cookbook/recipe/0032-collection/collection.json',
        },
        {
            label: '0033 Multiple Choice of Images',
            url: 'https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json',
        },
        {
            label: '0035 Foldouts, Flaps, and Maps',
            url: 'https://iiif.io/api/cookbook/recipe/0035-foldouts/manifest.json',
        },
        {
            label: '0036 Composition from Multiple Images',
            url: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
        },
        {
            label: '0046 Alternative Representations',
            url: 'https://iiif.io/api/cookbook/recipe/0046-rendering/manifest.json',
        },
        {
            label: '0047 Homepage',
            url: 'https://iiif.io/api/cookbook/recipe/0047-homepage/manifest.json',
        },
        {
            label: '0053 seeAlso',
            url: 'https://iiif.io/api/cookbook/recipe/0053-seeAlso/manifest.json',
        },
        {
            label: '0117 Manifest Thumbnail',
            url: 'https://iiif.io/api/cookbook/recipe/0117-add-image-thumbnail/manifest.json',
        },
        {
            label: '0118 Multiple Values with Language Maps',
            url: 'https://iiif.io/api/cookbook/recipe/0118-multivalue/manifest.json',
        },
        {
            label: '0135 Annotating a Specific Point',
            url: 'https://iiif.io/api/cookbook/recipe/0135-annotating-point-in-canvas/manifest.json',
        },
        {
            label: 'Multi-Target Annotation Array',
            url: multiTargetDemoManifestUrl,
        },
        {
            label: '0202 Start Canvas',
            url: 'https://iiif.io/api/cookbook/recipe/0202-start-canvas/manifest.json',
        },
        {
            label: '0230 Navigation by Chronology',
            url: 'https://iiif.io/api/cookbook/recipe/0230-navdate/navdate-collection.json',
        },
        {
            label: '0234 Provider',
            url: 'https://iiif.io/api/cookbook/recipe/0234-provider/manifest.json',
        },
        {
            label: '0261 Non-Rectangular Polygon Annotation',
            url: 'https://iiif.io/api/cookbook/recipe/0261-non-rectangular-commenting/manifest.json',
        },
        {
            label: '0266 Full-Canvas Annotation',
            url: 'https://iiif.io/api/cookbook/recipe/0266-full-canvas-annotation/manifest.json',
        },
        {
            label: '0269 Embedded or Referenced Annotations',
            url: 'https://iiif.io/api/cookbook/recipe/0269-embedded-or-referenced-annotations/manifest.json',
        },
        {
            label: '0283 Missing Images in a Sequence',
            url: 'https://iiif.io/api/cookbook/recipe/0283-missing-image/manifest.json',
        },
        {
            label: '0299 Addressing a Spatial Region',
            url: 'https://iiif.io/api/cookbook/recipe/0299-region/manifest.json',
        },
    ];

    const SUGGESTED_MANIFESTS = [...IMAGE_MANIFESTS, ...AV_MANIFESTS];

    let {
        manifestUrl = $bindable(),
        onLoad,
        viewerMode = $bindable('core'),
        canvasId = $bindable(''),
        config = $bindable({}),
        demoTheme = $bindable('light'),
        viewerTheme = 'light',
        onThemeChange,
        baseConfig,
        availableLocales = [],
        onReset,
        onShare,
    }: {
        manifestUrl: string;
        onLoad: () => void;
        viewerMode: string;
        canvasId: string;
        config: any;
        demoTheme?: 'light' | 'dark';
        viewerTheme?: BuiltInTheme;
        onThemeChange?: (theme: BuiltInTheme) => void;
        baseConfig?: any;
        availableLocales?: string[];
        onReset?: () => void;
        onShare?: () => Promise<void>;
    } = $props();

    onMount(() => {
        if (!manifestUrl) {
            manifestUrl = SUGGESTED_MANIFESTS[0].url;
            onLoad();
        }
    });

    let isCustom = $derived(
        !SUGGESTED_MANIFESTS.some((m) => m.url === manifestUrl),
    );

    let canvases = $derived(
        manifestUrl ? manifestsState.getCanvases(manifestUrl) : [],
    );
    const CUSTOM_MANIFEST = '__custom__';

    function selectManifest(value: string) {
        manifestUrl = value;
        onLoad();
    }

    function selectCustomManifest() {
        manifestUrl = '';
    }

    const languageNames: Record<string, string> = {
        en: 'English',
        de: 'Deutsch',
    };

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            onLoad();
        }
    }

    /*
     * The two glyphs this header draws, as raw Phosphor "regular" path data on
     * the Phosphor `0 0 256 256` viewBox.
     *
     * Inline rather than through core's generated icon table: that table is
     * indexed by a runtime string, so no bundler can tree-shake it, and a glyph
     * only the demo renders would be shipped bytes in every element artifact
     * (`scripts/icons.config.ts` states the rule). Nothing outside this demo
     * draws either one.
     */
    const GEAR_PATH =
        'M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z';
    const GITHUB_LOGO_PATH =
        'M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z';
</script>

<!--
    The header's own glyphs, wearing the same `<svg>` wrapper `Icon.svelte`
    gives a table-resolved one: `currentColor` fill, square box, and hidden from
    assistive technology so the surrounding control keeps the accessible name.
-->
{#snippet glyph(d: string)}
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 256 256"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
    >
        <path {d} />
    </svg>
{/snippet}

<header class="header">
    <!-- Top Row: Branding & Global Settings -->
    <div class="top-row">
        <a href="/triiiceratops/" class="btn-link ghost brand">Triiiceratops</a>
        <a href="/triiiceratops/" class="btn-link outline primary">{m.docs()}</a
        >

        <div class="spacer"></div>

        <div class="join viewer-mode">
            <Tooltip tip={m.viewer_variant_tooltip_core()} placement="bottom">
                <input
                    class="join-item btn-radio"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_core()}
                    value="core"
                    bind:group={viewerMode}
                />
            </Tooltip>
            <Tooltip tip={m.viewer_variant_tooltip_full()} placement="bottom">
                <input
                    class="join-item btn-radio"
                    type="radio"
                    name="viewerMode"
                    aria-label={m.viewer_variant_full()}
                    value="image"
                    bind:group={viewerMode}
                />
            </Tooltip>
            {#if isDev}
                <Tooltip
                    tip={m.viewer_variant_tooltip_custom_theme()}
                    placement="bottom"
                >
                    <input
                        class="join-item btn-radio"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_custom_theme()}
                        value="custom-theme"
                        bind:group={viewerMode}
                    />
                </Tooltip>
                <Tooltip
                    tip={m.viewer_variant_svelte_component_tooltip()}
                    placement="bottom"
                >
                    <input
                        class="join-item btn-radio"
                        type="radio"
                        name="viewerMode"
                        aria-label={m.viewer_variant_svelte()}
                        value="svelte"
                        bind:group={viewerMode}
                    />
                </Tooltip>
            {/if}
        </div>

        <Select
            size="sm"
            class="lang-select"
            value={language.current}
            onchange={(e) => setLocale(e.currentTarget.value as any)}
            aria-label={m.language_select_label()}
        >
            {#each locales as lang (lang)}
                <option value={lang}>{languageNames[lang] || lang}</option>
            {/each}
        </Select>

        <LightDarkToggle bind:theme={demoTheme} />

        <!-- Settings Dropdown -->
        <div class="dropdown dropdown-end settings-dropdown">
            <div
                tabindex="0"
                role="button"
                class="btn-trigger"
                aria-label={m.settings_label()}
            >
                {@render glyph(GEAR_PATH)}
            </div>
            <div class="dropdown-content settings-panel">
                <SettingsMenu
                    bind:config
                    {viewerTheme}
                    {onThemeChange}
                    {baseConfig}
                    {availableLocales}
                    {onReset}
                    {onShare}
                    class="menu settings-menu"
                />
            </div>
        </div>

        <Tooltip tip={m.github()} placement="bottom">
            <a
                href="https://github.com/d-flood/triiiceratops"
                class="btn-link ghost icon-link"
            >
                {@render glyph(GITHUB_LOGO_PATH)}
            </a>
        </Tooltip>
    </div>

    <!-- Bottom Row: External Controls -->
    <div class="bottom-row">
        <span class="controls-heading">{m.demo_header_external_controls()}</span
        >

        <!-- Manifest Selector -->
        <div class="control-group manifest-group">
            <label for="manifest-select" class="manifest-label">
                {m.iiif_manifest_label()}
            </label>
            <div class="control-group manifest-controls">
                <Select
                    id="manifest-select"
                    size="xs"
                    class="manifest-select"
                    value={isCustom ? CUSTOM_MANIFEST : manifestUrl}
                    onchange={(e) => {
                        const v = e.currentTarget.value;
                        if (v === CUSTOM_MANIFEST) selectCustomManifest();
                        else selectManifest(v);
                    }}
                >
                    {#each IMAGE_MANIFESTS as manifest (manifest.url)}
                        <option value={manifest.url}>{manifest.label}</option>
                    {/each}
                    <optgroup
                        label="Audio &amp; Video"
                        data-testid="av-recipes"
                    >
                        {#each AV_MANIFESTS as manifest (manifest.url)}
                            <option value={manifest.url}
                                >{manifest.label}</option
                            >
                        {/each}
                    </optgroup>
                    <option value={CUSTOM_MANIFEST}>{m.try_your_own()}</option>
                </Select>

                {#if isCustom}
                    <TextInput
                        id="manifest-input"
                        size="xs"
                        class="manifest-input"
                        bind:value={manifestUrl}
                        onkeydown={handleKeydown}
                        placeholder={m.manifest_placeholder()}
                        autocomplete="off"
                    />
                    <Button
                        onclick={onLoad}
                        variant="primary"
                        size="xs"
                        class="load-button"
                    >
                        {m.load()}
                    </Button>
                {/if}
            </div>
        </div>

        <div class="divider"></div>

        <!-- Canvas Selector -->
        <div class="control-group canvas-group">
            <label class="canvas-label" for="canvas-id-select">
                {m.demo_header_active_canvas()}
            </label>
            <Select
                id="canvas-id-select"
                size="xs"
                class="canvas-select"
                bind:value={canvasId}
                disabled={canvases.length === 0}
            >
                {#if canvases.length === 0}
                    <option value="" disabled>{m.no_canvases_loaded()}</option>
                {:else}
                    {#each canvases as canvas, i (getCanvasId(canvas))}
                        <option value={getCanvasId(canvas)}>
                            {getCanvasLabel(canvas, i)}
                        </option>
                    {/each}
                {/if}
            </Select>
        </div>
    </div>
</header>

<style>
    /* ===== Layout shell ===== */
    .header {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        position: relative;
        z-index: 800;
        background-color: var(--tri-panel-bg);
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
    }

    .top-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 0;
        padding: 0.5rem 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: color-mix(
            in oklab,
            var(--tri-surface-border) 50%,
            transparent
        );
    }

    .bottom-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 0;
        padding: 0.5rem 1rem;
        background-color: color-mix(
            in oklab,
            var(--tri-surface-border) 30%,
            transparent
        );
    }

    .spacer {
        flex: 1 1 0%;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }

    .manifest-controls {
        flex: 1 1 auto;
    }

    .divider {
        width: 1px;
        height: 1rem;
        margin-inline: 0.5rem;
        background-color: color-mix(
            in oklab,
            var(--tri-content) 20%,
            transparent
        );
    }

    /* Visually hidden but accessible */
    .manifest-label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
    }

    /* ===== Text bits ===== */
    .controls-heading {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.7;
    }

    .canvas-label {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.7;
    }

    /* ===== Anchor "buttons" (.btn look on <a>, not real buttons) ===== */
    .btn-link {
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: calc(var(--tri-size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        touch-action: manipulation;
        border-width: var(--tri-border);
        border-style: solid;
        border-color: transparent;
        border-radius: var(--tri-radius-buttons);
        color: var(--tri-content);
        background-color: transparent;
        text-decoration: none;
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }

    /* Ghost: transparent until hover */
    .btn-link.ghost {
        background-color: transparent;
        border-color: transparent;
    }
    @media (hover: hover) {
        .btn-link.ghost:hover {
            background-color: color-mix(
                in oklab,
                var(--tri-content) 10%,
                transparent
            );
        }
    }

    /* Outline + primary (docs link) */
    .btn-link.outline.primary {
        background-color: transparent;
        color: var(--tri-color-primary-text);
        border-color: var(--tri-color-primary);
    }
    @media (hover: hover) {
        .btn-link.outline.primary:hover {
            background-color: var(--tri-color-primary);
            color: var(--tri-color-primary-content);
            border-color: var(--tri-color-primary);
        }
    }

    /* Branding link extras: font-bold text-lg */
    .brand {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    /* ===== Settings trigger (div[role=button] styled as ghost btn-sm) ===== */
    .btn-trigger {
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: calc(var(--tri-size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
        touch-action: manipulation;
        border-width: var(--tri-border);
        border-style: solid;
        border-color: transparent;
        border-radius: var(--tri-radius-buttons);
        color: var(--tri-content);
        background-color: transparent;
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    @media (hover: hover) {
        .btn-trigger:hover {
            background-color: color-mix(
                in oklab,
                var(--tri-content) 10%,
                transparent
            );
        }
    }

    /* ===== join (segmented control wrapper) ===== */
    .join {
        display: inline-flex;
        align-items: stretch;
        min-width: 0;
    }

    .viewer-mode {
        max-width: 100%;
    }

    /* Radio inputs styled as joined buttons (.btn-sm look) */
    .btn-radio {
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        gap: 0.375rem;
        height: calc(var(--tri-size-field, 0.25rem) * 8);
        padding-inline: 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        --btn-bg: var(--btn-color, var(--tri-panel-bg));
        --btn-fg: var(--tri-content);
        --btn-border: color-mix(
            in oklab,
            var(--btn-bg),
            #000 calc(var(--tri-depth) * 5%)
        );
        --btn-shadow:
            0 3px 2px -2px
                color-mix(
                    in oklab,
                    var(--btn-bg) calc(var(--tri-depth) * 30%),
                    #0000
                ),
            0 4px 3px -2px
                color-mix(
                    in oklab,
                    var(--btn-bg) calc(var(--tri-depth) * 30%),
                    #0000
                );
        color: var(--btn-fg);
        background-color: var(--btn-bg);
        border-width: var(--tri-border);
        border-style: solid;
        border-color: var(--btn-border);
        text-shadow: 0 0.5px oklch(100% 0 0 / calc(var(--tri-depth) * 0.15));
        box-shadow:
            0 0.5px 0 0.5px oklch(100% 0 0 / calc(var(--tri-depth) * 6%)) inset,
            var(--btn-shadow);
        transition-property: color, background-color, border-color, box-shadow;
        transition-duration: 0.2s;
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
        /* join radii: default square (0); first/last/only override below. */
        border-start-start-radius: var(--join-ss, 0);
        border-start-end-radius: var(--join-se, 0);
        border-end-end-radius: var(--join-ee, 0);
        border-end-start-radius: var(--join-es, 0);
    }
    @media (hover: hover) {
        .btn-radio:hover {
            background-color: color-mix(
                in oklab,
                var(--btn-bg, var(--tri-panel-bg)),
                #000 7%
            );
        }
    }
    .btn-radio[aria-label]::after {
        content: attr(aria-label);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .btn-radio:checked {
        --btn-color: var(--tri-color-primary);
        --btn-fg: var(--tri-color-primary-content);
        isolation: isolate;
    }

    /* Join radius shaping. The radio lives inside a Tooltip <span>, which is the
       direct join child, so we set join vars on the inner .btn-radio based on the
       span's position. Items keep their own borders with no negative margins, so
       adjacent borders do not collapse — we intentionally add none here. */
    .join > :global(:first-child:not(:last-child) .btn-radio) {
        --join-ss: var(--tri-radius-buttons);
        --join-se: 0;
        --join-es: var(--tri-radius-buttons);
        --join-ee: 0;
    }
    .join > :global(:last-child:not(:first-child) .btn-radio) {
        --join-ss: 0;
        --join-se: var(--tri-radius-buttons);
        --join-es: 0;
        --join-ee: var(--tri-radius-buttons);
    }
    .join > :global(:only-child .btn-radio) {
        --join-ss: var(--tri-radius-buttons);
        --join-se: var(--tri-radius-buttons);
        --join-es: var(--tri-radius-buttons);
        --join-ee: var(--tri-radius-buttons);
    }

    /* ===== Language Select width override (w-auto) ===== */
    .top-row :global(.lang-select) {
        width: auto;
    }

    /* ===== Dropdown scaffolding ===== */
    .dropdown {
        position: relative;
        display: inline-block;
    }
    .dropdown-content {
        position: absolute;
        z-index: 999;
    }
    /* End-aligned dropdowns open to the inline-end edge. */
    .dropdown-end .dropdown-content {
        inset-inline-end: 0;
    }

    /* Settings dropdown is a <div> trigger revealed via :focus-within. The
       manifest dropdown is a native <details> and is intentionally NOT covered
       here — it opens/closes through the browser's <details>[open] mechanism. */
    .settings-dropdown {
        display: none;
    }
    @media (width < 1024px) {
        .settings-dropdown {
            display: inline-block;
        }
    }
    .settings-dropdown .dropdown-content {
        opacity: 0;
        scale: 95%;
        display: block;
        visibility: hidden;
        pointer-events: none;
        transform-origin: top;
    }
    @media (prefers-reduced-motion: no-preference) {
        .settings-dropdown .dropdown-content {
            transition-property: opacity, scale;
            transition-duration: 0.2s;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
    }
    .settings-dropdown:focus-within .dropdown-content {
        opacity: 1;
        scale: 100%;
        visibility: visible;
        pointer-events: auto;
    }

    .settings-panel {
        z-index: 20;
        width: min(20rem, calc(100vw - 1rem));
        max-height: calc(100dvh - 4rem);
        overflow: hidden;
        background-color: var(--tri-viewer-bg);
        border-radius: var(--tri-radius-box);
        border-width: 1px;
        border-style: solid;
        border-color: var(--tri-surface-border);
        box-shadow:
            0 1px 3px 0 #0000001a,
            0 1px 2px -1px #0000001a;
    }

    /* SettingsMenu receives class="menu settings-menu". These rules give that
       panel its padding, max-height, vertical scroll, and no-wrap layout. */
    .settings-panel :global(.settings-menu) {
        padding: 0.5rem;
        max-height: 80vh;
        overflow-y: auto;
        flex-wrap: nowrap;
    }

    /* ===== Field width overrides for primitives ===== */
    .control-group :global(.manifest-input) {
        width: 300px;
    }
    .control-group :global(.canvas-select) {
        width: 200px;
    }
    .control-group :global(.manifest-select) {
        width: 28rem;
        max-width: 60vw;
    }

    @media (width < 768px) {
        .top-row {
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
        }

        .bottom-row {
            flex-wrap: wrap;
            align-items: stretch;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
        }

        .spacer,
        .divider {
            display: none;
        }

        .brand {
            justify-content: flex-start;
            margin-inline-end: auto;
            padding-inline: 0.5rem;
            font-size: 1rem;
        }

        .btn-link.outline.primary,
        .icon-link,
        .btn-trigger {
            padding-inline: 0.625rem;
        }

        .viewer-mode {
            order: 10;
            flex: 1 0 100%;
            overflow: hidden;
        }

        .viewer-mode > :global(*) {
            flex: 1 1 0;
            min-width: 0;
        }

        .viewer-mode :global(.btn-radio) {
            width: 100%;
            min-width: 0;
            padding-inline: 0.5rem;
        }

        .top-row :global(.lang-select) {
            flex: 0 1 7.5rem;
            width: 7.5rem;
        }

        .controls-heading {
            flex: 1 0 100%;
        }

        .manifest-group,
        .canvas-group {
            flex: 1 1 100%;
            align-items: stretch;
        }

        .manifest-group {
            flex-direction: column;
        }

        .manifest-controls {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            width: 100%;
            align-items: stretch;
        }

        .manifest-controls :global(.manifest-select) {
            grid-column: 1 / -1;
            width: 100%;
            max-width: none;
        }

        .manifest-controls :global(.manifest-input) {
            width: 100%;
            min-width: 0;
        }

        .manifest-controls :global(.load-button) {
            min-width: 4.5rem;
        }

        .canvas-group {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: center;
        }

        .canvas-label {
            white-space: nowrap;
        }

        .canvas-group :global(.canvas-select) {
            width: 100%;
            min-width: 0;
        }
    }

    @media (width < 480px) {
        .top-row,
        .bottom-row {
            padding-inline: 0.5rem;
        }

        .btn-link,
        .btn-trigger,
        .btn-radio {
            height: 2rem;
        }

        .brand {
            font-size: 0.95rem;
        }

        .viewer-mode :global(.btn-radio) {
            padding-inline: 0.375rem;
            font-size: 0.6875rem;
        }

        .manifest-controls {
            grid-template-columns: minmax(0, 1fr);
        }

        .manifest-controls :global(.load-button) {
            width: 100%;
        }

        .canvas-group {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.25rem;
        }
    }

    @media (width < 380px) {
        .icon-link {
            display: none;
        }

        .top-row :global(.lang-select) {
            width: 6.5rem;
        }
    }
</style>
