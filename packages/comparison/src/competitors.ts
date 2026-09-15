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
 * in. A viewer that code-splits per media type pays different bytes for an
 * audiovisual manifest than for an image one, which only a session can show.
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
     * This viewer's column heading in the Cookbook
     * [support matrix](https://iiif.io/api/cookbook/recipe/matrix/), spelled
     * exactly as the matrix spells it, which is how a row here is joined to its
     * per-recipe cells in `COOKBOOK_MATRIX`.
     *
     * A name and not a count: the counts live in the matrix data, so a viewer's
     * coverage cannot drift from the cells it is drawn from.
     *
     * Absent for a viewer the matrix has no column for, which gets no coverage
     * row rather than a row of empty cells.
     *
     * The Triiiceratops entries carry none. The matrix does have a column for
     * us, but a Triiiceratops support claim is recorded in
     * `@triiiceratops/cookbook` and nowhere else; the site reads the matrix's
     * own column directly to state how far behind it currently runs.
     */
    matrixColumn?: string;
    /** Why these artifacts are the ones a page loads. Carries no figures. */
    note?: string;
}

// A Triiiceratops row is built from this repository's own sources, so these are
// the workspace's own versions rather than a registry release. `measured.test.ts`
// holds them to the package manifests; they are not read from those manifests
// here because this module is bundled into the site, and a JSON import would
// carry a whole package.json into the browser to quote one field of it.
const TRIIICERATOPS_VERSION = '1.0.3';
const PLUGIN_AV_VERSION = '1.0.4';

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
            'plugin-av/av-timeline.js',
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
        matrixColumn: 'TIFY',
        note: 'The CDN embed its README documents: one script and one stylesheet.',
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
        note: 'The web-component bundle and its stylesheet. It renders a canvas rather than presenting a manifest — no navigation, no metadata, no ranges — so it is weighed here and left out of the coverage figure, where the matrix has no column for it either.',
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
        matrixColumn: 'UV',
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
        matrixColumn: 'Clover',
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
        matrixColumn: 'Mirador',
        note: 'The self-contained UMD build its README documents. Its ESM build looks smaller only because it externalizes React and MUI.',
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
        matrixColumn: 'Glycerine Viewer',
        note: 'The `jslib/` widget its README documents for a script tag, packed with Vue and PrimeVue. Its `dist/` build externalizes them and is not what a page loads.',
    },
];
