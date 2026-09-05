/**
 * Turning a drop on the viewer pane into the view the playground drives the
 * viewer with (cookbook recipe 0599).
 *
 * The playground owns manifest selection, so it resolves the payload itself
 * rather than handing it to the viewer as a content state: `Demo.svelte` always
 * sets `manifestId`, and the viewer's precedence ladder discards a content state
 * whenever a discrete manifest prop is present (ADR 0006).
 */

import {
    readDroppedContentState,
    type DropPayloadSource,
    type ViewTarget,
} from '@triiiceratops/config';
import { parseContentState } from 'triiiceratops';

/**
 * The view a drop names, or `null` if nothing in it names a Manifest — which is
 * the playground's only signal that a drop was unusable, since it never handed
 * the payload to the viewer and so has no `viewererror` to wait for.
 */
export function resolveDroppedView(
    transfer: DropPayloadSource | null | undefined,
): ViewTarget | null {
    const payload = readDroppedContentState(transfer);
    if (!payload) return null;

    const parsed = parseContentState(payload);
    if (!parsed?.manifestId) return null;

    return {
        manifestId: parsed.manifestId,
        canvasId: parsed.canvasId,
        region: parsed.region,
    };
}
