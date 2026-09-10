/**
 * The drag half of cookbook recipe 0599: a content state, as the JSON string a
 * drag source hands a destination on `text/plain`.
 */

/** The view a drag source offers, by the ids this site publishes it at. */
export type DragTarget = {
    /** The content state's own id, which is neither the canvas nor the manifest. */
    readonly id: string;
    readonly canvasId: string;
    readonly manifestId: string;
};

/**
 * Recipe 0599's content state for `target`, with every id made absolute against
 * `base`.
 *
 * This site publishes its sample material at root-relative paths, and a content
 * state is only worth dragging into another viewer if the resources it names
 * can be dereferenced from outside this page.
 */
export function dragContentState(target: DragTarget, base: string): string {
    const absolute = (id: string) => new URL(id, base).href;
    const manifestId = absolute(target.manifestId);

    return JSON.stringify({
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: absolute(target.id),
        type: 'Annotation',
        motivation: ['contentState'],
        target: {
            id: absolute(target.canvasId),
            type: 'Canvas',
            partOf: [{ id: manifestId, type: 'Manifest' }],
        },
    });
}
