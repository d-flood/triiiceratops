import { expect, it } from 'vitest';

import { ViewerState } from './viewer.svelte';

const CANVAS = 'https://example.org/canvas/1';

it("keeps a plugin's fallback apart from the reader's pick", () => {
    const state = new ViewerState();

    state.selectChoice(CANVAS, 'mp3', { fallback: true });
    expect(state.getSelectedChoice(CANVAS)).toBe('mp3');
    expect(state.selectedChoices.has(CANVAS)).toBe(false);

    state.selectChoice(CANVAS, 'flac');
    expect(state.getSelectedChoice(CANVAS)).toBe('flac');

    state.resetChoices();
    expect(state.selectedChoices.size).toBe(0);
    expect(state.getSelectedChoice(CANVAS)).toBe('mp3');
});
