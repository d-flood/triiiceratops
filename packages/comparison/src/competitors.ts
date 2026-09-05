/**
 * The pinned viewer list the bundle-size comparison measures: every viewer, the
 * version measured, and the page that loads it. `scripts/measure.mjs` drives one
 * browser session per entry per session kind and writes `measured.json`; nothing
 * here records a byte count.
 *
 * A version is pinned so a re-measurement is a re-measurement rather than a
 * different comparison. Bumping one is a deliberate edit whose diff shows both
 * the version and the figures that moved.
 */

/**
 * The two session kinds every viewer that can play time-based media is measured
 * in. Two of these viewers code-split per media type, so an audiovisual manifest
 * costs them different bytes than an image one.
 */
export type SessionKind = 'image' | 'audiovisual';

/** The IIIF Cookbook manifest each session kind is driven against. */
export const SESSION_MANIFESTS: Record<SessionKind, string> = {
    image: 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json',
    audiovisual:
        'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
};

export interface Competitor {
    /** Stable key, used by `measured.json` and by anything rendering the data. */
    id: string;
    /** The viewer's own name, as its project spells it. */
    name: string;
    /** The exact release measured. */
    version: string;
    /**
     * True for a Triiiceratops row. Its artifacts are served from this
     * repository's own `dist` directories instead of a registry CDN — everything
     * else about the measurement, including that it is a real browser session,
     * is identical, so no row is produced differently from its neighbours.
     */
    local?: boolean;
    /**
     * The session kinds this viewer has. A viewer with no audiovisual support
     * gets no audiovisual row rather than a row equal to its image one.
     */
    sessions: SessionKind[];
    /**
     * The viewer's own documented embed, as a whole HTML document.
     * `{{MANIFEST}}` is the session's manifest URL; `{{BASE}}` is the local
     * artifact root, and is only used by `local` entries.
     */
    embed: string;
    /**
     * URL prefixes whose responses count toward this viewer's session. Anything
     * outside them — the manifest, its images, its media, a favicon — is the
     * IIIF content the viewer then fetches, not the viewer.
     */
    assetBases: string[];
    /**
     * Artifacts that exist beside the entry files but that no session fetches.
     * Measured so the published breakdown of what lazy loading defers can be
     * rendered from data rather than transcribed.
     */
    lazyArtifacts?: string[];
    /**
     * The viewer's row in the Cookbook
     * [support matrix](https://iiif.io/api/cookbook/recipe/matrix/), read on
     * `MEASURED_COMPARISON.measuredAt`: how many of the 67 distinct recipes the
     * matrix records the project as fully supporting, and how many it marks
     * partial. A pinned external claim, in the same sense as `version` — it is
     * what the matrix said on the day, not something this repository measures.
     *
     * Absent for a viewer with no matrix column, which gets no point on the
     * capability chart rather than a point at nought.
     *
     * The Triiiceratops entries carry none: their capability figure comes from
     * `@triiiceratops/cookbook`, the one place a Triiiceratops support claim is
     * recorded, so that the site's own point cannot drift from the catalog.
     */
    matrixRecipes?: { supported: number; partial: number };
    /** Why these artifacts are the ones a page loads. Carries no figures. */
    note?: string;
}

const TRIIICERATOPS_VERSION = '1.0.0-rc.36';
const PLUGIN_AV_VERSION = '1.0.0-rc.0';

const viewerElement =
    '<triiiceratops-viewer manifest-id="{{MANIFEST}}" style="display: block; width: 100%; height: 100vh;"></triiiceratops-viewer>';

