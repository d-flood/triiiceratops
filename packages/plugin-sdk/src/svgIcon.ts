/**
 * `svgIcon` — the SDK's validated toolbar-icon helper (ticket 08).
 *
 * A plugin author authors a full SVG string and passes it to `svgIcon`, which
 * validates it and returns a core-owned {@link IconDescriptor}. Per SPEC.md
 * ("Plugin SDK And Browser API") and CONTEXT.md, icon validation is a *developer
 * error* channel: `svgIcon` throws **synchronously** at the call site (never a
 * runtime plugin-error state) when the markup contains anything unsafe to inject
 * into core's chrome:
 *
 * - `<script>` elements,
 * - `on*` event-handler attributes (`onload=`, `onclick=`, …),
 * - external `href` / `xlink:href` URLs (anything but an internal `#…` fragment),
 * - `<foreignObject>` (arbitrary embedded HTML).
 *
 * On success it returns only the sanitized *inner* markup plus the source
 * `viewBox`; core owns the `<svg>` wrapper (dimensions, `currentColor`,
 * focusability, accessibility), so plugin icons stay consistent.
 *
 * Validation is pure string parsing (no DOM), so it runs identically at plugin
 * author time, under SSR, and in Node tests.
 */

import type { IconDescriptor } from 'triiiceratops';

/** Thrown synchronously by {@link svgIcon} for a developer error in the markup. */
export class SvgIconError extends Error {
    override readonly name = 'SvgIconError';
    constructor(message: string) {
        super(`svgIcon: ${message}`);
    }
}

/** Default viewBox when the source SVG declares neither `viewBox` nor size. */
const DEFAULT_VIEWBOX = '0 0 24 24';

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new SvgIconError(message);
}

/** Extract the opening `<svg …>` tag (icon SVGs never put `>` inside attrs). */
const OPEN_SVG = /<svg\b[^>]*>/i;

/**
 * Validate a full SVG string and produce a sanitized {@link IconDescriptor}.
 * Throws {@link SvgIconError} synchronously on any rejected construct.
 */
export function svgIcon(svg: string): IconDescriptor {
    assert(typeof svg === 'string', 'expected an SVG string.');
    const source = svg.trim();
    assert(source.length > 0, 'received an empty string.');

    const open = OPEN_SVG.exec(source);
    assert(open !== null, 'the markup must contain an <svg> root element.');

    // --- Rejections (developer errors) --------------------------------------
    assert(
        !/<script[\s/>]/i.test(source),
        '<script> elements are not allowed in plugin icons.',
    );
    assert(
        !/<foreignObject[\s/>]/i.test(source),
        '<foreignObject> is not allowed in plugin icons.',
    );
    assert(
        !/\son[a-z]+\s*=/i.test(source),
        'on* event-handler attributes (e.g. onload, onclick) are not allowed in plugin icons.',
    );
    for (const match of source.matchAll(
        /(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi,
    )) {
        const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        assert(
            value.startsWith('#'),
            `external href/xlink:href URLs are not allowed in plugin icons (found "${value}"); only internal "#id" references are.`,
        );
    }

    // --- Extraction ---------------------------------------------------------
    const openTag = open[0];
    const viewBoxMatch = /\bviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTag);
    let viewBox = (viewBoxMatch?.[1] ?? viewBoxMatch?.[2])?.trim();
    if (!viewBox) {
        const width = /\bwidth\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTag);
        const height = /\bheight\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTag);
        const w = parseFloat(width?.[1] ?? width?.[2] ?? '');
        const h = parseFloat(height?.[1] ?? height?.[2] ?? '');
        viewBox =
            Number.isFinite(w) && Number.isFinite(h)
                ? `0 0 ${w} ${h}`
                : DEFAULT_VIEWBOX;
    }

    let inner = '';
    if (!/\/\s*>$/.test(openTag)) {
        // Not self-closing: inner is everything between the opening tag and the
        // final </svg> (empty when they are adjacent; the rest when no closing
        // tag is present).
        const start = open.index + openTag.length;
        const end = source.lastIndexOf('</svg>');
        inner = (end >= start ? source.slice(start, end) : source.slice(start))
            .trim();
    }

    return { kind: 'svg', inner, viewBox };
}
