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
    const [canvasId, fragment] = target.split('#');
    const regionMatch = fragment?.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);

    return {
        canvasId: canvasId || undefined,
        region: regionMatch
            ? {
                  x: Number(regionMatch[1]),
                  y: Number(regionMatch[2]),
                  width: Number(regionMatch[3]),
                  height: Number(regionMatch[4]),
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
