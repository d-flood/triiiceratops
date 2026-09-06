import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import { getCanvasChoices } from '../utils/iiifParsing';
import { syntheticManifestCorpus } from '../test/fixtures/syntheticManifests';
import { getCanvasLabel } from '../utils/canvasLabels';
import { isCollection, parseCollection } from '../utils/collections';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';
import { getCanvasId, getResourceId } from '../utils/iiifIds';
import { getPaintingAnnotations } from '../utils/iiifParsing';
import {
    resolveAllCanvasImages,
    toImageSource,
} from '../utils/resolveCanvasImage';
import type { StructureNode } from '../utils/structures';

/**
 * The behavioral baseline — `remove-manifesto` ticket 04.
 *
 * This file is the epic's **oracle**. `manifesto.js` is the only description of
 * current behavior that exists, and it only exists until ticket 09. Everything
 * from ticket 05 onward is verified by "the golden did not move", so a baseline
 * captured through the wrong seam, or captured unreadably, silently invalidates
 * six tickets of parity argument.
 *
 * **The seam is the whole point.** Every observation below is made on a
 * `ViewerState` loaded with raw manifest JSON through `setManifestData`, backed
 * by the real `manifestsState` cache, with no mocks anywhere. Nothing here
 * constructs a canvas: every canvas is one the viewer handed out. That is what
 * lets this file survive tickets 06, 07 and 09 *without edits* while the canvas
 * representation changes underneath it — raw JSON goes in, viewer behavior comes
 * out, and whether a third-party library or first-party enumerators sit in
 * between is invisible here.
 *
 * Two tiers, because a naive snapshot of a 67-fixture corpus (59 `.json` files
 * plus 8 synthetics) is unreviewable — and an unreviewable golden gets accepted
 * rather than assessed, at which point it has stopped being an oracle.
 *
 * - **Broad tier** (`__golden__/broad-tier.txt`) — one six-field summary record
 *   per manifest, over the whole corpus. This catches the dominant failure mode
 *   of the epic, the silent empty result: a regression reads as
 *   `withPainting=154` becoming `withPainting=0`. **The six fields are a
 *   contract** (SPEC, "The behavioral baseline"): adding one churns every prior
 *   golden and destroys historical comparability, so it is a deliberate,
 *   separately-reviewed re-baseline rather than a ticket 05-10 side effect.
 * - **Deep tier** (`__golden__/deep-tier.txt`) — full per-canvas detail on 20
 *   curated manifests, for the cases where the correctness of a *value* matters
 *   rather than its presence. The deep tier's per-canvas fields are NOT a
 *   contract, which is why `paintingAnnotations=` was added here and not to the
 *   broad record.
 *
 * Fixtures are read from disk with `node:fs` rather than `import.meta.glob`, for
 * the reasons given at the head of `../test/fixtures/corpus.smoke.test.ts`: the
 * glob transforms 59 JSON files into ES modules on every cold run, and hands
 * back a PARSED object shared across the module graph that registration then
 * mutates (the library writes `__jsonld` back-references onto whatever JSON it
 * is given). The synthetic fixtures are shared module-level objects for the same
 * reason, and both tiers register every fixture, so {@link load} hands
 * `setManifestData` a `structuredClone` — otherwise the second tier observes a
 * manifest the first tier has already been written back onto.
 *
 * **This file was re-baselined once**, deliberately and under separate review,
 * after tickets 05, 06 and 07 landed. Five golden records moved and each is
 * explained in the goldens' own headers. What the headers no longer do is assert
 * a defect the data beneath them contradicts: a fixed defect is rewritten as a
 * record of its fix, naming the ticket, and a defect no corpus fixture exhibits
 * is described as unexercised rather than as frozen.
 */

const CORPUS_DIR = join(import.meta.dirname, '../test/fixtures/manifests');
const GOLDEN_DIR = join(import.meta.dirname, '__golden__');

/**
 * Sort by UTF-16 code unit, never `localeCompare`. A golden's whole value is
 * that a re-run is byte-identical, and `localeCompare` is ICU-dependent — the
 * corpus carries Arabic, Swedish and em-dashed names that collate differently
 * between Node builds.
 */
function byCodeUnit(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every `.json` under `./manifests/`, as a corpus-relative path — the whole
 * tree, with nothing skipped. The `av/` hold-out and the reason it ended are
 * explained in `../test/fixtures/corpus.smoke.test.ts`.
 */
function corpusPaths(dir = CORPUS_DIR, prefix = ''): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const name = `${prefix}${entry.name}`;
            if (entry.isDirectory()) {
                return corpusPaths(join(dir, entry.name), `${name}/`);
            }
            return entry.name.endsWith('.json') ? [name] : [];
        })
        .sort(byCodeUnit);
}

interface Fixture {
    /** The fixture's path in the corpus, or `synthetic/<case>`. Golden key. */
    name: string;
    /** Manifest id it is registered under — the id a consumer would pass. */
    id: string;
    json: any;
    /**
     * Collections have members, not canvases. They get their own golden section
     * rather than a six-field record they cannot honestly fill; the manifest
     * path used to throw on them and, since ticket 07, degrades instead.
     */
    isCollection: boolean;
}

const fixtures: Fixture[] = [
    ...corpusPaths().map((path) => {
        const json = JSON.parse(
            readFileSync(join(CORPUS_DIR, path), 'utf8'),
        ) as any;
        return {
            name: path,
            id:
                json?.id ||
                json?.['@id'] ||
                `http://example.org/corpus/${path}`,
            json,
            isCollection: isCollection(json),
        };
    }),
    ...syntheticManifestCorpus.map((fixture) => ({
        name: `synthetic/${fixture.name}`,
        id: fixture.id,
        json: fixture.json,
        isCollection: false,
    })),
].sort((a, b) => byCodeUnit(a.name, b.name));

