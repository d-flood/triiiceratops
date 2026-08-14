/**
 * The eager half of the HLS path: what counts as a stream, and who plays it.
 */

import { describe, expect, it } from 'vitest';

import { hasNativeHlsSupport, isHlsSource } from './hlsLink';
import type { AvSource } from './sources';

function source(partial: Partial<AvSource>): AvSource {
    return {
        url: 'https://example.org/stream.m3u8',
        kind: 'video',
        format: null,
        ...partial,
    };
}

describe('recognizing an HLS source', () => {
    it.each([
        'application/vnd.apple.mpegurl',
        'application/x-mpegURL',
        'audio/mpegurl',
        'application/vnd.apple.mpegurl; charset=utf-8',
    ])('accepts the declared format %s', (format) => {
        expect(isHlsSource(source({ format }))).toBe(true);
    });

    it.each(['video/mp4', 'audio/mpeg', 'application/dash+xml'])(
        'rejects the declared format %s',
        (format) => {
            // A declared format decides on its own: an `.m3u8` URL behind a
            // `video/mp4` format is a manifest error, and guessing past it
            // would attach a player to something that is not a playlist.
            expect(isHlsSource(source({ format }))).toBe(false);
        },
    );

    it('falls back to the extension when a Choice alternative states no format', () => {
        expect(isHlsSource(source({ format: null }))).toBe(true);
    });

    it('reads the extension off the path, not the query', () => {
        expect(
            isHlsSource(
                source({ url: 'https://example.org/v.mp4?list=x.m3u8' }),
            ),
        ).toBe(false);
        expect(
            isHlsSource(source({ url: 'https://example.org/v.m3u8?token=1' })),
        ).toBe(true);
    });
});

describe('native playback', () => {
    function mediaAnswering(answer: string): HTMLMediaElement {
        const media = document.createElement('video');
        media.canPlayType = () => answer as CanPlayTypeResult;
        return media;
    }

    it.each(['maybe', 'probably'])(
        'is used whenever the element answers %s',
        (answer) => {
            expect(hasNativeHlsSupport(mediaAnswering(answer))).toBe(true);
        },
    );

    it('is absent when the element answers with the empty string', () => {
        expect(hasNativeHlsSupport(mediaAnswering(''))).toBe(false);
    });
});
