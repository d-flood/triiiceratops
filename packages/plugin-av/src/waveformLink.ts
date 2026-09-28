/** `format` never consulted; profile or the word "waveform" decides. */

import { asArray, asRecord, labelStrings } from './iiifJson';
import type { Peaks } from './timeline/peaks';
import { loadTimeline, type TimelineModule } from './timelineLink';

const BBC_WAVEFORM_PROFILE =
    /^https?:\/\/waveform\.prototyping\.bbc\.co\.uk\/?$/;

function saysWaveform(entry: Record<string, unknown>, id: string): boolean {
    if (labelStrings(entry.label).some((text) => /waveform/i.test(text)))
        return true;
    const path = id.split(/[?#]/, 1)[0];
    return /waveform/i.test(path.slice(path.lastIndexOf('/') + 1));
}

/** The URL of this canvas's waveform data, or `null` if it links none. */
export function waveformUrlFor(canvas: unknown): string | null {
    const record = asRecord(canvas);
    if (!record) return null;

    for (const entry of [
        ...asArray(record.seeAlso),
        ...asArray(record.rendering),
    ]) {
        const linked = asRecord(entry);
        const id = linked?.id ?? linked?.['@id'];
        if (!linked || typeof id !== 'string' || id === '') continue;

        const profile = linked.profile;
        if (
            (typeof profile === 'string' &&
                BBC_WAVEFORM_PROFILE.test(profile)) ||
            saysWaveform(linked, id)
        )
            return id;
    }

    return null;
}

/**
 * Load the timeline chunk and resolve this URL's peaks, or `null`.
 *
 * A chunk that will not load is the same non-event as data that will not
 * parse: no waveform, and the lane keeps working — with the ruler it already
 * had, where it has one.
 */
export async function loadPeaks(
    url: string,
): Promise<{ module: TimelineModule; peaks: Peaks } | null> {
    const module = await loadTimeline();
    if (!module) return null;
    try {
        const peaks = await module.fetchPeaks(url);
        return peaks ? { module, peaks } : null;
    } catch {
        return null;
    }
}
