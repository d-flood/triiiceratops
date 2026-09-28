/** Playability decides, not order; explicit selection wins outright. */

import { canPlayHls, isHlsSource } from './hlsLink';
import type { AvMediaKind, AvSource } from './sources';

export type PlayabilityProbe = (source: AvSource) => boolean;

export function selectSource(
    alternatives: readonly AvSource[],
    selectedChoiceId: string | undefined,
    canPlay: PlayabilityProbe,
): AvSource | null {
    if (alternatives.length === 0) return null;

    const selected = selectedChoiceId
        ? alternatives.find((source) => source.url === selectedChoiceId)
        : undefined;
    if (selected) return selected;

    return alternatives.find((source) => canPlay(source)) ?? alternatives[0];
}

/**
 * A probe over real media elements — one per medium, because an `<audio>` and a
 * `<video>` need not answer `canPlayType` alike, and reused because building an
 * element per alternative per canvas is pure cost.
 *
 * A source declaring no `format` is treated as playable. There is nothing to
 * ask the browser about, and IIIF permits a Choice alternative that states only
 * its `type`; refusing it would drop a rendition the engine may well decode,
 * and the element's own `error` still reports it if it cannot.
 */
export function createPlayabilityProbe(): PlayabilityProbe {
    const probes = new Map<AvMediaKind, HTMLMediaElement>();
    const probeFor = (kind: AvMediaKind): HTMLMediaElement => {
        let probe = probes.get(kind);
        if (!probe) {
            probe = document.createElement(
                kind === 'audio' ? 'audio' : 'video',
            );
            probes.set(kind, probe);
        }
        return probe;
    };

    return (source) => {
        const probe = probeFor(source.kind);
        // HLS has its own gate: native decoding, or the Media Source
        // Extensions hls.js needs to build a pipeline of its own.
        if (isHlsSource(source)) return canPlayHls(probe);
        if (!source.format) return true;
        return probe.canPlayType(source.format) !== '';
    };
}
