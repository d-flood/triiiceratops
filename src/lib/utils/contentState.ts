import { getIiifCanvasId, parseIiifXywh } from './iiifTargets';

export type CanvasRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ContentStateTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
};

function decodeContentState(value: string): string {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            '=',
        );
        return atob(padded);
    } catch {
        return value;
    }
}

function parseTarget(
    target: string,
): Pick<ContentStateTarget, 'canvasId' | 'region'> {
    const xywh = parseIiifXywh(target);

    return {
        canvasId: getIiifCanvasId(target) || undefined,
        region: xywh
            ? {
                  x: xywh[0],
                  y: xywh[1],
                  width: xywh[2],
                  height: xywh[3],
              }
            : undefined,
    };
}

export function parseContentState(value: string): ContentStateTarget | null {
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
        return { manifestId: value };
    }

    const decoded = decodeContentState(value);

    try {
        const parsed = JSON.parse(decoded);
        const manifestId = parsed.id || parsed['@id'];

        if (
            typeof manifestId === 'string' &&
            /^https?:\/\//i.test(manifestId)
        ) {
            return { manifestId };
        }

        const target =
            parsed?.target ||
            parsed?.partOf?.id ||
            parsed?.partOf?.['@id'] ||
            parsed?.source?.id ||
            parsed?.source?.['@id'];

        const manifest =
            parsed?.partOf?.id || parsed?.partOf?.['@id'] || manifestId;
        if (!manifest || typeof manifest !== 'string') {
            return null;
        }

        if (typeof target === 'string') {
            return {
                manifestId: manifest,
                ...parseTarget(target),
            };
        }

        if (typeof parsed?.source === 'string') {
            return {
                manifestId: manifest,
                ...parseTarget(parsed.source),
            };
        }

        return { manifestId: manifest };
    } catch {
        return null;
    }
}
