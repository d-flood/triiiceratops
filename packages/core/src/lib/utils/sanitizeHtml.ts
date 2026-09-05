/**
 * IIIF rich text, reconstructed rather than filtered.
 *
 * IIIF permits a deliberately narrow HTML subset — links, paragraphs, images,
 * basic emphasis, `small`, `span`, `sub`, `sup`. That is small enough to serve
 * without a general-purpose sanitizer: the untrusted markup is parsed **inertly**
 * (`DOMParser` with `text/html`, which yields a document with no browsing
 * context, so nothing executes and no subresource loads during the parse), and
 * the result is then rebuilt node by node from the allowlist below.
 *
 * The distinction matters for the safety argument. A filter has to be right
 * about every construct it declines to remove; a reconstruction only has to be
 * right about the handful it agrees to emit. Nothing from the input is ever
 * assigned to an HTML sink, so mutation-XSS — the class of attack that turns on
 * a sanitized string being re-parsed differently the second time — has nowhere
 * to happen. This is what replaced DOMPurify, which cost 29,546 raw bytes and
 * ran with its broad default policy rather than IIIF's list.
 *
 * No `style` attribute is emitted, and none is read from the input.
 * `SanitizedHtml.svelte`'s scoped `.viewer-html` stylesheet already declares
 * every property the old inline-styling pass injected, for every permitted
 * element, so that pass was redundant with the component's CSS — and was the
 * mechanism by which an attacker-supplied `style` survived.
 *
 * A dropped element normally keeps its text, on the grounds that whatever it
 * wrapped was written to be read. {@link RAW_TEXT_ELEMENTS} is the exception:
 * their contents are program source, not prose, and a `<template>`'s children
 * are not `childNodes` at all, so both vanish along with the element.
 */

/**
 * The allowlist, keyed by tag name, valued by the attributes that tag may keep.
 *
 * A `Map` rather than an object literal on purpose: tag names come from
 * untrusted markup, and `<constructor>` or `<__proto__>` would find inherited
 * properties on an object.
 */
const ALLOWED_ELEMENTS = new Map<string, readonly string[]>([
    ['a', ['href', 'title']],
    ['b', []],
    ['br', []],
    ['i', []],
    ['img', ['src', 'alt']],
    ['p', []],
    ['small', []],
    ['span', []],
    ['sub', []],
    ['sup', []],
]);

/**
 * Elements dropped **with** their contents rather than flattened to text.
 *
 * The general rule — drop the tag, keep what it wrapped — assumes the wrapped
 * text was meant for a reader. For these it is source code or out-of-band
 * metadata: the parser hands `<script>alert(1)</script>` back as a text node
 * saying `alert(1)`, and flattening it would paint attacker-chosen strings into
 * publisher-trusted chrome. Nothing is executed either way, so this is spoofing
 * rather than XSS — which is exactly why DOMPurify listed the same tags under
 * `FORBID_CONTENTS`.
 *
 * `template` is here for a second reason as well: its children live on
 * `.content`, not `childNodes`, so a walk of the tree never sees them.
 */
const RAW_TEXT_ELEMENTS = new Set([
    'iframe',
    'noembed',
    'noframes',
    'noscript',
    'plaintext',
    'script',
    'style',
    'template',
    'textarea',
    'title',
    'xmp',
]);

const URL_ATTRIBUTES = new Set(['href', 'src']);

/**
 * `mailto:` joins IIIF's `http:`/`https:` because a `mailto:` link in a
 * publisher's required statement is ordinary, legitimate content and carries no
 * script capability. Everything with any other scheme is refused, including
 * `data:` (which can carry `text/html`) and `javascript:`.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Is this URL safe to put in an `href` or `src`?
 *
 * Shared by the rich-text renderer and by every hand-written anchor in the
 * viewer that takes its URL from a manifest — an allowlisted `<a>` rebuilt from
 * untrusted markup and an `<a href={body.value}>` bound straight from an
 * annotation body are the same hazard, and they get the same answer.
 *
 * A URL with no scheme (`/page`, `page`, `#frag`, `?q=1`, and the
 * protocol-relative `//host/path`) inherits the page's own scheme and is
 * allowed. A URL that names a scheme must name one of {@link SAFE_SCHEMES}.
 *
 * Two consequences worth stating, since both look like holes and neither is.
 * Protocol-relative has more spellings than `//host/path`: for special schemes
 * the URL parser also treats `\\host/x` and `/\host/x` as authority-relative, so
 * those are accepted too — the same deliberate decision as `//host`, which
 * cannot reach a scheme this function has refused. And `https://evil@good.com/`
 * is accepted because its scheme is `https:`; userinfo that misleads a reader
 * about the host is a display concern, not a scheme one.
 */
