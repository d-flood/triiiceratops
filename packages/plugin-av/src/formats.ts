/**
 * Which alternative of a Choice this browser plays: a Choice over time-based
 * media is a set of renditions of one work, and only some of them decode here.
 */

import { canPlayHls, isHlsSource } from './hlsLink';
import type { AvMediaKind, AvSource } from './sources';

/** Whether this browser will attempt a source at all. */
export type PlayabilityProbe = (source: AvSource) => boolean;

/**
 * The alternative to attach, or `null` when the annotation places none.
 *
 * **Playability decides, not order**, and that is a deliberate departure from
 * the first-item-wins rule core follows for a Choice of images. Every image
 * alternative renders, so first-wins is a preference; a media alternative the
 * engine cannot decode renders nothing at all, so first-wins would hand a
 * reader on Chrome the curator's ProRes master and call the canvas unplayable
 * while an MP4 of the same work sat one entry below it. `canPlayType` is the
 * only thing that can tell those two cases apart.
 *
 * An explicit selection wins outright, playable or not: the host asked for that
 * rendition, and answering with a different one would make
 * `selectChoice` a suggestion. It may well surface the "can't play"
 * treatment, which is the honest report of what was asked for.
 *
 * With nothing playable and nothing selected the FIRST alternative comes back
 * rather than `null`. Attaching it is what produces the "can't play" treatment:
 * the media element's own `error` is the stage's existing path to it, so a
 * browser that refuses every rendition says so through the same seam a dead URL
 * takes.
 */
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
