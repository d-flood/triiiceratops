/** `motivation` never inspected; painting annotations cannot arrive here. */

import { parseIiifTime } from 'triiiceratops';

import { asArray, asRecord, stringOrNull } from './iiifJson';

export interface TimedEntry {
    readonly id: string;
    readonly startSeconds: number;
    readonly endSeconds?: number;
    readonly text: string;
}

const PLAIN_TEXT = 'text/plain';

function bodyText(body: unknown): string {
    for (const candidate of asArray(body)) {
        const record = asRecord(candidate);
        if (!record) continue;
        if (record.type !== 'TextualBody') continue;
        const { format, value } = record;
        if (format !== undefined && format !== PLAIN_TEXT) continue;
        const text = stringOrNull(value)?.trim();
        if (text) return text;
    }
    return '';
}

/**
 * The listable timed annotations among `annotations`, earliest first.
 *
 * Sorted by start with manifest order winning a tie, so reading down the list
 * follows the recording and two comments on the same moment stay in the order
 * their publisher wrote them.
 */
export function timedAnnotationsFor(
    annotations: readonly unknown[],
): TimedEntry[] {
    const entries: TimedEntry[] = [];

    for (const [index, annotation] of annotations.entries()) {
        const record = asRecord(annotation);
        if (!record) continue;

        const target = record.target;
        if (typeof target !== 'string') continue;
        const time = parseIiifTime(target);
        if (!time) continue;

        const text = bodyText(record.body);
        if (!text) continue;

        entries.push({
            id: stringOrNull(record.id) ?? `annotation:${index}`,
            startSeconds: time.seconds,
            ...(time.endSeconds === undefined
                ? {}
                : { endSeconds: time.endSeconds }),
            text,
        });
    }

    return entries.sort((a, b) => a.startSeconds - b.startSeconds);
}
