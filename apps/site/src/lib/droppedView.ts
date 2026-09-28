import {
    readDroppedContentState,
    type DropPayloadSource,
    type ViewTarget,
} from '@triiiceratops/config';
import { parseContentState } from 'triiiceratops';

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
