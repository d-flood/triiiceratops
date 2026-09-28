export type DragTarget = {
    readonly id: string;
    readonly canvasId: string;
    readonly manifestId: string;
};

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
