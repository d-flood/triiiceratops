/**
 * Share URLs pinned byte for byte, in both directions.
 *
 * Every other test here asserts the codec against itself: build a URL, read it
 * back, agree. That cannot catch a change to the format, because both halves
 * move together. Literal strings can, which is what these are.
 *
 * The two directions are separate lists because they promise opposite things,
 * and one change can be right for one and wrong for the other.
 *
 * `RECEIVED` holds links already sent, verbatim. What they promise is that
 * loading one still resolves to the view and the configuration it carried, so
 * they are only ever read here, never rebuilt. Editing one of these strings
 * breaks the link it stands for — which is why the `mode` parameter they carry
 * survives in them after the builder stopped emitting it: the playground that
 * switched its view on `mode` is retired, nothing ever read the parameter back,
 * and a link that has one still has to open.
 *
 * `EMITTED` holds what the codec produces now. This is the format-drift guard —
 * a parameter renamed, an encoding widened, a key reordered — and it is the one
 * to re-derive, deliberately, when the emitted format is meant to change.
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

/** A subset of the builder's defaults, enough to merge an overlay onto. */
const defaults = {
    toolbarOpen: true,
    gallery: { open: false, dockPosition: 'bottom' },
};

type ReceivedFixture = {
    name: string;
    /** The link, exactly as it was sent. */
    url: string;
    /** What a load of it must resolve to. */
    view: { manifestUrl: string; canvasId: string; region: object | null };
    config: SparseConfig;
};

const RECEIVED: ReceivedFixture[] = [
    {
        name: 'a manifest with no configuration, shared as a bare URI',
        url: '/demo/?mode=image&iiif-content=https%3A%2F%2Fiiif.io%2Fapi%2Fcookbook%2Frecipe%2F0001-mvm-image%2Fmanifest.json',
        view: { manifestUrl: MANIFEST, canvasId: '', region: null },
        config: {},
    },
    {
        name: 'a canvas, a region and a sparse configuration',
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

describe.each(RECEIVED)('a link already sent: $name', (fixture) => {
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

    /*
     * The retired parameter is carried through untouched rather than stripped or
     * rejected: the resolvers name the parameters they read, so an unknown one
     * is simply not one of them. This is what makes dropping a parameter from
     * the emitter safe for links already in circulation.
     */
    it('is unharmed by the retired parameter it carries', () => {
        expect(new URLSearchParams(fixture.url.split('?')[1]).has('mode')).toBe(
            true,
        );
    });
});

type EmittedFixture = {
    name: string;
    input: {
        pathname: string;
        target: ViewTarget;
        config: SparseConfig;
    };
    /** The URL the codec produces, verbatim. */
    url: string;
};

const EMITTED: EmittedFixture[] = [
    {
        name: 'a manifest with no configuration, as a bare URI',
        input: {
            pathname: '/configure/',
            target: { manifestId: MANIFEST },
            config: {},
        },
        url: '/configure/?iiif-content=https%3A%2F%2Fiiif.io%2Fapi%2Fcookbook%2Frecipe%2F0001-mvm-image%2Fmanifest.json',
    },
    {
        name: 'a canvas, a region and a sparse configuration',
        input: {
            pathname: '/configure/',
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
        url: '/configure/?iiif-content=eyJAY29udGV4dCI6Imh0dHA6Ly9paWlmLmlvL2FwaS9wcmVzZW50YXRpb24vMy9jb250ZXh0Lmpzb24iLCJ0eXBlIjoiQW5ub3RhdGlvbiIsIm1vdGl2YXRpb24iOiJjb250ZW50U3RhdGUiLCJ0YXJnZXQiOnsiaWQiOiJodHRwczovL2lpaWYuaW8vYXBpL2Nvb2tib29rL3JlY2lwZS8wMDAxLW12bS1pbWFnZS9jYW52YXMvcDEjeHl3aD0xMCwyMCwzMDAsNDAwIiwidHlwZSI6IkNhbnZhcyIsInBhcnRPZiI6W3siaWQiOiJodHRwczovL2lpaWYuaW8vYXBpL2Nvb2tib29rL3JlY2lwZS8wMDAxLW12bS1pbWFnZS9tYW5pZmVzdC5qc29uIiwidHlwZSI6Ik1hbmlmZXN0In1dfX0&config=%7B%22gallery%22%3A%7B%22open%22%3Atrue%2C%22dockPosition%22%3A%22left%22%7D%2C%22toolbarOpen%22%3Afalse%7D',
    },
];

describe.each(EMITTED)('what the codec emits: $name', (fixture) => {
    it('is still this string, byte for byte', () => {
        expect(buildShareUrl(fixture.input)).toBe(fixture.url);
    });

    it('names no parameter nothing reads', () => {
        const params = new URLSearchParams(fixture.url.split('?')[1]);
        expect([...params.keys()].toSorted()).toEqual(
            fixture.input.config && Object.keys(fixture.input.config).length
                ? ['config', 'iiif-content']
                : ['iiif-content'],
        );
    });
});

/**
 * The site's own sample manifests are served at root-relative paths, so the id a
 * content state carries is absolutized against the page it was shared from.
 * Pinned separately because the base is an argument here rather than the ambient
 * location.
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