const fixturesByName = new Map(fixtures.map((f) => [f.name, f]));

/**
 * The deep tier's curated manifests, each with the reason it earns per-canvas
 * detail. Curated for the cases the SPEC names — Choice selection, composite
 * canvases, level-0 URL construction, v2 ranges in all three spellings,
 * right-to-left, multi-sequence v2 — plus the one deliberate behavior change in
 * the epic (ticket 03's every-annotation-page read), which must be IN the
 * baseline rather than arrive as a later delta.
 *
 * **Re-curated once**, as a swap rather than an expansion. 04's review found
 * that the original 20 gave this tier ZERO variance on two of the three
 * manifest scalars it records: `startCanvasId=<none>` and
 * `viewingMode=individuals` on all 20. "The golden did not move" therefore
 * proved almost nothing about start canvas or viewing behavior — the surfaces
 * ticket 05 rewrites. Three fixtures were added to give those scalars a value
 * that can move, and three removed:
 *
 * - `cookbook/0202-start-canvas.json` — the corpus's ONLY start-canvas fixture.
 * - `synthetic/v2 viewingHint and viewingDirection at two levels` — built for
 *   exactly these scalars and absent from the only tier that records them.
 * - `cookbook/0011-book-3-behavior-manifest-continuous.json` — the only
 *   `viewingMode` other than `individuals`/`paged` in the corpus.
 * - dropped `cookbook/0117-add-image-thumbnail.json`: curated as "explicit
 *   canvas thumbnail", it has no canvas-level `thumbnail` at all (it sits on the
 *   image resource), so it never exercised the branch it was chosen for.
 * - dropped `demo/iiif-harvardartmuseums-299843.json`: generic v2, and every
 *   branch it reaches is reached by a smaller fixture here.
 * - dropped `vendored/4.json`: same category as 0117. Its reason was "v2
 *   sequence with no @id", and this tier never records a sequence id — the
 *   property is pinned by its BROAD record (`canvases=1 sequences=1`), which a
 *   parser keying sequences by id would break. Its per-canvas detail added only
 *   a direct-image thumbnail with no image service, which
 *   `vendored/lunchroom-manners.json` and the v3 split-pages synthetic both
 *   carry. This third drop is what keeps the list inside the SPEC's 15-20
 *   budget after three additions; without it the re-curation would be an
 *   expansion, which the budget exists to prevent.
 *
 * Kept at 20. If it grows past a few thousand lines, cut manifests, not fields:
 * a golden nobody reads is not an oracle.
 */
const DEEP_TIER: Array<[name: string, why: string]> = [
    [
        'cookbook/0010-book-2-viewing-direction-manifest-rtl.json',
        'v3 right-to-left at the manifest root',
    ],
    [
        'cookbook/0011-book-3-behavior-manifest-continuous.json',
        'viewingMode=continuous — the only value in the corpus that is neither individuals nor paged',
    ],
    [
        'cookbook/0027-alternative-page-order.json',
        'v3 ranges with behavior:sequence — the structure-derived multi-sequence path',
    ],
    ['cookbook/0033-choice.json', 'v3 Choice painting body — choice selection'],
    [
        'cookbook/0036-composition-from-multiple-images.json',
        'composite canvas — several painting annotations, each positioned',
    ],
    [
        'cookbook/0202-start-canvas.json',
        "the corpus's only `start` — the sole fixture that can make startCanvasId anything but <none>",
    ],
    [
        'cookbook/0283-missing-image.json',
        'a canvas with NO painting annotation — the degradation case',
    ],
    [
        'vendored/audio.json',
        'IxIF mediaSequences/elements, and `sequences` as a bare object',
    ],
    [
        'vendored/auth-clinical.json',
        'level-0 image service with a sizes block — level-0 URL construction',
    ],
    [
        'vendored/illustrationsofchina.json',
        'multi-sequence v2 — 4 sequences, 3 of which enumerate nothing',
    ],
    [
        'vendored/lunchroom-manners.json',
        'pre-release v3: `content` for `items`, and a Choice of Video bodies',
    ],
    [
        'vendored/members-ranges.json',
        'all three v2 range spellings in one manifest',
    ],
    ['vendored/qatar-right-to-left.json', 'v2 right-to-left with viewingHint'],
    [
        'vendored/scroll.json',
        'no IIIF @context, canvas height as a string, Image API 1.1 service',
    ],
    ['synthetic/v2 oa:Choice painting annotation', 'v2 Choice selection'],
    ['synthetic/v2 level-0 image service', 'level-0 URL construction, v2'],
    [
        'synthetic/v2 ranges — canvases, members, and ranges spellings',
        'v2 ranges in all three spellings, synthetic and exact',
    ],
    [
        'synthetic/v2 viewingHint and viewingDirection at two levels',
        'v2 scalars declared at BOTH root and sequence, disagreeing — pins that the SEQUENCE wins',
    ],
    ['synthetic/v3 level-0 image service', 'level-0 URL construction, v3'],
    [
        'synthetic/v3 painting annotations split across two annotation pages',
        "ticket 03's deliberate fix — every annotation page is read, not just the first",
    ],
];

// ============================================================================
// Observation — everything below reads a ViewerState, never a hand-built canvas
// ============================================================================

/**
 * Mirrors the dimension chain in `resolveCanvasImage`'s private
 * `getCanvasDimensions`, which core does not export — and mirrors it exactly,
 * `||` for `||`. It read `??` here until the re-baseline, which is not the same
 * function: the two disagree on `width: 0`, where `??` keeps the zero and `||`
 * falls through to the next rung. A canvas that renders blank because
 * production fell through must read blank here too, or this line stops
 * explaining the record beneath it.
 *
 * Deliberately version- and representation-neutral (`width` | `__jsonld.width` |
 * `getWidth()`) so it keeps reading correctly as canvases become raw JSON in
 * tickets 06-09.
 *
 * A dimension that is not a NUMBER is rendered quoted, because that distinction
 * is load-bearing: `getCanvasDimensions` rejects a non-number outright and the
 * canvas then resolves no images at all. `vendored/scroll.json` carries BOTH
 * dimensions as strings and renders blank because of it, and
 * `size="62651"x"1976"` is the only thing in the record that explains why.
 */
