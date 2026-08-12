import { describe, expect, it } from 'vitest';

import { reconcileImages } from './imageRequests';
import type { StaticImageDraw } from './types';

/**
 * One canvas-filling static placement, as the planner emits it.
 *
 * The key is `canvasDescriptors`' spelling — the canvas id and the painting
 * annotation's position — so a single-image canvas is `c1#0`.
 */
function placement(
    key: string,
    url: string,
    overrides: Partial<StaticImageDraw> = {},
): StaticImageDraw {
    return {
        key,
        canvasId: key.split('#')[0],
        url,
        // Paint order is plan-wide and required; a single-image canvas is first.
        order: 0,
        x: 0,
        y: 0,
        width: 1200,
        height: 900,
        ...overrides,
    };
}

describe('reconcileImages', () => {
    it('requests an image the host does not hold', () => {
        const wanted = placement('c1#0', '/a.png');
        const result = reconcileImages({}, [wanted]);

        expect(result.load).toEqual([wanted]);
        expect(result.drop).toEqual([]);
    });

    it('leaves an unchanged placement alone, in flight or decoded', () => {
        const result = reconcileImages({ 'c1#0': '/a.png' }, [
            placement('c1#0', '/a.png'),
        ]);

        expect(result.load).toEqual([]);
        expect(result.drop).toEqual([]);
    });

    /*
     * The finding this module exists for: selecting a different Choice on a
     * canvas resolves the SAME placement to a different URL. A cache keyed on
     * the placement alone reports a hit and paints the superseded image forever.
     */
    it('reloads when the URL changes under a stable key', () => {
        const result = reconcileImages({ 'c1#0': '/recto.png' }, [
            placement('c1#0', '/verso.png'),
        ]);

        expect(result.load).toEqual([placement('c1#0', '/verso.png')]);
        // And the stale pixels go immediately, rather than painting on until
        // the replacement decodes.
        expect(result.drop).toEqual(['c1#0']);
    });

    it('drops a placement that is no longer shown', () => {
        const result = reconcileImages({ 'c1#0': '/a.png', 'c2#0': '/b.png' }, [
            placement('c2#0', '/b.png'),
        ]);

        expect(result.drop).toEqual(['c1#0']);
        expect(result.load).toEqual([]);
    });

    /*
     * The composite case (IIIF Cookbook 0036). Two painting annotations on ONE
     * canvas are two placements with two URLs and two boxes, and both are held
     * at once. Keyed on the canvas instead, the second would evict the first on
     * every reconciliation and the pair would flicker against each other
     * forever.
     */
    it('holds every placement of a composite canvas at once', () => {
        const folio = placement('c1#0', '/folio.png');
        const miniature = placement('c1#1', '/miniature.png', {
            x: 3949,
            y: 994,
            width: 1091,
            height: 1232,
        });

        expect(reconcileImages({}, [folio, miniature])).toEqual({
            drop: [],
            load: [folio, miniature],
        });

        // And holding one is not holding the other.
        expect(
            reconcileImages({ 'c1#0': '/folio.png' }, [folio, miniature]),
        ).toEqual({ drop: [], load: [miniature] });
    });

    it('holds nothing for a service source: those are tiles', () => {
        // The planner emits static placements only, so a service-painted canvas
        // simply contributes none.
        expect(reconcileImages({}, [])).toEqual({ drop: [], load: [] });
        // Including when the canvas USED to be a static image and became a
        // service source — whatever was held for it must go.
        expect(reconcileImages({ 'c1#0': '/a.png' }, [])).toEqual({
            drop: ['c1#0'],
            load: [],
        });
    });

    it('drops everything when the world empties', () => {
        expect(
            reconcileImages({ 'c1#0': '/a.png', 'c2#0': '/b.png' }, []),
        ).toEqual({
            drop: ['c1#0', 'c2#0'],
            load: [],
        });
    });
});
