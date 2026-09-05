/**
 * The untimed transcript panel's behaviour, over a fake fetch.
 *
 * The fetch is injected rather than stubbed globally: what this panel does with
 * the bytes is the whole of its behaviour, and the failure path — a
 * cross-origin file a publisher never set CORS headers on — is as much a
 * required outcome as the success one.
 */

import { describe, expect, it } from 'vitest';

import { createTextTranscriptPanel, type TextTranscriptPort } from './index';

function harness(
    fetchText: (url: string) => Promise<string>,
    label = 'Transcript',
) {
    const container = document.createElement('div');
    document.body.append(container);

    const port: TextTranscriptPort = {
        url: 'https://example.test/volleyball.txt',
        label,
        styles: { install: () => () => {} },
        t: (key) => key,
        fetchText,
    };

    const panel = createTextTranscriptPanel(container, port);
    const body = (): HTMLElement =>
        container.querySelector('[data-testid="av-transcript-text"]')!;
    const paragraphs = (): string[] =>
        [...body().querySelectorAll('p')].map((p) => p.textContent ?? '');

    return { container, panel, body, paragraphs };
}

/** Let the injected fetch's `.then` run. */
const settle = (): Promise<void> => Promise.resolve().then(() => {});

describe('the untimed transcript panel', () => {
    it('says it is loading before the bytes arrive, and marks itself busy', () => {
        const { body } = harness(() => new Promise<string>(() => {}));

        expect(body().getAttribute('aria-busy')).toBe('true');
        expect(body().textContent).toBe('av_transcript_loading');
    });

    it('renders blank-line-separated blocks as paragraphs, unwrapping the lines', async () => {
        const { paragraphs, body } = harness(async () =>
            [
                'The first paragraph, which the',
                'author hard-wrapped at some column.',
                '',
                'The second paragraph.',
            ].join('\n'),
        );
        await settle();

        expect(paragraphs()).toEqual([
            'The first paragraph, which the author hard-wrapped at some column.',
            'The second paragraph.',
        ]);
        expect(body().getAttribute('aria-busy')).toBe('false');
    });

    it('keeps one speaker turn per line where the file has no blank lines', async () => {
        // An interview transcript. Joining these would run every speaker
        // together into one block.
        const { paragraphs } = harness(async () =>
            [
                'INTERVIEWER: Where were you born?',
                'SUBJECT: In Bloomington.',
            ].join('\n'),
        );
        await settle();

        expect(paragraphs()).toEqual([
            'INTERVIEWER: Where were you born?',
            'SUBJECT: In Bloomington.',
        ]);
    });

    it('tolerates CRLF line endings and collapses runs of blank lines', async () => {
        const { paragraphs } = harness(
            async () => 'One.\r\n\r\n\r\n  \r\nTwo.\r\n',
        );
        await settle();

        expect(paragraphs()).toEqual(['One.', 'Two.']);
    });

    it('leaves a link to the file when the fetch fails', async () => {
        const { body } = harness(async () => {
            throw new Error('CORS');
        });
        await settle();

        expect(body().textContent).toContain('av_transcript_failed');
        const link = body().querySelector('a')!;
        expect(link.getAttribute('href')).toBe(
            'https://example.test/volleyball.txt',
        );
        expect(link.getAttribute('rel')).toContain('noreferrer');
        expect(body().getAttribute('aria-busy')).toBe('false');
    });

    it('treats a file that fetched but holds nothing as a failure', async () => {
        const { body } = harness(async () => '   \n\n  ');
        await settle();

        expect(body().textContent).toContain('av_transcript_failed');
        expect(body().querySelector('a')).not.toBeNull();
    });

    it('names the region with the publisher-authored label', async () => {
        const { body } = harness(async () => 'Words.', 'Volleyball transcript');
        await settle();

        expect(body().getAttribute('aria-label')).toBe('Volleyball transcript');
    });

    it('falls back to the generic name where the entry declared none', async () => {
        const { body } = harness(async () => 'Words.', '');
        await settle();

        expect(body().getAttribute('aria-label')).toBe('av_transcript');
    });

    it('writes nothing after destroy, so a late fetch cannot repopulate it', async () => {
        let resolve: ((text: string) => void) | undefined;
        const { container, panel } = harness(
            () =>
                new Promise<string>((settleWith) => {
                    resolve = settleWith;
                }),
        );

        panel.destroy();
        resolve?.('Words that arrived too late.');
        await settle();

        expect(
            container.querySelector('[data-testid="av-transcript"]'),
        ).toBeNull();
        expect(container.textContent).toBe('');
    });
});
