import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import AnnotationPanelTestHost from './AnnotationPanelTestHost.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { manifestV2WithSearch } from '../test/fixtures/manifests';

/**
 * What the annotation panel does with the two body shapes whose value is a URL
 * or markup, both of which come straight from a manifest.
 *
 * A `linking` body is bound into an `href` by hand, and a `text/html` body is
 * rebuilt by the rich-text renderer. Those are the same hazard reached two
 * different ways, so they get the same scheme check — these tests pin that at
 * the seam an integrator sees, rendered DOM from a real `ViewerState`.
 */

async function mountPanelWithAnnotation(annotation: any) {
    const json = structuredClone(manifestV2WithSearch) as any;
    json['@id'] = `http://example.org/manifest/annotations-${Math.random()}`;
    const manifestId = json['@id'];

    // The fixture's canvas points `otherContent` at an external annotation list.
    // Opening this panel would go and fetch it, which is noise here: the bodies
    // under test are supplied directly.
    for (const canvas of json.sequences[0].canvases) {
        delete canvas.otherContent;
    }

    const viewerState = new ViewerState();
    await viewerState.setManifestData(manifestId, json);
    viewerState.showAnnotations = true;

    const canvasId = viewerState.canvasId!;
    viewerState.setUserAnnotations(manifestId, canvasId, [
        { id: 'http://example.org/anno/1', ...annotation },
    ]);

    const mounted = mount(AnnotationPanelTestHost, {
        target: document.body,
        props: { viewerState },
    });
    flushSync();

    return { mounted, manifestId };
}

describe('AnnotationPanel bodies', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let manifestId: string | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        if (manifestId) {
            manifestsState.clearManifest(manifestId);
            manifestId = null;
        }
        document.body.innerHTML = '';
    });

    it('links a linking body whose URL is http(s)', async () => {
        ({ mounted, manifestId } = await mountPanelWithAnnotation({
            body: {
                type: 'TextualBody',
                purpose: 'linking',
                value: 'https://example.org/record/1',
            },
        }));

        const link = document.querySelector('a.link');
        expect(link?.getAttribute('href')).toBe('https://example.org/record/1');
    });

    it('refuses to link a javascript: linking body but keeps its text', async () => {
        ({ mounted, manifestId } = await mountPanelWithAnnotation({
            body: {
                type: 'TextualBody',
                purpose: 'linking',
                value: 'javascript:globalThis.__pwned = true',
            },
        }));

        // No anchor at all: an `<a>` with no `href` carries link styling and a
        // pointer cursor while being neither focusable nor activatable, which
        // promises a keyboard user a destination that does not exist. The
        // refused URL is shown as plain text instead.
        expect(document.querySelector('a.link')).toBeNull();
        expect(document.querySelector('.link-text')?.textContent).toContain(
            'javascript:',
        );
    });

    it('rebuilds a text/html body from the allowlist', async () => {
        ({ mounted, manifestId } = await mountPanelWithAnnotation({
            body: {
                type: 'TextualBody',
                format: 'text/html',
                value:
                    '<p>Cited in <a href="https://example.org/s">the survey</a>.</p>' +
                    '<script>globalThis.__pwned = true;</script>' +
                    '<a href="javascript:globalThis.__pwned = true">trap</a>' +
                    '<img src="data:text/html,x" onerror="globalThis.__pwned = true">',
            },
        }));

        const body = document.querySelector('.viewer-html.bodies');
        expect(body).not.toBeNull();
        expect(body!.querySelectorAll('script')).toHaveLength(0);
        expect(body!.querySelector('p')).not.toBeNull();

        const anchors = Array.from(body!.querySelectorAll('a'));
        expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
            'https://example.org/s',
            null,
        ]);
        expect(anchors[1].textContent).toBe('trap');

        // The image survives as an element; its `data:` src and its event
        // handler do not.
        const image = body!.querySelector('img');
        expect(image).not.toBeNull();
        expect(image!.hasAttribute('src')).toBe(false);
        expect(image!.hasAttribute('onerror')).toBe(false);

        expect(
            (globalThis as unknown as Record<string, unknown>).__pwned,
        ).toBeUndefined();
        expect(body!.textContent).toContain('Cited in the survey.');
    });

    it('shows a plain-text body as characters, not markup', async () => {
        ({ mounted, manifestId } = await mountPanelWithAnnotation({
            body: {
                type: 'TextualBody',
                value: '<b>a < b</b>',
            },
        }));

        const body = document.querySelector('.viewer-html.bodies');
        expect(body!.querySelector('b')).toBeNull();
        expect(body!.textContent).toContain('<b>a < b</b>');
    });
});
