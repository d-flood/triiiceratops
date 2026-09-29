import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';

import {
    createTestViewerContext,
    flush,
} from '@triiiceratops/plugin-sdk/testing';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
import Panel from './Panel.svelte';

const MANIFEST = 'https://example.org/manifest';
const CANVAS = `${MANIFEST}/canvas/one`;

function image(id: string) {
    return {
        id: `${MANIFEST}/anno/${id}`,
        type: 'Annotation',
        motivation: 'painting',
        target: CANVAS,
        body: {
            id: `https://example.org/iiif/${id}/full/full/0/default.jpg`,
            type: 'Image',
            format: 'image/jpeg',
            width: 1000,
            height: 1200,
        },
    };
}

const manifest = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: MANIFEST,
    type: 'Manifest',
    label: { en: ['Two images'] },
    items: [
        {
            id: CANVAS,
            type: 'Canvas',
            label: { en: ['one'] },
            width: 1000,
            height: 1200,
            items: [
                {
                    id: `${MANIFEST}/page/one`,
                    type: 'AnnotationPage',
                    items: [image('a'), image('b')],
                },
            ],
        },
    ],
};

describe('image export panel', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
    });

    it('renders the attributes it passes to the Select and Button primitives', async () => {
        const tc = createTestViewerContext({
            catalog,
            fixtures: { manifest: { id: MANIFEST, json: manifest } },
        });
        await flush();

        const app = mount(Panel, {
            target,
            context: new Map<symbol, PanelContext>([
                [PLUGIN_CONTEXT_KEY, { context: tc.context }],
            ]),
        });
        await flush();

        const mode = target.querySelector('[data-tri-id-mode]');
        const resolution = target.querySelector('[data-tri-id-resolution]');
        expect(mode?.tagName).toBe('SELECT');
        expect(mode?.id).toBe('tri-id-mode');
        expect(mode?.getAttribute('aria-label')).toBe(
            catalog.en!.image_download_mode,
        );
        expect(resolution?.tagName).toBe('SELECT');
        expect(resolution?.id).toBe('tri-id-resolution');
        expect(target.querySelector('[data-tri-id-download]')?.tagName).toBe(
            'BUTTON',
        );

        await unmount(app);
    });
});
