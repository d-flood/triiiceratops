/**
 * The eager half of the HLS path: what counts as a stream, and who plays it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { canPlayHls, hasNativeHlsSupport, isHlsSource } from './hlsLink';
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

describe('the Media Source gate hls.js would apply', () => {
    const media = (() => {
        const element = document.createElement('video');
        element.canPlayType = () => '' as CanPlayTypeResult;
        return element;
    })();

    afterEach(() => vi.unstubAllGlobals());

    /** A `MediaSource` accepting exactly the codec strings listed. */
    function supporting(...accepted: string[]): {
        isTypeSupported: (type: string) => boolean;
    } {
        return { isTypeSupported: (type) => accepted.includes(type) };
    }

    it.each([
        ['avc1', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'],
        ['av1', 'video/mp4;codecs=av01.0.01M.08'],
        ['vp9', 'video/mp4;codecs=vp09.00.50.08'],
        ['aac audio only', 'audio/mp4;codecs=mp4a.40.2'],
        ['flac audio only', 'audio/mp4;codecs=fLaC'],
    ])('opens on %s alone, as hls.js does', (_label, type) => {
        vi.stubGlobal('MediaSource', supporting(type));

        expect(canPlayHls(media)).toBe(true);
    });

    it('reads the WebKit-prefixed global where that is the only one', () => {
        vi.stubGlobal('MediaSource', undefined);
        vi.stubGlobal(
            'WebKitMediaSource',
            supporting('video/mp4;codecs=avc1.42E01E,mp4a.40.2'),
        );

        expect(canPlayHls(media)).toBe(true);
    });

    it('prefers a managed source, which hls.js resolves first', () => {
        vi.stubGlobal(
            'ManagedMediaSource',
            supporting('audio/mp4;codecs=fLaC'),
        );
        vi.stubGlobal('MediaSource', supporting());

        expect(canPlayHls(media)).toBe(true);
    });

    it('is shut when no container is decodable', () => {
        vi.stubGlobal(
            'MediaSource',
            supporting('video/mp4;codecs=hev1.1.6.L93.B0'),
        );

        expect(canPlayHls(media)).toBe(false);
    });
});