/** The viewers the comparison measures, smallest first is not assumed anywhere. */
export const COMPETITORS: Competitor[] = [
    {
        id: 'triiiceratops',
        name: 'Triiiceratops',
        version: TRIIICERATOPS_VERSION,
        local: true,
        sessions: ['image'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Triiiceratops</title>
<script src="{{BASE}}core/triiiceratops-element.iife.js"></script>
${viewerElement}`,
        assetBases: ['{{BASE}}core/'],
        note: 'The whole viewer in one file, with its CSS injected into the shadow root — the official plain-HTML embed.',
    },
    {
        id: 'triiiceratops-av',
        name: 'Triiiceratops + plugin-av',
        version: `${TRIIICERATOPS_VERSION} + ${PLUGIN_AV_VERSION}`,
        local: true,
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Triiiceratops + plugin-av</title>
<script src="{{BASE}}core/triiiceratops-element.iife.js"></script>
<script src="{{BASE}}plugin-av/iife.js"></script>
${viewerElement}
<script>
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        const viewer = document.querySelector('triiiceratops-viewer');
        viewer.plugins = [
            window.Triiiceratops.plugins.get('@triiiceratops/plugin-av'),
        ];
    });
</script>`,
        assetBases: ['{{BASE}}core/', '{{BASE}}plugin-av/'],
        lazyArtifacts: [
            'plugin-av/av-hls.js',
            'plugin-av/av-transcript.js',
            'plugin-av/av-waveform.js',
            'plugin-av/av-sequencer.js',
        ],
        note: 'The same element file plus the audiovisual plugin. This is the like-for-like row against the viewers below that play time-based media.',
    },
    {
        id: 'tify',
        name: 'TIFY',
        version: '0.35.0',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>TIFY</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.css">
<style>html, body { margin: 0 } #tify { height: 100vh }</style>
<div id="tify"></div>
<script type="module">
    import Tify from 'https://cdn.jsdelivr.net/npm/tify@0.35.0/dist/tify.js';
    new Tify({ container: '#tify', manifestUrl: '{{MANIFEST}}' });
</script>`,
        assetBases: ['https://cdn.jsdelivr.net/npm/tify@0.35.0/'],
        matrixRecipes: { supported: 31, partial: 3 },
        note: 'The CDN embed its README documents: one script and one stylesheet.',
    },
    {
        id: 'diva',
        name: 'Diva.js',
        version: '7.4.0',
        sessions: ['image'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Diva.js</title>
<style>html, body { margin: 0 } #diva-wrapper { display: flex; width: 100%; height: 100vh }</style>
<script src="https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/build/openseadragon/openseadragon.min.js"></script>
<script src="https://unpkg.com/diva.js@7.4.0/build/diva.js"></script>
<div id="diva-wrapper"></div>
<script>
    new Diva('diva-wrapper', { objectData: '{{MANIFEST}}' });
</script>`,
        assetBases: [
            'https://unpkg.com/diva.js@7.4.0/',
            'https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/',
        ],
        note: 'Diva.js plus the OpenSeadragon its README tells a page to load first. All its CSS and image assets are bundled into the library.',
    },
    {
        id: 'canvas-panel',
        name: 'Canvas Panel',
        version: '1.0.74',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Canvas Panel</title>
<link rel="stylesheet" href="https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.css">
<style>html, body { margin: 0 } canvas-panel { display: block; height: 100vh }</style>
<script src="https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/dist/bundle.js"></script>
<canvas-panel manifest-id="{{MANIFEST}}"></canvas-panel>`,
        assetBases: [
            'https://unpkg.com/@digirati/canvas-panel-web-components@1.0.74/',
        ],
        note: 'The web-component bundle and its stylesheet.',
    },
    {
        id: 'mango',
        name: 'Mango',
        version: '0.4.2',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Mango</title>
<style>html, body { margin: 0 } mango-viewer { display: block; width: 100%; height: 100vh }</style>
<mango-viewer mode="viewer" manifest-id="{{MANIFEST}}"></mango-viewer>
<script type="module" src="https://cdn.jsdelivr.net/npm/@mango-iiif/iiif-viewer@0.4.2/src/dist/mango-viewer-element.js"></script>`,
        assetBases: [
            'https://cdn.jsdelivr.net/npm/@mango-iiif/iiif-viewer@0.4.2/',
        ],
        note: "The element module its README's standalone embed resolves to, plus every chunk the session fetched. It injects its styles from JavaScript, so there is no stylesheet. The version-pinned bare package URL is served as a file rather than redirected, which leaves the module's own relative chunk imports unresolvable, so the embed names the resolved path.",
    },
    {
        id: 'universal-viewer',
        name: 'Universal Viewer',
        version: '4.4.2',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Universal Viewer</title>
<link rel="stylesheet" href="https://unpkg.com/universalviewer@4.4.2/dist/uv.css">
<style>html, body { margin: 0 } #uv { width: 100vw; height: 100vh }</style>
<div class="uv" id="uv"></div>
<script src="https://unpkg.com/universalviewer@4.4.2/dist/umd/UV.js"></script>
<script>
    UV.init('uv', { iiifManifestId: '{{MANIFEST}}' });
</script>`,
        assetBases: ['https://unpkg.com/universalviewer@4.4.2/'],
        matrixRecipes: { supported: 21, partial: 1 },
        note: 'The UMD build and its stylesheet, plus every chunk the session fetched.',
    },
    {
        id: 'clover',
        name: 'Clover IIIF',
        version: '3.12.0',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Clover IIIF</title>
<style>html, body { margin: 0 } clover-viewer { display: block; height: 100vh }</style>
<clover-viewer iiif-content="{{MANIFEST}}"></clover-viewer>
<script src="https://unpkg.com/@samvera/clover-iiif@3.12.0/dist/web-components/index.umd.js"></script>`,
        assetBases: ['https://unpkg.com/@samvera/clover-iiif@3.12.0/'],
        matrixRecipes: { supported: 18, partial: 1 },
        note: 'The web-components UMD build. Its documented script tag loads no stylesheet.',
    },
    {
        id: 'mirador',
        name: 'Mirador',
        version: '4.1.0',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Mirador</title>
<style>html, body { margin: 0 } #mirador { height: 100vh }</style>
<script src="https://unpkg.com/mirador@4.1.0/dist/mirador.min.js"></script>
<div id="mirador"></div>
<script>
    Mirador.viewer({ id: 'mirador', windows: [{ manifestId: '{{MANIFEST}}' }] });
</script>`,
        assetBases: ['https://unpkg.com/mirador@4.1.0/'],
        matrixRecipes: { supported: 31, partial: 3 },
        note: 'The self-contained UMD build its README documents. Its ESM build looks smaller only because it externalises React and MUI.',
    },
    {
        id: 'glycerine',
        name: 'Glycerine Viewer',
        version: '2.1.0',
        sessions: ['image', 'audiovisual'],
        embed: `<!doctype html>
<meta charset="utf-8">
<title>Glycerine Viewer</title>
<link rel="stylesheet" href="https://unpkg.com/glycerine-viewer@2.1.0/jslib/style.css">
<style>html, body { margin: 0 }</style>
<div id="viewer"></div>
<script src="https://unpkg.com/glycerine-viewer@2.1.0/jslib/glycerine-viewer.umd.cjs"></script>
<script>
    new GlycerineViewer(document.getElementById('viewer'), {
        width: '100%',
        height: '100vh',
        manifest: '{{MANIFEST}}',
    }).init();
</script>`,
        assetBases: ['https://unpkg.com/glycerine-viewer@2.1.0/'],
        matrixRecipes: { supported: 31, partial: 0 },
        note: 'The `jslib/` widget its README documents for a script tag, packed with Vue and PrimeVue. Its `dist/` build externalises them and is not what a page loads.',
    },
];
