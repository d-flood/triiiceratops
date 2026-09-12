/**
 * True for a number that can be measured with — finite, and greater than zero.
 *
 * The one predicate behind every "is this dimension usable?" question in core.
 * Manifest JSON, an `info.json`, and a host's viewer config all reach the same
 * three ways of not being a length: absent, `null`, and a `NaN` or `Infinity`
 * from a round-trip. A width of `0` is the fourth, and belongs here too because
 * nothing downstream can divide by it.
 *
 * `unknown` rather than `number | null | undefined`: every caller is at a
 * boundary where the value came out of JSON, and the `typeof` check is the part
 * that makes the narrowing sound.
 */
export function isPositiveFinite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
