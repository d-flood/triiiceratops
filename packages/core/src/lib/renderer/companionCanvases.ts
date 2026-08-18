/**
 * A claimed canvas's `placeholderCanvas` and `accompanyingCanvas`, resolved as
 * the Canvases they are.
 *
 * These are ordinary Presentation 3 properties whose value is a Canvas, so they
 * go through {@link toPlannerCanvas} exactly like every other canvas in the
 * manifest. That is the whole design: the tile pyramid, the size ladder, Choice
 * bodies, region-targeted placements, both id spellings, residency, and
 * projection all apply to a companion because nothing here reimplements any of
 * them (ADR 0017; SPEC §Rendering).
 *
 * Pure, like the rest of the renderer's planning modules. Degradations are
 * returned as {@link CompanionCanvases.warnings} rather than logged, so this
 * stays callable from a `$derived` and the host decides when to say each one
 * once — the same division `ScenePlan.unresolvedThumbnails` already uses.
 */

import { toPlannerCanvas } from './canvasDescriptors';
import type { PlannerCanvas, PlannerImage } from './types';
import { getDeclaredCanvasDimensions } from '../utils/resolveCanvasImage';

import type { CompanionPhase } from '../state/viewer.svelte';

type SelectedChoiceLookup = (canvasId: string) => string | undefined;

/** The two Presentation 3 properties a companion can arrive under. */
const COMPANION_PROPERTIES = {
    placeholder: 'placeholderCanvas',
    accompanying: 'accompanyingCanvas',
} as const;

/**
 * One claimed canvas's companions, resolved once.
 *
 * **The phase selects between these; it never rebuilds them.** Pressing play is
 * a choice between two values already in hand, not a re-plan (user story 29),
 * which is why both companions are resolved together and the phase appears
 * nowhere in this file except in {@link withCompanion}'s signature.
 */
export interface CompanionCanvases {
    /**
     * The rect the claimed canvas takes, **decided once and never by the
     * phase**: its own declared dimensions, else its accompanying canvas's,
     * else its placeholder's.
     *
     * Only a companion that resolved to something requestable donates a rect. A
     * companion the reader will never see must not reflow the manifest around
     * itself, so a broken one costs the canvas its picture and nothing else
     * (user story 23).
     *
     * The accompanying canvas is preferred because it is the permanent
     * companion, and the phase is excluded because a 640×360 poster giving way
     * to a 772×998 score must not reflow the manifest the instant playback
     * starts (user story 10).
     *
     * `null` where nothing declares any, which is the planner's existing signal
     * to place the canvas from the median of its siblings.
     */
    width: number | null;
    height: number | null;
    /**
     * Each companion's placed images, already transformed into the rect above —
     * `null` where the canvas has no such companion, or where the one it has
     * resolved to nothing requestable.
     */
    placeholder: PlannerImage[] | null;
    accompanying: PlannerImage[] | null;
    /**
     * Developer-facing degradations, for the host to report once per canvas.
     * Empty in every healthy case, including the ordinary one of a canvas that
     * carries only one of the two companions.
     */
    warnings: string[];
}

/**
 * The companion Canvas under one of the two properties, or `null`.
 *
 * A value that is not an object, or that carries no annotations to paint — no
 * `items`, an empty `items`, or `items` holding nothing but empty
 * AnnotationPages — is **absent** rather than broken: there is nothing a
 * publisher meant by it that could have been painted, so it earns no warning
 * and donates no geometry.
 */
function companionCanvasJson(canvas: unknown, property: string): unknown {
    const raw = (canvas as Record<string, unknown> | null | undefined)?.[
        property
    ];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const pages = (raw as { items?: unknown }).items;
    if (!Array.isArray(pages)) return null;
    const carriesAnnotations = pages.some((page) => {
        const annotations = (page as { items?: unknown } | null | undefined)
            ?.items;
        return Array.isArray(annotations) && annotations.length > 0;
    });
    return carriesAnnotations ? raw : null;
}

/**
 * A companion's placements, moved into the claimed canvas's rect.
 *
 * Placements are normalized by their own canvas's width on **both** axes
 * (see {@link PlannerImage}), so a companion whose aspect matches the rect
 * transfers verbatim and one that does not is scaled by a single factor and
 * centred — fitted within, aspect preserved, never stretched. Both fall out of
 * the same arithmetic: an equal aspect gives a scale of exactly 1 and offsets
 * of exactly 0.
 *
 * A companion that declares no dimensions of its own is square, not unknown:
 * {@link toPlannerCanvas} normalized its placements against a 1000×1000
 * fallback, so its effective aspect is exactly 1:1 and fitting it as such is
 * what keeps a `height: 1` poster from spilling 32× out of a 1280×40 rect.
 *
 * Verbatim only where the RECT has no shape yet, which is the one case with
 * nothing to fit within.
 */
function fitWithin(
    images: PlannerImage[],
    rect: { width: number | null; height: number | null },
    companion: { width: number; height: number } | null,
): PlannerImage[] {
    if (rect.width === null || rect.height === null) return images;

    const rectAspect = rect.height / rect.width;
    const { width, height } = companion ?? { width: 1, height: 1 };
    const companionAspect = height / width;
    if (!Number.isFinite(rectAspect) || !Number.isFinite(companionAspect)) {
        return images;
    }

    const scale = Math.min(1, rectAspect / companionAspect);
    const offsetX = (1 - scale) / 2;
    const offsetY = (rectAspect - scale * companionAspect) / 2;

    return images.map((image) => ({
        ...image,
        x: offsetX + image.x * scale,
        y: offsetY + image.y * scale,
        width: image.width * scale,
        height: image.height * scale,
    }));
}

