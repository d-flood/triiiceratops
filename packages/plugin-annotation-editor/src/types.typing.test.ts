import { describe, expect, it } from 'vitest';

import type {
    AnnotationEditorConfig,
    AnnotationEditorExtension,
    AnnotationStorageAdapter,
} from './types';
import type { AdapterLoadResult, W3CAnnotation } from './adapters/types';

/**
 * Type-level smoke test for the public annotation-editor surface (ticket 16,
 * F21). It exercises the generics and the widened `W3CAnnotation` at compile
 * time only — the gate is `pnpm check` (svelte-check + tsc), which flags any
 * `@ts-expect-error` below that no longer errors. The single runtime assertion
 * exists so vitest treats this as a real, passing suite.
 */

/** A host body shape a project might use — nothing like `{purpose, value}`. */
interface RatingBody {
    type: 'RatingBody';
    stars: number;
}

/** A fully-typed custom adapter compiles against the contract. */
class RatingAdapter implements AnnotationStorageAdapter<RatingBody> {
    readonly id = 'rating';
    readonly name = 'Rating';

    async load(): Promise<AdapterLoadResult<RatingBody>[]> {
        return [];
    }

    async create(
        _manifestId: string,
        _canvasId: string,
        annotation: W3CAnnotation<RatingBody>,
    ): Promise<W3CAnnotation<RatingBody>> {
        // Body is typed as the host's shape, not `any`.
        const body = annotation.body;
        void body;
        return annotation;
    }

    async update(
        _manifestId: string,
        _canvasId: string,
        annotation: W3CAnnotation<RatingBody>,
    ): Promise<W3CAnnotation<RatingBody>> {
        return annotation;
    }

    async delete(): Promise<void> {}
}

const wellFormed: W3CAnnotation<RatingBody> = {
    id: 'temp-1',
    type: 'Annotation',
    body: { type: 'RatingBody', stars: 4 },
    target: {
        type: 'SpecificResource',
        source: 'https://example.org/canvas/1',
        selector: { type: 'PointSelector', x: 10, y: 20 },
    },
};

/** A typed config threads the body + host-context generics through. */
const config: AnnotationEditorConfig<RatingBody, { projectId: string }> = {
    adapter: new RatingAdapter(),
    extension: {
        // `selectedAnnotation` is `W3CAnnotation<RatingBody>`, not `any`.
        onSelectionChange(annotation, context) {
            void annotation?.body;
            void context.hostContext?.projectId;
            void context.selectedAnnotation;
        },
        beforeSave(annotation) {
            return annotation;
        },
    },
};

// A wrongly-typed extension hook is rejected: `context.hostContext` is
// `{ projectId: string } | null`, so a non-existent field does not exist.
const _badExtension: AnnotationEditorExtension<{ projectId: string }> = {
    getCreateDisabledReason(context) {
        // @ts-expect-error `nope` is not part of the host context.
        return context.hostContext?.nope ?? null;
    },
};

describe('annotation-editor public types', () => {
    it('accepts a well-formed annotation and a typed adapter', async () => {
        const adapter = config.adapter as RatingAdapter;
        const created = await adapter.create('m', 'c', wellFormed);
        expect(created.id).toBe('temp-1');

        // @ts-expect-error `type` must be the literal 'Annotation'.
        const _wrongType: W3CAnnotation = { id: 'x', type: 'Comment', target: { source: 'c' } };

        // @ts-expect-error a body of the wrong shape is rejected for this adapter.
        void adapter.create('m', 'c', { ...wellFormed, body: { type: 'RatingBody' } });

        // @ts-expect-error `id` is required on every annotation.
        const _missingId: W3CAnnotation = { type: 'Annotation', target: { source: 'c' } };

        void _wrongType;
        void _missingId;
        void _badExtension;
    });
});
