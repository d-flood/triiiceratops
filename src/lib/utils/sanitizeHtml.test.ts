// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import {
    escapeHtml,
    hasNativeHtmlSanitizer,
    sanitizeHtml,
    sanitizeHtmlSync,
} from './sanitizeHtml';

type ElementPrototypeWithSetHtml = typeof Element.prototype & {
    setHTML?: (input: string) => void;
};

type WindowWithSanitizer = Window & {
    Sanitizer?: new (...args: never[]) => unknown;
};

describe('sanitizeHtml utilities', () => {
    it('escapes HTML entities for plain-text fallback', () => {
        expect(escapeHtml('<a href="#">Tom & Jerry</a>')).toBe(
            '&lt;a href=&quot;#&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
        );
    });

    it('uses the native Sanitizer API when available', () => {
        class MockSanitizer {}

        const elementPrototype =
            Element.prototype as ElementPrototypeWithSetHtml;
        const browserWindow = window as WindowWithSanitizer;
        const originalSetHTML = elementPrototype.setHTML;
        const originalSanitizer = browserWindow.Sanitizer;

        browserWindow.Sanitizer = MockSanitizer;
        elementPrototype.setHTML = function (input: string) {
            this.innerHTML = input.replace(
                /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
                '',
            );
        };

        expect(hasNativeHtmlSanitizer()).toBe(true);
        expect(sanitizeHtmlSync('<p>safe</p><script>alert(1)</script>')).toBe(
            '<p style="margin: 0 0 0.75rem; margin-bottom: 0;">safe</p>',
        );

        if (originalSetHTML) {
            elementPrototype.setHTML = originalSetHTML;
        } else {
            delete elementPrototype.setHTML;
        }

        if (originalSanitizer) {
            browserWindow.Sanitizer = originalSanitizer;
        } else {
            delete browserWindow.Sanitizer;
        }
    });

    it('falls back to DOMPurify when native sanitization is unavailable', async () => {
        const elementPrototype =
            Element.prototype as ElementPrototypeWithSetHtml;
        const browserWindow = window as WindowWithSanitizer;
        const originalSetHTML = elementPrototype.setHTML;
        const originalSanitizer = browserWindow.Sanitizer;

        delete elementPrototype.setHTML;
        delete browserWindow.Sanitizer;

        await expect(
            sanitizeHtml(
                '<img src=x onerror=alert(1)><p><a href="/x">ok</a></p>',
            ),
        ).resolves.toBe(
            '<img src="x" style="display: inline-block; max-width: 100%; height: auto; vertical-align: middle; border-radius: 0.25rem;"><p style="margin: 0 0 0.75rem; margin-bottom: 0;"><a href="/x" style="color: var(--color-primary); text-decoration: underline; text-underline-offset: 0.2em;">ok</a></p>',
        );

        if (originalSetHTML) {
            elementPrototype.setHTML = originalSetHTML;
        }

        if (originalSanitizer) {
            browserWindow.Sanitizer = originalSanitizer;
        }
    });

    it('escapes on the server when no browser APIs are available', async () => {
        const originalWindow = globalThis.window;

        vi.stubGlobal('window', undefined);

        await expect(sanitizeHtml('<script>alert(1)</script>')).resolves.toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;',
        );

        if (originalWindow) {
            vi.stubGlobal('window', originalWindow);
        } else {
            vi.unstubAllGlobals();
        }
    });
});
