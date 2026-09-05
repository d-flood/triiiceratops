/**
 * Share URLs captured from the implementation that first shipped them, pinned
 * byte for byte.
 *
 * Every other test here asserts the codec against itself: build a URL, read it
 * back, agree. That cannot catch a change to the format, because both halves
 * move together. These fixtures are literal output, so a change to the emitted
 * string — a parameter renamed, an encoding widened, a key reordered — fails
 * here even though the codec still round-trips perfectly.
 *
 * A fixture is a shared link someone already sent. Editing one to make this file
 * pass breaks that link; the format is the contract, not these strings.
 */

import { describe, expect, it } from 'vitest';
import { parseContentState } from 'triiiceratops';

import {
    buildShareUrl,
    resolveInitialConfig,
    resolveInitialView,
    serializeContentState,
    type SparseConfig,
    type ViewTarget,
} from './index';

const MANIFEST =
    'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json';
const CANVAS = 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/canvas/p1';

/** A subset of the playground's defaults, enough to merge an overlay onto. */
const defaults = {
    toolbarOpen: true,
    gallery: { open: false, dockPosition: 'bottom' },
};

type Fixture = {
    name: string;
    /** The inputs the builder held when this URL was produced. */
    input: {
        pathname: string;
        mode: string;
        target: ViewTarget;
        config: SparseConfig;
    };
    /** The URL it produced, verbatim. */
    url: string;
    /** What a load of that URL must resolve to. */
    view: { manifestUrl: string; canvasId: string; region: object | null };
    config: SparseConfig;
};

const FIXTURES: Fixture[] = [
    {
        name: 'a manifest with no configuration, shared as a bare URI',
        input: {
            pathname: '/demo/',
            mode: 'image',
            target: { manifestId: MANIFEST },
            config: {},
        },
        url: '/demo/?mode=image&iiif-content=https%3A%2F%2Fiiif.io%2Fapi%2Fcookbook%2Frecipe%2F0001-mvm-image%2Fmanifest.json',
        view: { manifestUrl: MANIFEST, canvasId: '', region: null },
        config: {},
    },
    {
        name: 'a canvas, a region and a sparse configuration',
        input: {
            pathname: '/demo/',
            mode: 'svelte',
            target: {
                manifestId: MANIFEST,
                canvasId: CANVAS,
                region: { x: 10, y: 20, width: 300, height: 400 },
            },
            config: {
                gallery: { open: true, dockPosition: 'left' },
                toolbarOpen: false,
            },
        },
        url: '/demo/?mode=svelte&iiif-content=eyJAY29udGV4dCI6Imh0dHA6Ly9paWlmLmlvL2FwaS9wcmVzZW50YXRpb24vMy9jb250ZXh0Lmpzb24iLCJ0eXBlIjoiQW5ub3RhdGlvbiIsIm1vdGl2YXRpb24iOiJjb250ZW50U3RhdGUiLCJ0YXJnZXQiOnsiaWQiOiJodHRwczovL2lpaWYuaW8vYXBpL2Nvb2tib29rL3JlY2lwZS8wMDAxLW12bS1pbWFnZS9jYW52YXMvcDEjeHl3aD0xMCwyMCwzMDAsNDAwIiwidHlwZSI6IkNhbnZhcyIsInBhcnRPZiI6W3siaWQiOiJodHRwczovL2lpaWYuaW8vYXBpL2Nvb2tib29rL3JlY2lwZS8wMDAxLW12bS1pbWFnZS9tYW5pZmVzdC5qc29uIiwidHlwZSI6Ik1hbmlmZXN0In1dfX0&config=%7B%22gallery%22%3A%7B%22open%22%3Atrue%2C%22dockPosition%22%3A%22left%22%7D%2C%22toolbarOpen%22%3Afalse%7D',
        view: {
            manifestUrl: MANIFEST,
            canvasId: CANVAS,
            region: { x: 10, y: 20, width: 300, height: 400 },
        },
        config: {
            gallery: { open: true, dockPosition: 'left' },
            toolbarOpen: false,
        },
    },
];

describe.each(FIXTURES)('$name', (fixture) => {
    it('is still what the codec emits', () => {
        expect(buildShareUrl(fixture.input)).toBe(fixture.url);
    });

    it('still rehydrates the view it was sent with', () => {
        const search = fixture.url.split('?')[1];

        expect(resolveInitialView(search)).toEqual(fixture.view);
    });

    it('still rehydrates the configuration it was sent with', () => {
        const search = fixture.url.split('?')[1];

        expect(resolveInitialConfig({ search, defaults }).sparse).toEqual(
            fixture.config,
        );
    });
});

/**
 * The playground's own sample manifests are shipped at root-relative paths, so
 * the id a content state carries is absolutized against the page it was shared
 * from. Pinned separately because the base is an argument here rather than the
 * ambient location.
 */
describe('a relative sample manifest, absolutized against the sharing page', () => {
    const target: ViewTarget = {
        manifestId: '/manifests/sample.json',
        canvasId: '/manifests/sample.json/canvas/p1#xywh=1,2,3,4',
    };
    const base = 'https://triiiceratops.dev/demo/?mode=image';
    const contentState =
        'eyJAY29udGV4dCI6Imh0dHA6Ly9paWlmLmlvL2FwaS9wcmVzZW50YXRpb24vMy9jb250ZXh0Lmpzb24iLCJ0eXBlIjoiQW5ub3RhdGlvbiIsIm1vdGl2YXRpb24iOiJjb250ZW50U3RhdGUiLCJ0YXJnZXQiOnsiaWQiOiJodHRwczovL3RyaWlpY2VyYXRvcHMuZGV2L21hbmlmZXN0cy9zYW1wbGUuanNvbi9jYW52YXMvcDEiLCJ0eXBlIjoiQ2FudmFzIiwicGFydE9mIjpbeyJpZCI6Imh0dHBzOi8vdHJpaWljZXJhdG9wcy5kZXYvbWFuaWZlc3RzL3NhbXBsZS5qc29uIiwidHlwZSI6Ik1hbmlmZXN0In1dfX0';

    it('is still what the codec emits', () => {
        expect(serializeContentState(target, base)).toBe(contentState);
    });

    it('still names absolute resources when read back', () => {
        expect(parseContentState(contentState)).toEqual({
            manifestId: 'https://triiiceratops.dev/manifests/sample.json',
            canvasId:
                'https://triiiceratops.dev/manifests/sample.json/canvas/p1',
        });
    });
});
