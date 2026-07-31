import { describe, expect, it } from 'vitest';

import {
    shallowEqual,
    VIEWER_ATTRIBUTE_PROPS,
    VIEWER_PROPERTY_PROPS,
    viewerElementAttributes,
    viewerPropTier,
} from './props.js';

/**
 * The prop metadata and its one change-detection rule.
 *
 * These are pure and framework-neutral on purpose: the tier of an input is a
 * property of the INPUT, never of the runtime value it happens to carry, and
 * change detection is one uniform one-level comparison with no per-prop
 * heuristics. Both properties are far easier to pin down here than through a
 * mounted element.
 */

describe('prop tiers', () => {
    it('classifies every viewer input into exactly one tier', () => {
        const attributeProps = Object.keys(VIEWER_ATTRIBUTE_PROPS);
        expect(attributeProps).toEqual(['manifestId', 'canvasId', 'theme']);
        expect([...VIEWER_PROPERTY_PROPS]).toEqual([
            'manifestJson',
            'themeConfig',
            'config',
            'initialCanvasRegion',
            'plugins',
            'searchProvider',
        ]);
        // Disjoint: nothing is written twice, nothing is written nowhere.
        for (const name of attributeProps) {
            expect(VIEWER_PROPERTY_PROPS).not.toContain(name);
            expect(viewerPropTier(name)).toBe('attribute');
        }
        for (const name of VIEWER_PROPERTY_PROPS) {
            expect(viewerPropTier(name)).toBe('property');
        }
    });

    it('routes the string-or-object inputs to the property tier unconditionally', () => {
        // The four inputs that accept a JSON string OR the parsed object never
        // branch on the runtime type: both forms go to the property.
        for (const name of [
            'manifestJson',
            'themeConfig',
            'config',
            'initialCanvasRegion',
        ]) {
            expect(viewerPropTier(name)).toBe('property');
        }
    });

    it('does not treat host attributes or the state bridge as viewer inputs', () => {
        for (const name of [
            'className',
            'class',
            'style',
            'id',
            'data-testid',
            'aria-label',
            'viewerState',
            'children',
        ]) {
            expect(viewerPropTier(name)).toBeUndefined();
        }
    });
});

describe('viewerElementAttributes', () => {
    it('maps the attribute tier to kebab-case attributes', () => {
        expect(
            viewerElementAttributes({
                manifestId: 'https://example.org/manifest',
                canvasId: 'https://example.org/canvas/1',
                theme: 'dark',
            }),
        ).toEqual({
            'manifest-id': 'https://example.org/manifest',
            'canvas-id': 'https://example.org/canvas/1',
            theme: 'dark',
        });
    });

    it('omits absent inputs so an unconfigured host renders bare', () => {
        expect(viewerElementAttributes({})).toEqual({});
        expect(viewerElementAttributes({ theme: 'teal' })).toEqual({
            theme: 'teal',
        });
    });

    it('is pure, so the server and the client first render agree', () => {
        const props = { manifestId: 'm', canvasId: 'c', theme: 'light' };
        expect(viewerElementAttributes(props)).toEqual(
            viewerElementAttributes({ ...props }),
        );
    });

    it('never emits a property-tier input as an attribute', () => {
        const attributes = viewerElementAttributes({
            manifestId: 'm',
        } as Record<string, string>);
        for (const name of VIEWER_PROPERTY_PROPS) {
            expect(Object.keys(attributes)).not.toContain(name);
        }
    });
});

describe('shallowEqual', () => {
    it('is identity for primitives and for the same reference', () => {
        const shared = { a: 1 };
        expect(shallowEqual(shared, shared)).toBe(true);
        expect(shallowEqual('m', 'm')).toBe(true);
        expect(shallowEqual(undefined, undefined)).toBe(true);
        expect(shallowEqual(NaN, NaN)).toBe(true);
        expect(shallowEqual(0, -0)).toBe(false);
        expect(shallowEqual('a', 'b')).toBe(false);
    });

    it('accepts a fresh-but-equal array', () => {
        const a = { name: 'a' };
        const b = { name: 'b' };
        expect(shallowEqual([a, b], [a, b])).toBe(true);
        expect(shallowEqual([], [])).toBe(true);
    });

    it('rejects arrays that differ in length, order, or element identity', () => {
        const a = { name: 'a' };
        const b = { name: 'b' };
        expect(shallowEqual([a, b], [a])).toBe(false);
        expect(shallowEqual([a, b], [b, a])).toBe(false);
        // Element identity, not element contents: a fresh-but-equal element is
        // a genuine change, because plugin activation keys on object identity.
        expect(shallowEqual([{ name: 'a' }], [{ name: 'a' }])).toBe(false);
    });

    it('accepts a fresh-but-equal flat object', () => {
        expect(
            shallowEqual(
                { debug: true, locale: 'en' },
                { debug: true, locale: 'en' },
            ),
        ).toBe(true);
        expect(shallowEqual({}, {})).toBe(true);
    });

    it('rejects objects with different keys or values', () => {
        expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
        expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
        expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('is one level deep only — no deep equality, ever', () => {
        expect(shallowEqual({ nested: { x: 1 } }, { nested: { x: 1 } })).toBe(
            false,
        );
        const nested = { x: 1 };
        expect(shallowEqual({ nested }, { nested })).toBe(true);
    });

    it('does not compare across kinds or by serialization', () => {
        expect(shallowEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
        expect(shallowEqual({ a: 1 }, null)).toBe(false);
        expect(shallowEqual(null, null)).toBe(true);
        // Same JSON, different objects — serialization comparison is forbidden
        // because it is expensive and lies about functions and identity.
        expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
    });

    it('falls back to identity for non-plain objects and functions', () => {
        const fn = (): void => {};
        expect(shallowEqual(fn, fn)).toBe(true);
        expect(shallowEqual(fn, (): void => {})).toBe(false);

        class Config {
            debug = true;
        }
        expect(shallowEqual(new Config(), new Config())).toBe(false);
        expect(shallowEqual(new Map(), new Map())).toBe(false);
        const date = new Date(0);
        expect(shallowEqual(date, new Date(0))).toBe(false);
        expect(shallowEqual(date, date)).toBe(true);
    });

    it('treats a null-prototype object as a plain object', () => {
        const a = Object.assign(Object.create(null) as object, { x: 1 });
        const b = Object.assign(Object.create(null) as object, { x: 1 });
        expect(shallowEqual(a, b)).toBe(true);
    });
});
