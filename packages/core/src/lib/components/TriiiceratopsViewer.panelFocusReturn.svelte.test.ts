// Focus return for a CORE panel docked on the toolbar's own side.
//
// Nothing about the left-rail focus defect is plugin-specific: a core panel
// configured `position: 'left'` opens under the same floating→rail toolbar
// hand-off that destroys the toggle the reader activated. This is the core half
// of the case `TriiiceratopsViewer.pluginPanelClose.svelte.test.ts` covers for a
// plugin panel.

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import type { ViewerConfig } from '../types/config';
import type { ViewerState } from '../state/viewer.svelte';

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

// happy-dom lacks the Web Animations API used by the docked-panel transitions.
function stubAnimate() {
    if ('animate' in Element.prototype) return;
    (Element.prototype as unknown as Record<string, unknown>).animate =
        function () {
            return {
                onfinish: null,
                cancel() {},
                finish() {},
                finished: Promise.resolve(),
                playState: 'finished',
            } as unknown as Animation;
        };
}

function infoToggle(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>('[data-panel-toggle="metadata"]');
}

function metadataSection(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>('[data-panel-id="metadata"]');
}

describe('core panel focus return under a docked left rail', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
        stubAnimate();
    });

    afterEach(() => {
        target.remove();
    });

    it('returns focus to the rebuilt toggle for a LEFT-docked information panel', async () => {
        const props = $state({
            config: {
                toolbarOpen: true,
                information: { position: 'left' },
            } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const toggle = infoToggle(target);
        expect(toggle).not.toBeNull();
        toggle!.focus();
        toggle!.click();
        await settle();

        // The floating toolbar was replaced by the rail, taking the toggle with
        // it — the reason a captured node cannot be the invoker here.
        expect(toggle!.isConnected).toBe(false);

        const section = metadataSection(target);
        expect(section).not.toBeNull();
        expect(section!.contains(document.activeElement)).toBe(true);

        section!.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );
        await settle();

        // The panel's own outro leaves its markup up for a moment, so read the
        // state rather than the DOM for "closed".
        expect(props.viewerState!.showMetadataPanel).toBe(false);
        expect(document.activeElement).toBe(infoToggle(target));

        await unmount(app);
    });

    it('leaves focus on the toggle for a RIGHT-docked information panel', async () => {
        // The default side: no rail hand-off, so the toggle survives and the
        // panel has no reason to take focus.
        const props = $state({
            config: { toolbarOpen: true } as ViewerConfig,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const toggle = infoToggle(target);
        toggle!.focus();
        toggle!.click();
        await settle();

        expect(toggle!.isConnected).toBe(true);
        expect(document.activeElement).toBe(toggle);

        await unmount(app);
    });
});
