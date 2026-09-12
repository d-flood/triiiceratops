// @vitest-environment node
/**
 * The one shipped default with a decision in it rather than a number.
 *
 * Node environment for the same reason `planScene.test.ts` is: the renderer's
 * module graph must load with no DOM globals at all, and a budget chosen from a
 * media query is exactly the sort of thing that would quietly acquire one.
 */

import { describe, expect, it } from 'vitest';

import {
    DESKTOP_BYTE_BUDGET,
    MOBILE_BUDGET_QUERY,
    MOBILE_BYTE_BUDGET,
    resolveByteBudget,
} from './rendererDefaults';

describe('resolveByteBudget', () => {
    it('runs with no DOM globals present', () => {
        expect(typeof globalThis.window).toBe('undefined');
        expect(resolveByteBudget(() => false)).toBe(DESKTOP_BYTE_BUDGET);
    });

    it('takes the smaller ceiling on a coarse-pointer device with no hover', () => {
        // A phone will kill the tab for far less than a desktop tolerates, and
        // decoded images are invisible to every heap metric that would have
        // warned first (spec, user story 13).
        expect(
            resolveByteBudget((query) => query === MOBILE_BUDGET_QUERY),
        ).toBe(MOBILE_BYTE_BUDGET);
    });

    it('asks exactly one question, and it is about the input', () => {
        const asked: string[] = [];
        resolveByteBudget((query) => {
            asked.push(query);
            return false;
        });

        expect(asked).toEqual([MOBILE_BUDGET_QUERY]);
    });

    it('keeps the mobile ceiling below the desktop one', () => {
        expect(MOBILE_BYTE_BUDGET).toBeLessThan(DESKTOP_BYTE_BUDGET);
    });
});
