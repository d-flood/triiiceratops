/**
 * One run of search-excerpt text, and whether the search service marked it as
 * the matched term.
 */
export interface HighlightSegment {
    /** Plain text. Rendered as a text node — never as markup. */
    text: string;
    /** True when the run sat inside a `<mark>` the service emitted. */
    highlighted: boolean;
}

/**
 * The four spellings of a `<mark>` delimiter a IIIF Content Search service is
 * known to emit. Content Search responses are JSON, so a service that means to
 * highlight a term writes either the tag itself or its entity-encoded form;
 * both are common in the wild and both were honoured before.
 *
 * Case-sensitive on purpose: anything this pattern does not match is excerpt
 * text, and excerpt text is rendered literally.
 */
const MARK_DELIMITER = /<mark>|<\/mark>|&lt;mark&gt;|&lt;\/mark&gt;/g;

const OPENING = new Set(['<mark>', '&lt;mark&gt;']);

/**
 * The five entities every HTML escaper emits. Decoded **unconditionally**, and
 * **after** the split on mark delimiters.
 *
 * Both spellings of the delimiter say the same thing about the excerpt: it is
 * an HTML fragment. A service that escapes its whole excerpt writes
 * `&lt;mark&gt;` around `AT&amp;T`; a service that writes a literal `<mark>` is
 * writing a fragment too, and inside a fragment `&amp;` still means `&`. So
 * decoding is the right reading of both, and there is no case to special-case.
 *
 * It is safe precisely because the result is a text node. Decoding cannot
 * conjure markup: `&lt;script&gt;` becomes the four visible characters
 * `<scr`… and never an element. The delimiters are already consumed by the time
 * we get here, so a decoded `<mark>` cannot become a highlight either.
 *
 * `&amp;` is decoded **last** so exactly one level comes off: `&amp;lt;mark&amp;gt;`
 * yields the literal text `&lt;mark&gt;`, not `<mark>`.
 */
const decodeEntities = (run: string): string =>
    run
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');

/**
 * Split a search excerpt into highlighted and unhighlighted runs of **plain
 * text**.
 *
 * `SearchHit.before`, `match` and `after` are plain text by contract, so the
 * search panel cannot hand them to an HTML sink — a hostile or compromised
 * search service would be executing script in the host page. This is the whole
 * of the processing applied to them: the delimiters above are consumed, the
 * five basic entities are decoded in each run, and every other byte is carried
 * through untouched to a text node.
 *
 * Pure and DOM-free. An unclosed mark highlights to the end of the string.
 * Marks do not nest: no depth is tracked, so any close ends the highlight and a
 * close with nothing open is simply a no-op that leaves the run unhighlighted.
 * Empty runs are never emitted, so the empty string yields an empty array.
 */
export function segmentHighlights(text: string): HighlightSegment[] {
    const segments: HighlightSegment[] = [];
    if (!text) return segments;

    let cursor = 0;
    let highlighted = false;

    const push = (run: string) => {
        if (run) segments.push({ text: decodeEntities(run), highlighted });
    };

    MARK_DELIMITER.lastIndex = 0;
    let delimiter: RegExpExecArray | null;
    while ((delimiter = MARK_DELIMITER.exec(text)) !== null) {
        push(text.slice(cursor, delimiter.index));
        cursor = delimiter.index + delimiter[0].length;
        highlighted = OPENING.has(delimiter[0]);
    }
    push(text.slice(cursor));

    return segments;
}
