import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { ViewerState } from '../state/viewer.svelte';
import type { ViewerConfig } from '../types/config';

const MARKER = 'catalog-marker-text';

function catalog(value = MARKER) {
    return { fr: { 'viewer.close': value, 'viewer.open': 'Ouvrir' } };
}

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

describe('TriiiceratopsViewer config change detection', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    async function mountWith(config: ViewerConfig) {
        const props = $state({ config });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();
        const updateConfig = vi.spyOn(ViewerState.prototype, 'updateConfig');
        return { props, app, updateConfig };
    }

    it('updates on a change beside the catalogs without serializing them', async () => {
        const { props, app, updateConfig } = await mountWith({
            showToggle: true,
            messages: catalog(),
        } as ViewerConfig);
        const stringify = vi.spyOn(JSON, 'stringify');

        props.config = {
            showToggle: false,
            messages: catalog(),
        } as ViewerConfig;
        flushSync();

        expect(updateConfig).toHaveBeenCalledTimes(1);
        const serialized = stringify.mock.results
            .map((result) => result.value)
            .filter((value): value is string => typeof value === 'string');
        expect(serialized.some((value) => value.includes(MARKER))).toBe(false);

        await unmount(app);
    });

    it('does not update for an equal config carrying equal catalogs', async () => {
        const { props, app, updateConfig } = await mountWith({
            showToggle: true,
            messages: catalog(),
        } as ViewerConfig);

        props.config = {
            showToggle: true,
            messages: catalog(),
        } as ViewerConfig;
        flushSync();

        expect(updateConfig).not.toHaveBeenCalled();
        await unmount(app);
    });

    it('updates when only a catalog message changes', async () => {
        const { props, app, updateConfig } = await mountWith({
            messages: catalog(),
        } as ViewerConfig);

        props.config = { messages: catalog('Fermer') } as ViewerConfig;
        flushSync();

        expect(updateConfig).toHaveBeenCalledTimes(1);
        await unmount(app);
    });

    it('updates when a catalog message is changed in place', async () => {
        const { props, app, updateConfig } = await mountWith({
            messages: catalog(),
        } as ViewerConfig);

        (props.config as any).messages.fr['viewer.close'] = 'Fermer';
        flushSync();

        expect(updateConfig).toHaveBeenCalledTimes(1);
        await unmount(app);
    });
});