/**
 * A claimed canvas's companions, or `null` where it has neither and there is
 * nothing to say about it.
 *
 * `base` is the descriptor {@link toPlannerCanvas} already built for the claimed
 * canvas itself, which is what decides the two cases this refuses:
 *
 * - a canvas that **paints images of its own** is skipped entirely and warns. It
 *   is a composite canvas whose own images already paint, and a companion under
 *   them would be invisible at best;
 * - a companion that resolves to nothing requestable — no service, no id, not an
 *   image — paints nothing and warns. The claimed canvas keeps the treatment it
 *   would otherwise have had, so a broken companion costs a picture rather than
 *   the canvas (user story 23).
 */
export function resolveCompanionCanvases(
    canvas: unknown,
    base: PlannerCanvas,
    getSelectedChoice?: SelectedChoiceLookup,
): CompanionCanvases | null {
    const placeholderJson = companionCanvasJson(
        canvas,
        COMPANION_PROPERTIES.placeholder,
    );
    const accompanyingJson = companionCanvasJson(
        canvas,
        COMPANION_PROPERTIES.accompanying,
    );
    if (!placeholderJson && !accompanyingJson) return null;

    if (base.images.length > 0) {
        return {
            width: base.width,
            height: base.height,
            placeholder: null,
            accompanying: null,
            warnings: [
                `canvas ${base.id} paints images of its own; its companion canvas will not be painted under them`,
            ],
        };
    }

    const warnings: string[] = [];

    /** A companion's own images, or `null` where it resolved to nothing. */
    function resolvedImages(
        json: unknown,
        property: string,
    ): PlannerImage[] | null {
        if (!json) return null;
        const resolved = toPlannerCanvas(json, getSelectedChoice);
        if (!resolved || resolved.images.length === 0) {
            warnings.push(
                `the ${property} of canvas ${base.id} resolved to nothing requestable; it will not be painted`,
            );
            return null;
        }
        return resolved.images;
    }

    const placeholderImages = resolvedImages(
        placeholderJson,
        COMPANION_PROPERTIES.placeholder,
    );
    const accompanyingImages = resolvedImages(
        accompanyingJson,
        COMPANION_PROPERTIES.accompanying,
    );

    // Resolution comes first because only a companion that resolved to
    // something requestable donates dimensions: a duration-only canvas whose
    // accompanying canvas paints a Video body must not be reflowed to that
    // canvas's rect for a picture the reader never sees.
    const placeholderDimensions = placeholderImages
        ? getDeclaredCanvasDimensions(placeholderJson)
        : null;
    const accompanyingDimensions = accompanyingImages
        ? getDeclaredCanvasDimensions(accompanyingJson)
        : null;

    // The accompanying canvas first: it is the permanent companion, so
    // preferring it is what keeps the rect the same across the placeholder's
    // handover.
    const declared =
        base.width !== null && base.height !== null
            ? { width: base.width, height: base.height }
            : (accompanyingDimensions ?? placeholderDimensions);
    const rect = {
        width: declared?.width ?? null,
        height: declared?.height ?? null,
    };

    return {
        ...rect,
        placeholder: placeholderImages
            ? fitWithin(placeholderImages, rect, placeholderDimensions)
            : null,
        accompanying: accompanyingImages
            ? fitWithin(accompanyingImages, rect, accompanyingDimensions)
            : null,
        warnings,
    };
}

/**
 * The claimed canvas's descriptor with the phase's companion painted into it.
 *
 * A **selection** over {@link resolveCompanionCanvases}' already-built result,
 * which is the whole of what a phase change costs.
 *
 * The phase that is not painting also names `PlannerCanvas.warmImages`, so that
 * the companion about to be called for is resident before it is called for and
 * the handover has something to paint in the frame it happens (user story 41).
 *
 * Note that the rect comes from the companions and not from the phase, so
 * `'none'` keeps the geometry the painting phases had. A claimant whose canvas
 * carries only a placeholder moves to `'none'` on first play, and reverting the
 * rect there would reflow the page at exactly the moment user story 10 forbids
 * it. A canvas whose claimant has set no phase at all never reaches this
 * function: the claim on its own changes nothing about what core renders
 * (user story 27).
 */
export function withCompanion(
    base: PlannerCanvas,
    companions: CompanionCanvases,
    phase: CompanionPhase,
): PlannerCanvas {
    const images =
        phase === 'placeholder'
            ? companions.placeholder
            : phase === 'accompanying'
              ? companions.accompanying
              : null;

    // The companion the phase is about to name. Only forwards, and only from
    // the placeholder: the accompanying canvas is the permanent companion, so
    // once it is the picture nothing can ever name the placeholder again and
    // warming it would buy a request for a picture no phase can reach.
    const warmImages = phase === 'placeholder' ? companions.accompanying : null;

    return {
        ...base,
        width: companions.width,
        height: companions.height,
        images: images ?? base.images,
        ...(warmImages ? { warmImages } : {}),
    };
}
