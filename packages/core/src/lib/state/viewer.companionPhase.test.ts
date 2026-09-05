import { describe, expect, it } from 'vitest';
import { SvelteMap } from 'svelte/reactivity';

import { configureLogging } from '../logging/logger';
import type { ViewerError } from '../types/viewerError';
import type { CompanionPhase } from './viewer.svelte';
import { ViewerState } from './viewer.svelte';

/**
 * The **companion phase** as viewer state owns it: who may set one, which calls
 * are refused, and the release that comes with the claim.
 *
 * It stores and reads a phase and paints nothing — what a phase makes core PAINT
 * is asserted where the descriptors are built. This file is the bookkeeping,
 * beside `viewer.canvasClaim.test.ts`, whose structure it follows.
 */
describe('companion phase', () => {
    const CANVAS = 'https://example.test/canvas/recording';

    function viewerWithPlugins(...pluginIds: string[]): ViewerState {
        const state = new ViewerState();
        for (const pluginId of pluginIds) state.ensurePluginUiState(pluginId);
        return state;
    }

    function reporting(state: ViewerState): ViewerError[] {
        const reported: ViewerError[] = [];
        state.setErrorReporter((error) => reported.push(error));
        return reported;
    }

    /**
     * The default: a claimant that never asks for a phase leaves the claim's
     * suppression-only semantics untouched, so an unclaimed canvas and a claimed
     * one both read as painting nothing.
     */
    it('paints no companion by default', () => {
        const state = viewerWithPlugins('av');

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);

        state.claimCanvas(CANVAS, 'av');
        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
    });

    it('reads back a phase the claimant set, and only for that canvas', () => {
        const state = viewerWithPlugins('av');
        const other = 'https://example.test/canvas/other';
        const reported = reporting(state);
        state.claimCanvas(CANVAS, 'av');

        state.setCompanionPhase(CANVAS, 'av', 'placeholder');

        expect(state.isPaintingCompanion(CANVAS)).toBe(true);
        expect(state.isPaintingCompanion(other)).toBe(false);
        expect(reported).toEqual([]);
    });

    it('reads `none` as painting nothing and the other two as painting', () => {
        const state = viewerWithPlugins('av');
        state.claimCanvas(CANVAS, 'av');

        state.setCompanionPhase(CANVAS, 'av', 'none');
        expect(state.isPaintingCompanion(CANVAS)).toBe(false);

        state.setCompanionPhase(CANVAS, 'av', 'accompanying');
        expect(state.isPaintingCompanion(CANVAS)).toBe(true);

        state.setCompanionPhase(CANVAS, 'av', 'placeholder');
        expect(state.isPaintingCompanion(CANVAS)).toBe(true);

        // The schedule a claimant actually runs: a placeholder gives way on
        // first play, and the canvas keeps painting throughout.
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');
        expect(state.isPaintingCompanion(CANVAS)).toBe(true);

        state.setCompanionPhase(CANVAS, 'av', 'none');
        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
    });

    /**
     * The one-claimant invariant is not weakened by the new command: a phase is
     * the claimant's to set, and everybody else is refused on the channel a
     * refused claim already uses.
     */
    it('refuses a phase from a plugin that is not the claimant, and keeps the stored phase', () => {
        const records: string[] = [];
        configureLogging({
            debug: true,
            sink: (_level, args) => records.push(args.join(' ')),
        });
        try {
            const state = viewerWithPlugins('av', 'interloper');
            state.claimCanvas(CANVAS, 'av');
            state.setCompanionPhase(CANVAS, 'av', 'accompanying');
            const reported = reporting(state);

            state.setCompanionPhase(CANVAS, 'interloper', 'none');

            expect(state.isPaintingCompanion(CANVAS)).toBe(true);
            expect(records.join('\n')).toContain(CANVAS);
            expect(reported).toHaveLength(1);
            expect(reported[0].severity).toBe('warning');
            expect(reported[0].scope).toBe('plugin');
            expect(reported[0].code).toBe('canvas-claim-refused');
            expect(reported[0].message).toContain(CANVAS);
            expect(reported[0].message).toContain('interloper');
        } finally {
            configureLogging({ debug: false, sink: null });
        }
    });

    it('refuses a phase for a canvas nobody has claimed', () => {
        const state = viewerWithPlugins('av');
        const reported = reporting(state);

        state.setCompanionPhase(CANVAS, 'av', 'accompanying');

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
        ]);
        expect(reported[0].message).toContain(CANVAS);
    });

    /**
     * The claim is keyed on the id the viewer knows the plugin by, and the phase
     * rides that same key — otherwise a phase under an unattributable name would
     * outlive the activation that set it, exactly as an unattributable claim
     * would.
     */
    it('refuses a phase from an id this viewer knows no plugin by', () => {
        const state = viewerWithPlugins('triiiceratops-plugin-av');
        state.claimCanvas(CANVAS, 'triiiceratops-plugin-av');
        const reported = reporting(state);

        state.setCompanionPhase(CANVAS, 'plugin-av', 'accompanying');

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
        ]);
        expect(reported[0].message).toContain('plugin-av');
    });

    it('refuses an empty canvas id or plugin id without throwing', () => {
        const state = viewerWithPlugins('av');
        state.claimCanvas(CANVAS, 'av');
        const reported = reporting(state);

        expect(() =>
            state.setCompanionPhase('', 'av', 'accompanying'),
        ).not.toThrow();
        expect(() =>
            state.setCompanionPhase(CANVAS, '', 'accompanying'),
        ).not.toThrow();

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
            'canvas-claim-refused',
        ]);
    });

    /**
     * An unknown phase is a caller bug, and coercing it to `'none'` would report
     * a typo as a deliberate "paint nothing" — the failure mode the refusal
     * channel exists to prevent.
     */
    it('refuses an unknown phase rather than coercing it to none', () => {
        const state = viewerWithPlugins('av');
        state.claimCanvas(CANVAS, 'av');
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');
        const reported = reporting(state);

        state.setCompanionPhase(
            CANVAS,
            'av',
            'poster' as unknown as CompanionPhase,
        );

        expect(state.isPaintingCompanion(CANVAS)).toBe(true);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
        ]);
        expect(reported[0].message).toContain('poster');
    });

    it('clears the phase when the claim releases itself', () => {
        const state = viewerWithPlugins('av');
        const release = state.claimCanvas(CANVAS, 'av');
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');

        release();

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
    });

    it('clears the phase when the claimant is unregistered', () => {
        const state = viewerWithPlugins('av', 'threed');
        const model = 'https://example.test/canvas/model';
        state.claimCanvas(CANVAS, 'av');
        state.claimCanvas(model, 'threed');
        state.setCompanionPhase(CANVAS, 'av', 'placeholder');
        state.setCompanionPhase(model, 'threed', 'accompanying');

        state.unregisterPlugin('av');

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
        // Another plugin's phase is none of this unregistration's business.
        expect(state.isPaintingCompanion(model)).toBe(true);
    });

    it('clears every phase when all plugins are destroyed', () => {
        const state = viewerWithPlugins('av', 'threed');
        const model = 'https://example.test/canvas/model';
        state.claimCanvas(CANVAS, 'av');
        state.claimCanvas(model, 'threed');
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');
        state.setCompanionPhase(model, 'threed', 'placeholder');

        state.destroyAllPlugins();

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
        expect(state.isPaintingCompanion(model)).toBe(false);
    });

    /**
     * The interleaving the claim's dispose identity check exists for, met from
     * the phase's side: the first claim is dropped by the BACKSTOP, so its
     * dispose is still live when the canvas is claimed afresh. Firing it must not
     * blank the new claimant's picture.
     */
    it('cannot clear a re-claimed canvas’s phase with a stale dispose', () => {
        const state = viewerWithPlugins('av', 'other');

        const staleRelease = state.claimCanvas(CANVAS, 'av');
        state.setCompanionPhase(CANVAS, 'av', 'placeholder');
        state.unregisterPlugin('av');
        state.claimCanvas(CANVAS, 'other');
        state.setCompanionPhase(CANVAS, 'other', 'accompanying');

        staleRelease();

        expect(state.claimedCanvases.get(CANVAS)).toBe('other');
        expect(state.isPaintingCompanion(CANVAS)).toBe(true);
    });

    /**
     * A re-claim starts from the default rather than inheriting whatever the
     * previous claimant was painting — the phase belongs to a claim, not to a
     * canvas id.
     */
    it('starts a fresh claim at the default phase', () => {
        const state = viewerWithPlugins('av', 'other');
        const first = state.claimCanvas(CANVAS, 'av');
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');
        first();

        state.claimCanvas(CANVAS, 'other');

        expect(state.isPaintingCompanion(CANVAS)).toBe(false);
    });

    /**
     * User story 34 is served by the boolean and by nothing else: no accessor
     * anywhere on the chain hands the phase map out, so `isPaintingCompanion`
     * is the only read a host has.
     *
     * The map itself is TS `private`, which is compile-time only — it stays
     * reflectable because the state inventory's gate has to see it. What is
     * asserted here is the part that does hold at runtime: nothing PUBLISHES
     * it. A `get companionPhases()` added later fails this.
     */
    it('exposes no accessor for the phase collection', () => {
        const state = viewerWithPlugins('av');
        state.claimCanvas(CANVAS, 'av');
        state.setCompanionPhase(CANVAS, 'av', 'accompanying');

        for (
            let proto = Object.getPrototypeOf(state);
            proto && proto !== Object.prototype;
            proto = Object.getPrototypeOf(proto)
        ) {
            expect(
                Object.getOwnPropertyDescriptor(proto, 'companionPhases'),
            ).toBeUndefined();
        }

        // The claim set keeps its published shape: widening it to carry the
        // phase would be a breaking change to a public read.
        expect(state.claimedCanvases.get(CANVAS)).toBe('av');
    });

    /**
     * Ticket 02 selects a companion descriptor inside a reactive read, so the
     * phase map must be a `SvelteMap` — a plain `Map` would store and read back
     * correctly, passing every other test in this file, while silently never
     * waking that selection.
     */
    it('holds the phase map in a reactive collection', () => {
        const state = viewerWithPlugins('av');

        expect(
            (state as unknown as Record<string, unknown>).companionPhases,
        ).toBeInstanceOf(SvelteMap);
    });
});
