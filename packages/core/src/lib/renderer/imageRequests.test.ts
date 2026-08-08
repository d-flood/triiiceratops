import { describe, expect, it } from 'vitest';

import { reconcileImages } from './imageRequests';
import type { PlannerCanvas } from './types';

function staticCanvas(id: string, url: string): PlannerCanvas {
    return { id, width: 1200, height: 900, source: { kind: 'static', url } };
}

describe('reconcileImages', () => {
    it('requests an image the host does not hold', () => {
        const result = reconcileImages({}, [staticCanvas('c1', '/a.png')]);

        expect(result.load).toEqual([{ canvasId: 'c1', url: '/a.png' }]);
        expect(result.drop).toEqual([]);
    });

    it('leaves an unchanged canvas alone, in flight or decoded', () => {
        const result = reconcileImages({ c1: '/a.png' }, [
            staticCanvas('c1', '/a.png'),
        ]);

        expect(result.load).toEqual([]);
        expect(result.drop).toEqual([]);
    });

    /*
     * The finding this module exists for: selecting a different Choice on a
     * canvas resolves the SAME canvas id to a different URL. A cache keyed on
     * the id alone reports a hit and paints the superseded image forever.
     */
    it('reloads when the URL changes under a stable canvas id', () => {
        const result = reconcileImages({ c1: '/recto.png' }, [
            staticCanvas('c1', '/verso.png'),
        ]);

        expect(result.load).toEqual([{ canvasId: 'c1', url: '/verso.png' }]);
        // And the stale pixels go immediately, rather than painting on until
        // the replacement decodes.
        expect(result.drop).toEqual(['c1']);
    });

    it('drops a canvas that is no longer shown', () => {
        const result = reconcileImages({ c1: '/a.png', c2: '/b.png' }, [
            staticCanvas('c2', '/b.png'),
        ]);

        expect(result.drop).toEqual(['c1']);
        expect(result.load).toEqual([]);
    });

    it('holds nothing for a service source: tiles are ticket 05', () => {
        const service: PlannerCanvas = {
            id: 'c1',
            width: 1200,
            height: 900,
            source: { kind: 'service', serviceId: '/iiif/c1', profile: null },
        };

        expect(reconcileImages({}, [service])).toEqual({
            drop: [],
            load: [],
        });
        // Including when the canvas USED to be a static image and became a
        // service source — whatever was held for it must go.
        expect(reconcileImages({ c1: '/a.png' }, [service])).toEqual({
            drop: ['c1'],
            load: [],
        });
    });

    it('drops everything when the world empties', () => {
        expect(reconcileImages({ c1: '/a.png', c2: '/b.png' }, [])).toEqual({
            drop: ['c1', 'c2'],
            load: [],
        });
    });
});
