/**
 * The kinds of material the viewer copes with, each declared once with the
 * manifest that proves it.
 *
 * `/handles/` answers a curator's question — will this cope with my collection
 * — so a class is named for the kind of thing it is, in the words a curator
 * would use of their own holdings, never in the specification's words. The
 * property of the manifest that makes each class interesting is deliberately
 * unnamed: a reader who wanted the specification would be reading the
 * documentation.
 *
 * This is not the recipe matrix and must never become one. Compliance is
 * claimed in exactly one place, `@triiiceratops/cookbook`, and nothing here
 * carries a recipe number, a support status or a comparison.
 *
 * Every manifest is somebody else's, served from their own IIIF endpoint, which
 * is the point: material this site had prepared for itself would prove nothing
 * about a collection it has never seen. The cost of that is a page whose proof
 * depends on servers this project does not run, which is why each embed is
 * deferred until it is scrolled to and each box holds its space whether the
 * material arrives or not.
 *
 * `firstCanvas` is the first canvas's own declared dimensions, read from the
 * manifest and recorded here so the reserved box has an aspect ratio before
 * anything has been fetched.
 */

import type { Example } from './examples';
import type { ViewerConfig } from './viewerConfig';

export type MaterialClass = {
    /** The kind of material, as a curator would name it. */
    readonly name: string;
    /** What a reader is looking at the viewer do with it, in one clause. */
    readonly what: string;
    /** The material itself, as its publisher labels it. */
    readonly material: string;
    /** Who publishes it, and where the manifest a reader can open lives. */
    readonly source: { readonly who: string; readonly href: string };
    readonly example: Example;
    /**
     * The arrangement this class is shown in. Each opens the one part of the
     * chrome its own class is about and leaves the rest at the viewer's
     * defaults, so what a reader notices is the material rather than the
     * configuration.
     */
    readonly config: ViewerConfig;
};

/**
 * Panel widths for an embed rather than for an application.
 *
 * The viewer's 320px default is right for a full window and takes most of a box
 * this size, leaving the material a strip. These are as narrow as the panels'
 * own content reads at.
 */
const PANEL_WIDTH = '240px';

export const MATERIAL_CLASSES: readonly MaterialClass[] = [
    {
        name: 'A bound volume, with the order it was catalogued in',
        what: 'Its contents list opens beside it, and each entry goes to the leaf it names.',
        material: 'Ethiopic Ms 10',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
            canvases: 6,
            label: 'A bound volume with its contents list',
            firstCanvas: { width: 1768, height: 2504 },
        },
        config: {
            structures: { open: true },
            leftPanelWidth: PANEL_WIDTH,
            rightPanelWidth: PANEL_WIDTH,
        },
    },
    {
        name: 'One image, far larger than any screen',
        what: 'Thirty-nine megapixels on a single canvas, assembled from two photographs, zoomed into rather than downloaded.',
        material: 'Folio from Grandes Chroniques de France, ca. 1460',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
            canvases: 1,
            label: 'A single sheet larger than any screen',
            firstCanvas: { width: 7216, height: 5412 },
        },
        config: { toolbar: { side: 'left', anchor: 'top' } },
    },
    {
        name: 'One object, photographed many times over',
        what: 'Fourteen exposures of the same papyrus — both sides, under several lights — as one strip to move between.',
        material: 'GA P40',
        source: {
            who: 'The Center for the Study of New Testament Manuscripts',
            href: 'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
        },
        example: {
            manifest:
                'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
            canvases: 14,
            label: 'One object photographed many times over',
            firstCanvas: { width: 6132, height: 8176 },
        },
        config: { gallery: { open: true, dockPosition: 'bottom', size: 84 } },
    },
    {
        name: 'Material somebody has written notes on',
        what: 'A note in two languages hangs on one part of the painted screen, and opening it takes the reader to that part.',
        material: 'Koto, chess, calligraphy, and painting',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/manifest.json',
            canvases: 1,
            label: 'Material somebody has written notes on',
            firstCanvas: { width: 8800, height: 3966 },
        },
        config: {
            annotations: { open: true },
            leftPanelWidth: PANEL_WIDTH,
            rightPanelWidth: PANEL_WIDTH,
        },
    },
    {
        name: 'Material that is read from right to left',
        what: 'Openings fall the way the book falls, and the next page is to the left, because the publisher said so and nobody here configured it.',
        material: 'A playbill for the Chikugo Theater, Osaka, 1849',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
            canvases: 5,
            label: 'Material that is read from right to left',
            firstCanvas: { width: 3497, height: 4823 },
            // The box is an opening rather than a leaf: this is the one class
            // shown paged, and two leaves side by side is what the reader sees.
            reserve: { width: 3497 * 2, height: 4823 },
        },
        config: { viewingMode: 'paged' },
    },
];
