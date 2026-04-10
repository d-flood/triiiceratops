type SetHtmlElement = HTMLElement & {
    setHTML?: (input: string) => void;
};

type BrowserWithSanitizer = Window & {
    Sanitizer?: new (...args: never[]) => unknown;
};

type DOMPurifyInstance = {
    sanitize: (input: string) => string;
};

let domPurifyPromise: Promise<DOMPurifyInstance> | null = null;

function appendInlineStyles(element: Element, styles: string): void {
    const existing = element.getAttribute('style');
    const normalizedExisting = existing?.trim();

    element.setAttribute(
        'style',
        normalizedExisting
            ? `${normalizedExisting}${normalizedExisting.endsWith(';') ? ' ' : '; '}${styles}`
            : styles,
    );
}

function normalizeRichTextHtml(html: string): string {
    if (!html || typeof document === 'undefined') return html;

    const container = document.createElement('div');
    container.innerHTML = html;

    for (const anchor of container.querySelectorAll('a')) {
        appendInlineStyles(
            anchor,
            'color: var(--color-primary); text-decoration: underline; text-underline-offset: 0.2em;',
        );
    }

    for (const paragraph of container.querySelectorAll('p')) {
        appendInlineStyles(paragraph, 'margin: 0 0 0.75rem;');
    }

    for (const image of container.querySelectorAll('img')) {
        appendInlineStyles(
            image,
            'display: inline-block; max-width: 100%; height: auto; vertical-align: middle; border-radius: 0.25rem;',
        );
    }

    for (const small of container.querySelectorAll('small')) {
        appendInlineStyles(small, 'font-size: 0.875em; opacity: 0.8;');
    }

    for (const bold of container.querySelectorAll('b')) {
        appendInlineStyles(bold, 'font-weight: 700;');
    }

    for (const italic of container.querySelectorAll('i')) {
        appendInlineStyles(italic, 'font-style: italic;');
    }

    for (const sub of container.querySelectorAll('sub')) {
        appendInlineStyles(
            sub,
            'font-size: 0.75em; line-height: 0; position: relative; vertical-align: baseline; bottom: -0.2em;',
        );
    }

    for (const sup of container.querySelectorAll('sup')) {
        appendInlineStyles(
            sup,
            'font-size: 0.75em; line-height: 0; position: relative; vertical-align: baseline; top: -0.45em;',
        );
    }

    const lastParagraph = container.querySelector('p:last-child');
    if (lastParagraph) {
        appendInlineStyles(lastParagraph, 'margin-bottom: 0;');
    }

    return container.innerHTML;
}

export function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function hasNativeHtmlSanitizer(): boolean {
    if (typeof window === 'undefined') return false;

    const browserWindow = window as BrowserWithSanitizer;
    return (
        typeof browserWindow.Sanitizer !== 'undefined' &&
        typeof Element !== 'undefined' &&
        typeof (Element.prototype as SetHtmlElement).setHTML === 'function'
    );
}

function sanitizeWithNative(html: string): string {
    const container = document.createElement('div') as SetHtmlElement;
    container.setHTML?.(html);
    return normalizeRichTextHtml(container.innerHTML);
}

async function loadDOMPurify() {
    if (typeof window === 'undefined') {
        throw new Error('DOMPurify can only be loaded in the browser');
    }

    domPurifyPromise ??= import('dompurify').then(
        ({ default: imported }) => imported(window) as DOMPurifyInstance,
    );

    return domPurifyPromise;
}

export function sanitizeHtmlSync(html: string): string | null {
    if (!html) return '';
    if (!hasNativeHtmlSanitizer()) return null;
    return sanitizeWithNative(html);
}

export async function sanitizeHtml(html: string): Promise<string> {
    if (!html) return '';

    const nativeSanitized = sanitizeHtmlSync(html);
    if (nativeSanitized !== null) {
        return nativeSanitized;
    }

    if (typeof window === 'undefined') {
        return escapeHtml(html);
    }

    const domPurify = await loadDOMPurify();
    return normalizeRichTextHtml(domPurify.sanitize(html));
}