export function isSafeUrl(value: string | null | undefined): boolean {
    if (!value) return false;

    // Match the URL parser before testing the scheme: browsers strip ASCII tab,
    // LF and CR from anywhere in a URL and skip leading C0 control characters
    // and space, so `java\nscript:alert(1)` and `javascript:alert(1)` are
    // both `javascript:` by the time they are navigated.
    const normalized = value
        .replace(/[\t\n\r]/g, '')
        // eslint-disable-next-line no-control-regex
        .replace(/^[\u0000-\u0020]+/, '');
    if (!normalized) return false;

    const scheme = SCHEME_PATTERN.exec(normalized)?.[0];
    if (!scheme) return true;

    return SAFE_SCHEMES.has(scheme.toLowerCase());
}

/**
 * Depth beyond which a subtree is flattened to its text.
 *
 * Rebuilding is recursive, and nesting in the input is attacker-controlled, so
 * without a bound a pathological manifest could exhaust the stack. Real IIIF
 * rich text nests a handful of levels; 100 is far past anything legitimate and
 * degrades to readable text rather than throwing.
 */
const MAX_DEPTH = 100;

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * The text of a subtree, minus the source text of {@link RAW_TEXT_ELEMENTS}.
 *
 * `textContent` would be the obvious call, but it happily returns a nested
 * `<script>`'s body, which is precisely what the rebuild refuses to surface.
 * The walk is iterative because this is the depth-limit escape hatch, and a
 * recursive one would hit the stack this bound exists to protect.
 */
function readableText(root: Element): string {
    const parts: string[] = [];
    const stack: Node[] = Array.from(root.childNodes).reverse();

    while (stack.length > 0) {
        const node = stack.pop() as Node;

        if (node.nodeType === TEXT_NODE) {
            parts.push(node.nodeValue ?? '');
            continue;
        }
        if (node.nodeType !== ELEMENT_NODE) continue;
        if (RAW_TEXT_ELEMENTS.has((node as Element).localName)) continue;

        const children = node.childNodes;
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i]);
        }
    }

    return parts.join('');
}

function rebuildChildren(source: Node, target: Node, depth: number): void {
    for (const child of Array.from(source.childNodes)) {
        rebuildNode(child, target, depth);
    }
}

function rebuildNode(node: Node, target: Node, depth: number): void {
    if (node.nodeType === TEXT_NODE) {
        target.appendChild(document.createTextNode(node.nodeValue ?? ''));
        return;
    }

    // Comments, CDATA, processing instructions and doctypes carry no content a
    // reader wants and are simply not reproduced.
    if (node.nodeType !== ELEMENT_NODE) return;

    const element = node as Element;

    // `localName` rather than `tagName`: it is already lowercase for HTML and,
    // unlike `nodeName`, is not something a foreign-content element can dress up.
    if (RAW_TEXT_ELEMENTS.has(element.localName)) return;

    if (depth >= MAX_DEPTH) {
        target.appendChild(document.createTextNode(readableText(element)));
        return;
    }

    const allowedAttributes = ALLOWED_ELEMENTS.get(element.localName);

    if (!allowedAttributes) {
        // A disallowed element is dropped, but what it wrapped was written to be
        // read, so keep walking into it. Unknown markup degrades to its text
        // instead of vanishing.
        rebuildChildren(element, target, depth + 1);
        return;
    }

    const rebuilt = document.createElement(element.localName);

    for (const name of allowedAttributes) {
        const value = element.getAttribute(name);
        if (value === null) continue;
        if (URL_ATTRIBUTES.has(name) && !isSafeUrl(value)) continue;
        rebuilt.setAttribute(name, value);
    }

    rebuildChildren(element, rebuilt, depth + 1);
    target.appendChild(rebuilt);
}

/**
 * Render untrusted IIIF rich text as a fragment of freshly constructed nodes.
 *
 * Synchronous and pure: the same input always yields an equivalent fragment, and
 * nothing is fetched, executed, or cached along the way. Empty and malformed
 * input yield an empty fragment rather than throwing.
 */
export function renderIiifRichText(html: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (!html) return fragment;

    let body: HTMLElement | null = null;
    try {
        body = new DOMParser().parseFromString(html, 'text/html').body;
    } catch {
        // A parser that refuses the input yields nothing to render, which is the
        // safe answer; there is no fallback that could be safer.
        return fragment;
    }

    if (body) {
        rebuildChildren(body, fragment, 0);
    }

    return fragment;
}