function canvasSize(canvas: any): string {
    const dim = (raw: string, accessor: 'getWidth' | 'getHeight') => {
        const value =
            canvas?.[raw] ||
            canvas?.__jsonld?.[raw] ||
            (typeof canvas?.[accessor] === 'function'
                ? canvas[accessor]()
                : null);

        if (value === null || value === undefined) return '<none>';
        return typeof value === 'number'
            ? String(value)
            : JSON.stringify(value);
    };

    return `${dim('width', 'getWidth')}x${dim('height', 'getHeight')}`;
}

/**
 * A throw, recorded without an engine's exact words.
 *
 * The Collection records read
 * `<THROWS from setManifestData: m.getSequences is not a function>` until ticket
 * 07 made every enumerator total. That line embedded two things a golden has no
 * business pinning: `m` was a production local variable name, and the sentence
 * was V8's phrasing of a `TypeError`. Either could change without any behavior
 * changing at all. The constructor name is the stable, meaningful part; the
 * message keeps its shape with the receiver replaced.
 *
 * No record produced by either tier reaches this today. It stays because the
 * alternative — a bare `error.message` — is what put an engine string in the
 * golden the first time.
 */
function renderThrow(error: any): string {
    const name = error?.constructor?.name ?? typeof error;
    const message = String(error?.message ?? error).replace(
        /^[\w$.[\]'"]+\.(\w+) is not a function$/,
        '<receiver>.$1 is not a function',
    );
    return `${name}: ${message}`;
}

/** Trim float noise without hiding a real change. */
function num(value: number): string {
    return String(Number(value.toFixed(6)));
}

/**
 * One resolved image source as this golden spells it: a service by its
 * `info.json`, anything else by its own URL.
 *
 * The spelling is the GOLDEN's, not the product's, and lives here so the record
 * stays comparable with every earlier run of it. Core resolves an image service
 * to its base id and builds tiles, sizes and `info.json` from that as it needs
 * them (`toImageSource`); what this file is recording is which image a canvas
 * paints, and a service's `info.json` is the stable name for one.
 */
function imageSourceUrl(source: ReturnType<typeof toImageSource>): string {
    if (!source) return '';
    return source.kind === 'service'
        ? `${source.serviceId}/info.json`
        : source.url;
}

/**
 * The images the viewer would paint for one canvas, in document order, with the
 * position each occupies. Reached through `resolveAllCanvasImages` and
 * `toImageSource` — the same two the renderer's descriptors paint from — so this
 * is the rendered result, not a parsing internal.
 */
function resolvedImages(
    canvas: any,
    getSelectedChoice: (canvasId: string) => string | undefined,
): string[] {
    let resolved;
    try {
        resolved = resolveAllCanvasImages(canvas, { getSelectedChoice });
    } catch (error: any) {
        // Unreached by the corpus, and kept anyway. `resolveAllCanvasImages`
        // has no try/catch anywhere on its path to the viewer, so a throw here
        // would be a blank page in production; catching it is what makes that
        // legible in a diff rather than a failed test run with no record.
        // Rendered through `renderThrow` so the golden never pins an engine's
        // wording.
        return [`<THROWS: ${renderThrow(error)}>`];
    }

    return resolved
        .map((image) => ({ url: imageSourceUrl(toImageSource(image)), image }))
        .filter((entry) => entry.url !== '')
        .map(
            (entry, index) =>
                `[${index}] url=${entry.url} at=${num(entry.image.x)},${num(entry.image.y)},${num(entry.image.width)}`,
        );
}

/** Choice alternatives the viewer would offer for one canvas, as ids. */
function choiceIds(canvas: any): string[] {
    // `getCanvasChoices` is keyed per CANVAS, not per annotation: on a canvas
    // with two Choice annotations it returns the first one's alternatives only,
    // so the second Choice can never be switched. Still true, and NOT exercised
    // by the corpus — no fixture carries two Choice annotations on one canvas —
    // so this file cannot detect a fix or a regression in it either way.
    //
    // The `Array.isArray` guard is likewise unexercised. `getCanvasChoices`
    // returned a bare `Choice.items` object unchanged until ticket 06 routed it
    // through `getChoiceAlternatives`, which always returns an array.
    const choices = getCanvasChoices(canvas);
    if (!Array.isArray(choices)) return [];
    return choices.map((choice) => getResourceId(choice) || '<no id>');
}

/**
 * Painting annotations ENUMERATED on one canvas, which is not the same question
 * as `withPainting`.
 *
 * `withPainting` counts canvases the viewer resolved at least one image for —
 * the thing a user can see, and the right summary field. But it is silent about
 * enumeration on every canvas that resolves nothing regardless: `audio.json`
 * (the corpus's only IxIF fixture, and IxIF is preserved for parity),
 * `lunchroom-manners.json`, and the missing-image cookbook canvas all read
 * `withPainting=0` whether their annotations are enumerated correctly or not
 * enumerated at all. This count is what distinguishes those two.
 */
function paintingAnnotationCount(canvas: any): number {
    return getPaintingAnnotations(canvas).length;
}

interface Summary {
    canvases: number;
    withPainting: number;
    withoutPainting: number;
    withChoice: number;
    sequences: number;
    structureNodes: number;
}

/** Canvases from EVERY sequence, in sequence order, exactly as the viewer hands them out. */
function canvasesAcrossSequences(state: ViewerState): any[][] {
    const sequences: any[][] = [];
    const count = Math.max(1, state.sequenceCount);
    for (let index = 0; index < count; index++) {
        state.selectedSequenceIndex = index;
        sequences.push(state.canvases);
    }
    state.selectedSequenceIndex = 0;
    return sequences;
}

function summarize(state: ViewerState): Summary {
    const all = canvasesAcrossSequences(state).flat();

    let withPainting = 0;
    let withChoice = 0;
    for (const canvas of all) {
        // "Has a painting annotation" is observed as "the viewer resolved at
        // least one image for it", which is the thing a user can see. A canvas
        // whose annotations exist but resolve to nothing renders blank, and a
        // baseline that counted the annotations would call that healthy.
        if (resolvedImages(canvas, () => undefined).length > 0) withPainting++;
        if (choiceIds(canvas).length > 0) withChoice++;
    }

    return {
        canvases: all.length,
        withPainting,
        withoutPainting: all.length - withPainting,
        withChoice,
        sequences: state.sequenceCount,
        structureNodes: state.structures.length,
    };
}

// ============================================================================
// Rendering
// ============================================================================

function renderSummary(s: Summary): string {
    return (
        `canvases=${s.canvases} withPainting=${s.withPainting} ` +
        `withoutPainting=${s.withoutPainting} withChoice=${s.withChoice} ` +
        `sequences=${s.sequences} structureNodes=${s.structureNodes}`
    );
}

function renderStructures(nodes: StructureNode[], indent = '    '): string[] {
    return nodes.flatMap((node) => [
        `${indent}- id=${node.id || '<none>'} label=${node.label || '<none>'} ` +
            `behaviors=[${node.behaviors.join(',')}] canvasIds=${node.canvasIds.length}`,
        ...renderStructures(node.children, `${indent}  `),
    ]);
}

const BROAD_HEADER = `# Behavioral baseline — BROAD TIER
#
# Frozen by \`remove-manifesto\` ticket 04 while \`manifesto.js\` was still
# installed, and RE-BASELINED once after tickets 05, 06 and 07 landed — a
# deliberate, separately-reviewed re-curation, not a snapshot refresh. Generated
# by \`src/lib/state/viewer.baseline.test.ts\`; do not edit by hand. Every record
# is observed on a real \`ViewerState\` loaded with raw manifest JSON through
# \`setManifestData\`, backed by the real manifest cache, with no mocks and no
# hand-built canvases.
#
# The baseline is a DETECTOR, not a contract. Parsing may be better than the
# baseline; it need not be mechanically identical, and a move that improves
# parsing is accepted rather than engineered around. What survives is the
# discipline that made the baseline worth having: every moved record gets an
# explanation naming what changed and why the new value is right, because
# improvement and regression look identical in a diff until someone reads them.
# A move nobody can explain stays a blocker until someone can. Losses are
# scrutinized harder than gains — gaining a value is cheap to verify, losing one
# is the thing that ships unnoticed.
#
# MOVES ACCEPTED AT THE RE-BASELINE (this file):
#   - \`synthetic/v2 oa:Choice painting annotation\` went withPainting=1 -> 2,
#     withoutPainting=1 -> 0, withChoice=0 -> 1. Ticket 06 taught the enumerator
#     the v2 spelling of Choice (\`resource.default\` + \`resource.item[]\`), so the
#     choice-bearing canvas now offers its alternatives and renders one instead
#     of rendering nothing.
#   - \`synthetic/v2 sequences as a bare object\` went canvases=0 sequences=0 ->
#     canvases=2 sequences=1. Ticket 07 guards every array access (SPEC,
#     "Failure contract"), so a \`sequences\` written as a bare object degrades to
#     a one-element list instead of enumerating nothing.
#   - All four Collections stopped throwing and now record a zero summary.
#     Ticket 07's totality contract: a Collection has members, not sequences, so
#     it has no canvases — which is an answer, not a TypeError.
#
# THE AUDIOVISUAL SET — \`plugin-av\` ticket 02, the second re-pin of this file.
#   Sixteen \`av/\` manifests (the fifteen audiovisual IIIF Cookbook recipes and
#   one waveform-linked Avalon manifest) joined the corpus in the same commit as
#   the painting-body classifier that reads them. They were vendored a ticket
#   earlier and held out by name, precisely so that this file would never have
#   frozen the answer a viewer gave them BEFORE it could tell an MP4 from a JPEG.
#
#   Measured through this file's own seam immediately before the classifier
#   landed, ELEVEN of the sixteen read \`withPainting >= 1\` — 0003, 0013, 0017,
#   0026, 0064, 0065 (both canvases), 0074, 0219, 0229, 0489, and the Avalon
#   file. That was the bug, not the baseline: a plain \`Video\`/\`Sound\` body has
#   an id like any other resource, so canvas→source resolution handed the media
#   URL to the image pipeline and the viewer fetched an MP4 with \`new Image()\`.
#   The other five (0002, 0014, 0015, 0103, 0434) read 0 already, and for an
#   unrelated reason: they declare \`duration\` and no \`width\`/\`height\`, so they
#   fell out on geometry before anything looked at what they painted.
#
#   Fifteen of the sixteen now read \`withPainting=0\`, and the fall from eleven
#   to one IS the evidence the classifier works. A \`withPainting >= 1\` on any
#   manifest but 0489 is a non-image body that got through.
#
#   \`av/0489-multimedia-canvas\` is the one exception and reads \`withPainting=1\`,
#   which is correct rather than a miss. Its single canvas carries an Image body
#   (with an Image API service) alongside a Video body and three \`TextualBody\`
#   ones, and the classifier's rule for that shape is to paint the images and
#   ignore the rest silently. The record says the viewer resolved the JPEG,
#   which it did and should.
#
#   \`av/0434-choice-av\` keeps \`withChoice=1\`. Its Choice of six audio
#   alternatives is still enumerated as a Choice — the classifier decides what
#   gets PAINTED, and offering the reader alternatives is a different question
#   that \`getCanvasChoices\` still answers.
#
# HOW TO READ A DIFF
#   Each manifest gets one six-field record. The dominant failure mode of this
#   epic is the silent empty result, and it reads here as \`withPainting=154\`
#   becoming \`withPainting=0\` — the viewer would render blank pages with no
#   diagnostic at all.
#
#     canvases         canvases enumerated, summed over EVERY sequence
#     withPainting     of those, the ones the viewer resolved >=1 image for
#     withoutPainting  canvases - withPainting
#     withChoice       canvases offering Choice alternatives
#     sequences        sequence count
#     structureNodes   top-level structure (range) nodes
#
#   THESE SIX FIELDS ARE A CONTRACT. Adding one churns every record in this file
#   and destroys comparability with earlier goldens. Doing it is a deliberate,
#   separately-reviewed re-baseline — never a side effect of another ticket. The
#   re-baseline deliberately did NOT add a seventh field here: the per-canvas
#   painting-annotation count it needed went to the deep tier, whose per-canvas
#   fields are not a contract.
#
#   \`withPainting\` is "the viewer resolved an image", not "the canvas has a
#   painting annotation". They differ on time-based and unresolvable media, and
#   this file cannot tell the two apart. The deep tier's \`paintingAnnotations=\`
#   is where enumeration itself is pinned.
#
#   \`canvases\` SUMS ACROSS SEQUENCES, and the sum can exceed the number of
#   distinct canvases in the manifest. Two shapes make it read oddly and neither
#   is breakage:
#     - a sequence that enumerates nothing still counts as a sequence.
#       \`vendored/illustrationsofchina\` reads canvases=5 sequences=4 because
#       three of its four sequences are bare references to external Sequence
#       documents (ticket 07: degrade, do not resolve — resolving one is an HTTP
#       fetch from a synchronous, pure function).
#     - a structure-derived sequence RE-LISTS canvases another sequence already
#       listed. \`cookbook/0027-alternative-page-order\` reads canvases=8 for FOUR
#       distinct canvases: its two sequences come from two \`behavior: sequence\`
#       ranges over the same four canvases in different orders, so every canvas
#       is counted twice. A drop from 8 to 4 there would mean a lost sequence,
#       not a lost canvas.
#
# EXPECTED PARTIALS — a non-zero \`withoutPainting\` is not automatically a bug.
# See \`../test/fixtures/manifests/PROVENANCE.md\` ("Known-partial fixtures") for
# the fixtures that correctly lack an image on every canvas.
#
# DEFECTS THIS FILE ONCE FROZE, AND WHAT BECAME OF THEM:
#   - FIXED, ticket 07 — a bare-object \`sequences\` enumerated ZERO canvases,
#     silently. \`manifesto.js\` walked \`sequences\` with an indexed loop, so a
#     bare object had length \`undefined\`. This was the epic's signature failure
#     mode. \`synthetic/v2 sequences as a bare object\` now reads canvases=2.
#   - FIXED, ticket 07 — a Collection handed to the manifest path THREW a
#     TypeError instead of returning an empty array, violating the spec's "every
#     enumerator is total" contract. Collections keep their own section below,
#     because a six-field record is not something a Collection can honestly
#     fill, but the manifest path now degrades.
#   - FIXED, ticket 06 — IIIF v2 \`oa:Choice\` (\`resource.default\` +
#     \`resource.item[]\`) was not recognized AT ALL:
#     \`synthetic/v2 oa:Choice painting annotation\` recorded withChoice=0 AND
#     withoutPainting=1, i.e. the choice-bearing canvas offered no alternatives
#     and rendered nothing. It now reads withChoice=1 withoutPainting=0.
#
# NOT EXERCISED BY THE CORPUS — real code paths, but no fixture reaches them, so
# this file can neither freeze them nor detect a change to them. Do not read the
# absence of a moved record as evidence about either:
#   - A \`Choice\` whose \`items\` is a bare object rather than an array. This was
#     also fixed, by ticket 06 routing \`getCanvasChoices\` through
#     \`getChoiceAlternatives\`, which guards the access; there is simply no
#     record here that could have shown it.
#   - Choice selection keyed per CANVAS rather than per annotation, so a second
#     Choice annotation on the same canvas can never be switched. Still true in
#     production. No fixture carries two Choice annotations on one canvas.
#
# CANVASES THE VIEWER RESOLVES NO IMAGE FOR, beyond the known partials:
#   - \`vendored/scroll.json\` — BOTH canvas dimensions are strings ("62651" and
#     "1976") and \`getCanvasDimensions\` requires numbers, so it renders blank.
#   - \`vendored/lunchroom-manners.json\` — a pre-release-v3 Choice of Video
#     bodies, and \`vendored/audio.json\` — IxIF audio. Both are time-based media
#     with no image to paint, and this tier cannot tell you whether that is
#     because enumeration found nothing or because what it found is unpaintable.
#     The deep tier's \`paintingAnnotations=\` can, and they differ:
#     lunchroom-manners enumerates 1, audio enumerates 0 (an IxIF \`element\` is
#     a \`dctypes:Sound\` resource — the media IS the element, reached through
#     \`rendering\`, so there is no painting annotation to find).
#   - every \`av/\` manifest except \`0489-multimedia-canvas\`, for the reason the
#     audiovisual section above gives. \`withPainting=0\` there does NOT mean the
#     canvas vanished: it keeps its layout rect, its place in navigation and its
#     place in the thumbnail strip, and the viewer paints an honest
#     unsupported-content treatment over it. That is the intended answer for a
#     plugin-less viewer rather than a degraded one — and this tier cannot see
#     the difference, which is why it is written down here.
`;

const DEEP_HEADER = `# Behavioral baseline — DEEP TIER
#
# Frozen by \`remove-manifesto\` ticket 04 while \`manifesto.js\` was still
# installed, and RE-BASELINED once after tickets 05, 06 and 07 landed — a
# deliberate, separately-reviewed re-curation, not a snapshot refresh. Generated
# by \`src/lib/state/viewer.baseline.test.ts\`; do not edit by hand. Same seam as
# the broad tier: a real \`ViewerState\`, raw manifest JSON in through
# \`setManifestData\`, real manifest cache, no mocks, and every canvas below is
# one the viewer handed out.
#
# The broad tier answers "did anything disappear?". This tier answers "is the
# VALUE right?" on 20 curated manifests — Choice selection, composite canvases,
# level-0 URL construction, v2 ranges in all three spellings, right-to-left,
# multi-sequence v2, and the manifest scalars.
#
# MOVES ACCEPTED AT THE RE-BASELINE (this file):
#   - \`vendored/illustrationsofchina.json\` and \`vendored/qatar-right-to-left.json\`
#     went viewingMode=individuals -> paged. Both declare \`viewingHint: "paged"\`
#     at a v2 manifest root, which \`_applyManifestSettings\` never read — it read
#     only the v3 \`behavior\` spellings. \`viewingHint\` IS the v2 spelling of
#     viewing behavior, so these are fixes, not drift (ticket 05).
#   - \`vendored/audio.json\` canvases [0] and [1] went thumbnail=<none> to a real
#     URL. Those canvases declare \`"thumbnail"\` as a BARE STRING;
#     \`manifesto.js\` wrapped it in a \`Thumbnail\` whose \`__jsonld\` was the string
#     itself, so reading \`id\` off it gave \`undefined\` and the URL was discarded.
#     The raw path returns the string. Reproducing the old value would mean
#     deliberately discarding a valid URL (ticket 07).
#   - \`synthetic/v2 oa:Choice painting annotation\` canvas [0] gained a
#     thumbnail, an image, a \`choices:\` block and an \`images per selection:\`
#     block. Ticket 06 taught the enumerator the v2 Choice spelling; the canvas
#     rendered nothing before.
#
# MOVE ACCEPTED AT THE SECOND RE-PIN (\`plugin-av\` ticket 02):
#   - \`vendored/lunchroom-manners.json\` canvas [0] went
#     thumbnail=\`.../lunchroom_manners_1024kb.mp4\` -> \`<none>\`, and this is the
#     ONE record in either tier that shows the thumbnail half of the classifier.
#     That canvas declares no \`thumbnail\`, so the strip fell back to the
#     painting body's own id — which here is an MP4, put straight into an
#     \`<img src>\` and rendered as a broken image. The fallback is now gated by
#     the painting-body classifier, so it declines to answer rather than
#     answering with a video. \`<none>\` is what routes the canvas to the strip's
#     no-thumbnail treatment, where it gets an audiovisual glyph instead of a
#     broken picture (user story 29).
#
#     Reaching that body at all is itself the fix to a second, latent defect.
#     This canvas's \`body\` is an ARRAY — \`[Choice(three Videos), Text(vtt)]\` —
#     and the old code tested for a Choice BEFORE unwrapping the array, so it
#     saw "not a Choice", took \`body[0]\`, and got the Choice object itself,
#     which has no id. Its \`images:\` line read \`(none)\` by accident. The PAINT
#     path now unwraps the array first and so resolves the Choice properly, and
#     the classifier is what keeps that from turning an accident into an MP4 in
#     the tile pipeline (user story 40). \`images: (none)\` is unchanged and now
#     means what it says.
#
#     \`withChoice\` is unaffected, and this canvas still reads \`withChoice=0\`.
#     \`getCanvasChoices\` (and \`ThumbnailGallery\`'s badge) still test for a
#     Choice BEFORE unwrapping the body array, so on this shape they go on
#     seeing "not a Choice" and offer no alternatives. Known follow-up rather
#     than an oversight: user story 40 is about the image pipeline, and the only
#     shape where the two paths would visibly disagree is a
#     \`[Choice(imageA, imageB), Text(vtt)]\` — painting imageA while the choice
#     picker lists nothing — which no corpus fixture has.
#
# RE-CURATION — three fixtures were swapped in and three out, inside the SPEC's
# 15-20 budget. The original 20 gave this tier ZERO variance on two of the three
# manifest scalars it records (\`startCanvasId=<none>\` and
# \`viewingMode=individuals\` on all 20), so "the golden did not move" proved
# almost nothing about the surfaces ticket 05 rewrites. Added:
# \`cookbook/0202-start-canvas.json\` (the corpus's only \`start\`),
# \`cookbook/0011-book-3-behavior-manifest-continuous.json\` (the only
# viewingMode that is neither individuals nor paged), and
# \`synthetic/v2 viewingHint and viewingDirection at two levels\`. Dropped
# \`cookbook/0117-add-image-thumbnail.json\` (curated for a canvas-level
# \`thumbnail\` it does not have — its thumbnail is on the image resource),
# \`demo/iiif-harvardartmuseums-299843.json\` (generic v2, covered elsewhere), and
# \`vendored/4.json\` (curated for "v2 sequence with no @id", a property this tier
# never records — its BROAD record pins it).
#
# HOW TO READ A DIFF
#   Per manifest: three of the four manifest-scalar reads that ticket 05
#   rewrites — start canvas, viewing direction, viewing mode — plus the structure
#   tree, then every canvas of every sequence. The FOURTH, search-service
#   discovery, is not recorded here at all: it is private to \`ViewerState\` and
#   only observable by performing a network search, so ticket 05's rewrite of it
#   has no safety net in this file and brings its own tests.
#
#   v2 declares viewing direction and viewing hint at both the manifest root and
#   the sequence, and the SEQUENCE WINS. IIIF Presentation 2.1 states it for
#   \`viewingDirection\`: a manifest's direction "applies to all of its sequences
#   unless the sequence specifies its own viewing direction". \`viewingHint\` has
#   no stated precedence and follows the rule the spec does state.
#   \`synthetic/v2 viewingHint and viewingDirection at two levels\` is the fixture
#   that pins this: its root says left-to-right/paged, its sequence says
#   right-to-left/individuals, and the record below reads the SEQUENCE's values.
#
#   Per canvas: id, label, size, thumbnail URL, the number of painting
#   annotations enumerated on it, the image URLs the viewer would paint (via the
#   same \`resolveAllCanvasImages\` the renderer paints from) each with its position
#   \`at=x,y,width\` in viewport units, and the Choice alternatives on offer.
#   Where a canvas has choices, the resolved images are re-recorded once per
#   selection, driven through \`ViewerState.selectChoice\` — so this file pins
#   choice SELECTION, not just choice presence.
#
#   \`paintingAnnotations=\` is ENUMERATION; \`images:\` is RESOLUTION. They are
#   different questions and the broad tier's \`withPainting\` only answers the
#   second. A canvas reading \`paintingAnnotations=1\` with \`images: (none)\` has an
#   annotation the viewer cannot paint — correct for time-based media, a blank
#   page for anything else. A canvas going \`paintingAnnotations=1 -> 0\` has lost
#   its annotation entirely, which is the failure this epic exists to prevent,
#   and on \`vendored/audio.json\`, \`vendored/lunchroom-manners.json\` and the
#   missing-image canvases NOTHING ELSE IN EITHER TIER WOULD SHOW IT: they
#   resolve no image either way, so \`withPainting\` reads 0 before and after.
#
#   \`images: (none)\` on a canvas that used to list a URL is the silent blank
#   render this whole epic is trying not to cause.
#
# LEVEL-0 reads in the \`thumbnail=\` line. A level1/level2 service gets a
# SYNTHESIZED \`.../full/200,/0/default.jpg\` — an arbitrary width a level-0
# server cannot serve. A level-0 service does not: its thumbnail comes from a
# size the service actually declares, so it reads \`.../full/full/0/default.jpg\`
# (v2), \`.../full/max/0/default.jpg\` (v3), or a literal entry from a \`sizes\`
# block (\`vendored/auth-clinical.json\` → \`.../full/64,100/0/default.jpg\`). A
# level-0 line that starts synthesizing \`/full/200,/\` is a real regression: it
# would 404 for every tile-limited publisher.
#
# DEFECTS THIS FILE ONCE FROZE, AND WHAT BECAME OF THEM:
#   - FIXED, ticket 06 — IIIF v2 \`oa:Choice\` was not recognized at all. Canvas
#     [0] of \`synthetic/v2 oa:Choice painting annotation\` listed no choices and
#     no images, because the v2 spelling puts the alternatives in
#     \`resource.default\`/\`resource.item[]\` and nothing read it. It now lists
#     three alternatives and a resolved image per selection.
#   - RESOLVED, ticket 07 — \`vendored/illustrationsofchina.json\` has four
#     sequences, three of which enumerate zero canvases. The decision was
#     DEGRADE, DO NOT RESOLVE: those three are \`@id\`/\`@type\`/\`label\` references
#     to external Sequence documents, and resolving one is an HTTP fetch from a
#     function that must stay synchronous, total and pure over cached JSON.
#     Enumerating zero is what happened before, so the record did not move.
#     Real-world shape, not breakage.
#
# NOT EXERCISED BY THE CORPUS — real code paths, but no fixture reaches them, so
# this file can neither freeze them nor detect a change to them:
#   - Choice selection keyed per CANVAS rather than per annotation. On a canvas
#     with two Choice annotations only the first one's alternatives are offered
#     and the second always resolves to its \`items[0]\`. Still true in
#     production; no fixture carries two Choice annotations on one canvas, so no
#     record below can show it.
#   - A \`Choice\` whose \`items\` is a bare object rather than an array. It used to
#     throw out of \`resolveCanvasImage\` with no try/catch on the path to the
#     viewer, and would have recorded \`<THROWS: ...>\` in its images. Ticket 06
#     guarded the access; no record here ever exercised it either way.
#
# CANVASES THAT RESOLVE NO IMAGE:
#   - \`vendored/scroll.json\` — recorded below as \`size="62651"x"1976"\`. BOTH
#     dimensions are strings, not just the height, and \`getCanvasDimensions\`
#     requires numbers, so the canvas renders blank.
#   - \`vendored/lunchroom-manners.json\` — \`paintingAnnotations=1\` with
#     \`images: (none)\`. Enumeration works; the annotation's body array holds a
#     Choice of Video bodies and a VTT, and none of that is an image to paint.
#     Since \`plugin-av\` ticket 02 that is a decision rather than an accident —
#     see the move recorded above.
#   - \`vendored/audio.json\` — \`paintingAnnotations=0\` on both canvases, and
#     that is CORRECT, not a loss. An IxIF \`element\` is a \`dctypes:Sound\`
#     resource with no \`images\`, \`items\` or \`content\`: the media is the element
#     itself, reached through \`rendering\`. IxIF is preserved for parity (SPEC,
#     Out of Scope), and this is the only record in either tier that says what
#     its enumeration is supposed to be. If it ever reads non-zero, something
#     started treating an IxIF element as a v2 canvas.
`;

// ============================================================================
// Tests
// ============================================================================

describe('behavioral baseline', () => {
    const registeredIds: string[] = [];

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    /**
     * Load one fixture the way a consumer does, and hand back the viewer.
     *
     * The JSON is CLONED first. Every fixture object is module-level and shared
     * — corpus fixtures are parsed once into {@link fixtures}, synthetics are
     * exported singletons — and both tiers register the same ones, so
     * registration writes its `__jsonld` back-references onto the same object
     * twice. That is the exact hazard this file's docblock cites as its reason
     * for reading the corpus with `node:fs` instead of `import.meta.glob`, and
     * it was left open on the objects themselves. A clone per load means the
     * deep tier observes the manifest as authored rather than as the broad tier
     * left it.
     */
    async function load(fixture: Fixture): Promise<ViewerState> {
        const state = new ViewerState();
        registeredIds.push(fixture.id);
        await state.setManifestData(fixture.id, structuredClone(fixture.json));
        return state;
    }

    it('the corpus and the curated list are both intact', () => {
        // A directory walk that silently found nothing, or a curated entry that
        // no longer names a fixture, would turn a golden into a green no-op.
        expect(fixtures.length).toBeGreaterThan(60);
        expect(DEEP_TIER.length).toBeGreaterThanOrEqual(15);
        expect(DEEP_TIER.length).toBeLessThanOrEqual(20);
        for (const [name] of DEEP_TIER) {
            expect(fixturesByName.has(name), `${name} matches no fixture`).toBe(
                true,
            );
        }
        expect(new Set(DEEP_TIER.map(([name]) => name)).size).toBe(
            DEEP_TIER.length,
        );

        // The audiovisual set specifically. It replaces the `DEFERRED_DIRS`
        // guard that used to assert the skip still named something: the
        // directory is in the baseline now, so what has to be asserted is that
        // it is still being walked. Deleting it would otherwise take sixteen
        // records out of the golden as quietly as it took them out of the walk.
        expect(
            fixtures.filter((f) => f.name.startsWith('av/')).length,
        ).toBeGreaterThan(10);
    });

    it('broad tier — every manifest in the corpus', async () => {
        const lines: string[] = [BROAD_HEADER, '', '## Manifests', ''];

        for (const fixture of fixtures.filter((f) => !f.isCollection)) {
            const state = await load(fixture);
            lines.push(fixture.name, `    ${renderSummary(summarize(state))}`);
        }

        lines.push(
            '',
            '## Collections',
            '',
            '# A Collection is not a manifest: it has members, and the viewer',
            '# resolves one to a child manifest before there is anything to',
            '# enumerate. It keeps its own section because a six-field record is',
            '# not something a Collection can honestly fill.',
            '#',
            '# Handing one to the manifest path used to THROW a TypeError rather',
            '# than degrade. Ticket 07 made every enumerator total, so it now',
            '# records a zero summary: a Collection has no sequences, which is an',
            '# answer. Were a THROWS line ever to return here it would carry the',
            '# error class and a normalized message, never an engine string.',
            '',
        );

        for (const fixture of fixtures.filter((f) => f.isCollection)) {
            let outcome: string;
            try {
                const state = await load(fixture);
                outcome = renderSummary(summarize(state));
            } catch (error: any) {
                outcome = `<THROWS from setManifestData: ${renderThrow(error)}>`;
            }
            lines.push(
                fixture.name,
                `    members=${parseCollection(fixture.json).length}`,
                `    manifestPath: ${outcome}`,
            );
        }

        await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot(
            join(GOLDEN_DIR, 'broad-tier.txt'),
        );
    });

    it('deep tier — 20 curated manifests, per canvas', async () => {
        const lines: string[] = [DEEP_HEADER];

        for (const [name, why] of DEEP_TIER) {
            const fixture = fixturesByName.get(name)!;
            const state = await load(fixture);

            lines.push(
                '',
                '='.repeat(78),
                `${name}`,
                `# ${why}`,
                '',
                `manifestId=${fixture.id}`,
                `startCanvasId=${state.startCanvasId ?? '<none>'}`,
                `viewingDirection=${state.viewingDirection}`,
                `viewingMode=${state.viewingMode}`,
                `${renderSummary(summarize(state))}`,
            );

            const structures = state.structures;
            if (structures.length) {
                lines.push('structures:', ...renderStructures(structures));
            }

            const sequences = canvasesAcrossSequences(state);
            sequences.forEach((canvases, sequenceIndex) => {
                lines.push(
                    '',
                    `-- sequence ${sequenceIndex} — ${canvases.length} canvas(es)`,
                );
                if (!canvases.length) {
                    lines.push('   (no canvases)');
                    return;
                }

                canvases.forEach((canvas, canvasIndex) => {
                    const canvasId = getCanvasId(canvas);
                    const choices = choiceIds(canvas);

                    lines.push(
                        `  [${canvasIndex}] id=${canvasId || '<none>'}`,
                        `      label=${getCanvasLabel(canvas, canvasIndex)}`,
                        `      size=${canvasSize(canvas)}`,
                        `      thumbnail=${getThumbnailSrc(canvas) || '<none>'}`,
                        `      paintingAnnotations=${paintingAnnotationCount(canvas)}`,
                    );

                    const images = resolvedImages(canvas, (id) =>
                        state.getSelectedChoice(id),
                    );
                    lines.push('      images:');
                    lines.push(
                        ...(images.length
                            ? images.map((image) => `        ${image}`)
                            : ['        (none)']),
                    );

                    if (!choices.length) return;

                    lines.push('      choices:');
                    lines.push(
                        ...choices.map((id, i) => `        [${i}] ${id}`),
                    );

                    // Choice SELECTION, driven through the public mutator, one
                    // recording per alternative. This is what makes a Choice
                    // regression readable: if selection stops taking effect,
                    // every branch below collapses onto the same URL.
                    lines.push('      images per selection:');
                    for (const choiceId of choices) {
                        state.selectChoice(canvasId, choiceId);
                        const selected = resolvedImages(canvas, (id) =>
                            state.getSelectedChoice(id),
                        );
                        lines.push(`        select ${choiceId}`);
                        lines.push(
                            ...(selected.length
                                ? selected.map((image) => `          ${image}`)
                                : ['          (none)']),
                        );
                    }
                    state.selectedChoices.delete(canvasId);
                });
            });
        }

        await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot(
            join(GOLDEN_DIR, 'deep-tier.txt'),
        );
    });
});
