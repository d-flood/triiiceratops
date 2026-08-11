import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import AnnotationPanelTestHost from './AnnotationPanelTestHost.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { manifestV2WithSearch } from '../test/fixtures/manifests';

/**
 * What the annotation panel does with the SELECTED annotation.
 *
 * Selection is made on the image — a tap on a shape — and the panel is where a
 * reader reads it, so "became active in the panel" has to be a property of the
 * rendered rows and not only of the state member. Asserted against a real
 * `ViewerState` for that reason: what the row is marked from is
 * `activeAnnotationId`, whoever set it.
 *
 * `aria-current` is asserted beside the class because the mark must not be
 * colour-only (WCAG 1.4.1): a screen reader reaches the same rows and has to be
 * told which one is current.
 */
async function mountPanelWithAnnotations(annotations: any[]) {
    const json = structuredClone(manifestV2WithSearch) as any;
    json['@id'] = `http://example.org/manifest/selection-${Math.random()}`;
    const manifestId = json['@id'];

    // The fixture canvas points `otherContent` at an external annotation list;
    // opening the panel would fetch it. The annotations under test are supplied
    // directly instead.
    for (const canvas of json.sequences[0].canvases) {
        delete canvas.otherContent;
    }

    const viewerState = new ViewerState();
    await viewerState.setManifestData(manifestId, json);
    viewerState.showAnnotations = true;
    viewerState.setUserAnnotations(
        manifestId,
        viewerState.canvasId!,
        annotations,
    );

    const mounted = mount(AnnotationPanelTestHost, {
        target: document.body,
        props: { viewerState },
    });
    flushSync();

    return { mounted, manifestId, viewerState };
}

const FIRST = {
    id: 'http://example.org/anno/1',
    body: { type: 'TextualBody', value: 'The first note' },
};

const SECOND = {
    id: 'http://example.org/anno/2',
    body: { type: 'TextualBody', value: 'The second note' },
};

function rowFor(annotationId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        `[data-annotation-row="${annotationId}"]`,
    );
}

describe('AnnotationPanel selection', () => {
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

    it('marks no row while nothing is selected', async () => {
        ({ mounted, manifestId } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]));

        expect(document.querySelectorAll('.row.active')).toHaveLength(0);
        expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
    });

    it('marks the selected annotation’s row, and only that one', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        viewerState.setActiveAnnotationId(SECOND.id);
        flushSync();

        expect(rowFor(SECOND.id)!.classList.contains('active')).toBe(true);
        expect(rowFor(SECOND.id)!.getAttribute('aria-current')).toBe('true');
        expect(rowFor(FIRST.id)!.classList.contains('active')).toBe(false);
        expect(rowFor(FIRST.id)!.getAttribute('aria-current')).toBeNull();
    });

    it('moves the mark when the selection moves, and drops it when cleared', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        viewerState.setActiveAnnotationId(FIRST.id);
        flushSync();
        expect(rowFor(FIRST.id)!.classList.contains('active')).toBe(true);

        viewerState.setActiveAnnotationId(SECOND.id);
        flushSync();
        expect(rowFor(FIRST.id)!.classList.contains('active')).toBe(false);
        expect(rowFor(SECOND.id)!.classList.contains('active')).toBe(true);

        viewerState.setActiveAnnotationId(null);
        flushSync();
        expect(document.querySelectorAll('.row.active')).toHaveLength(0);
    });

    it('selects the annotation when its row is clicked', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        rowFor(SECOND.id)!.click();
        flushSync();

        expect(viewerState.activeAnnotationId).toBe(SECOND.id);
        expect(rowFor(SECOND.id)!.getAttribute('aria-current')).toBe('true');
    });

    it('moves the selection when another row is clicked, and clears it on the same one', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        rowFor(FIRST.id)!.click();
        flushSync();
        rowFor(SECOND.id)!.click();
        flushSync();
        expect(viewerState.activeAnnotationId).toBe(SECOND.id);

        rowFor(SECOND.id)!.click();
        flushSync();
        expect(viewerState.activeAnnotationId).toBeNull();
    });

    it('selects on Enter and Space, so the row works from the keyboard', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
        ]);
        ({ mounted, manifestId } = rest);

        for (const key of ['Enter', ' ']) {
            rowFor(FIRST.id)!.dispatchEvent(
                new KeyboardEvent('keypress', { key, bubbles: true }),
            );
            flushSync();
        }

        // Selected by the first key, put down again by the second.
        expect(viewerState.activeAnnotationId).toBeNull();
    });

    /**
     * The row's click SELECTS; the eye button shows and hides. They were the same
     * control before — the row was a second, unlabelled visibility toggle — and
     * clicking the annotation you wanted to look at was as likely to make it
     * disappear.
     */
    it('leaves visibility alone when a row is clicked, and the eye alone toggles it', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        const before = [...viewerState.visibleAnnotationIds].sort();
        rowFor(SECOND.id)!.click();
        flushSync();
        expect([...viewerState.visibleAnnotationIds].sort()).toEqual(before);

        const wasVisible = viewerState.visibleAnnotationIds.has(SECOND.id);
        const eye = rowFor(SECOND.id)!.querySelector('button');
        eye!.click();
        flushSync();
        expect(viewerState.visibleAnnotationIds.has(SECOND.id)).toBe(
            !wasVisible,
        );
        // …and toggling it did not change which annotation is selected.
        expect(viewerState.activeAnnotationId).toBe(SECOND.id);
    });

    /**
     * Selecting an annotation must not change what is VISIBLE — from either
     * direction. A selection that also hid or showed shapes would make the image
     * jump under a reader who only asked which note this was.
     */
    it('does not change annotation visibility', async () => {
        const { viewerState, ...rest } = await mountPanelWithAnnotations([
            FIRST,
            SECOND,
        ]);
        ({ mounted, manifestId } = rest);

        const before = [...viewerState.visibleAnnotationIds].sort();
        viewerState.setActiveAnnotationId(SECOND.id);
        flushSync();

        expect([...viewerState.visibleAnnotationIds].sort()).toEqual(before);
        expect(viewerState.annotationVisibilityTouched).toBe(false);
    });
});
