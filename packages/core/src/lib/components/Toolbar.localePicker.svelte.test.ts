import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ToolbarTestHost from './ToolbarTestHost.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import type { ViewerConfig } from '../types/config';

/**
 * The toolbar's language picker: a manifest-driven flyout, like the sequence
 * picker. It appears only when there is a choice to make, names each language
 * in that language, and drives the viewer's active locale.
 */

let manifestCounter = 0;
let mounted: ReturnType<typeof mount> | null = null;
const loadedManifests: string[] = [];

function makeCanvas(manifestId: string) {
    const id = `${manifestId}/canvas/1`;
    return {
        id,
        type: 'Canvas',
        height: 1000,
        width: 800,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/anno`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: id,
                        body: {
                            id: `${id}/image.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            height: 1000,
                            width: 800,
                        },
                    },
                ],
            },
        ],
    };
}

/** A v3 manifest labelled in `label`'s languages. */
function makeManifest(label: Record<string, string[]>) {
    const manifestId = `http://example.org/manifest/locale-${++manifestCounter}`;
    return {
        manifestId,
        json: {
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            id: manifestId,
            type: 'Manifest',
            label,
            items: [makeCanvas(manifestId)],
        },
    };
}

async function mountToolbar(
    label: Record<string, string[]>,
    config: ViewerConfig = {},
) {
    const { manifestId, json } = makeManifest(label);
    const viewerState = new ViewerState();
    await viewerState.setManifestData(manifestId, json);
    loadedManifests.push(manifestId);
    viewerState.config = config;
    viewerState.toolbarOpen = true;

    mounted = mount(ToolbarTestHost, {
        target: document.body,
        props: { viewerState },
    });
    flushSync();

    return viewerState;
}

/** The picker's toggle button, or null when the toolbar renders none. */
function localeButton(): HTMLButtonElement | null {
    return document.body.querySelector<HTMLButtonElement>(
        '[aria-controls="tri-flyout-locale"]',
    );
}

function localeItems(): HTMLButtonElement[] {
    return [
        ...document.body.querySelectorAll<HTMLButtonElement>(
            '#tri-flyout-locale [role="menuitemradio"]',
        ),
    ];
}

afterEach(async () => {
    if (mounted) {
        await unmount(mounted);
        mounted = null;
    }
    document.body.innerHTML = '';
    for (const manifestId of loadedManifests.splice(0)) {
        manifestsState.clearManifest(manifestId);
    }
    vi.restoreAllMocks();
});

describe('Toolbar language picker', () => {
    it('is absent when the manifest is authored in one language', async () => {
        await mountToolbar({ en: ['Book'] });
        expect(localeButton()).toBeNull();
    });

    it('is absent when the manifest carries no language-tagged values', async () => {
        await mountToolbar({ none: ['MS 42'] });
        expect(localeButton()).toBeNull();
    });

    it('appears when the manifest offers more than one language', async () => {
        await mountToolbar({ en: ['Book'], fr: ['Livre'] });
        expect(localeButton()).not.toBeNull();
        expect(localeButton()?.getAttribute('aria-haspopup')).toBe('menu');
        expect(localeButton()?.getAttribute('aria-expanded')).toBe('false');
    });

    it('is suppressed by toolbar.showLocalePicker: false', async () => {
        await mountToolbar(
            { en: ['Book'], fr: ['Livre'] },
            { toolbar: { showLocalePicker: false } },
        );
        expect(localeButton()).toBeNull();
    });

    it('names each language in that language, tagged with its own lang', async () => {
        await mountToolbar({ en: ['Book'], fr: ['Livre'] });
        localeButton()!.click();
        flushSync();

        const items = localeItems();
        expect(items.map((item) => item.getAttribute('lang'))).toEqual([
            'en',
            'fr',
        ]);
        // Endonyms, not names in the active locale: 'français', never 'French'.
        expect(items.map((item) => item.textContent?.trim())).toEqual([
            'English',
            'français',
        ]);
    });

    it('checks the active locale and sets it when another is chosen', async () => {
        const viewerState = await mountToolbar({
            en: ['Book'],
            fr: ['Livre'],
        });
        localeButton()!.click();
        flushSync();

        const [english, french] = localeItems();
        expect(english.getAttribute('aria-checked')).toBe('true');
        expect(french.getAttribute('aria-checked')).toBe('false');

        french.click();
        flushSync();

        expect(viewerState._localeOverride).toBe('fr');
        // `activeLocale` is mirrored by the viewer root, which is not mounted
        // here, so the toolbar's own checked state is asserted through it.
        viewerState.activeLocale = 'fr';
        flushSync();
        expect(localeItems()[1].getAttribute('aria-checked')).toBe('true');
        expect(localeItems()[0].getAttribute('aria-checked')).toBe('false');
    });
});
