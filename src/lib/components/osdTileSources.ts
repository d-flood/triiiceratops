export type TileSourceResolutionResult =
    | { ok: true; resolved: any[] }
    | { ok: false; error: { type: 'auth' } };

type ResolveTileSourcesParams = {
    sources: any[];
    osd?: any;
    viewport?: { width: number; height: number };
};

type AuthErrorMarker = { __authError: true };

function isAuthErrorMarker(value: unknown): value is AuthErrorMarker {
    return (
        !!value &&
        typeof value === 'object' &&
        '__authError' in value &&
        (value as AuthErrorMarker).__authError === true
    );
}

function getProfileHead(profile: unknown): string | null {
    if (typeof profile === 'string') return profile;
    if (Array.isArray(profile) && typeof profile[0] === 'string') {
        return profile[0];
    }
    return null;
}

function isIiifLevel0Profile(profile: unknown): boolean {
    const profileHead = getProfileHead(profile);
    if (!profileHead) return false;
    return (
        profileHead === 'level0' ||
        profileHead.endsWith('/level0.json') ||
        profileHead.endsWith('#level0')
    );
}

function createIiifTileSource(
    osd: any,
    data: any,
    url: string,
    viewport?: { width: number; height: number },
): any {
    if (!osd?.IIIFTileSource?.prototype) return data;

    try {
        const configured = osd.IIIFTileSource.prototype.configure.call(
            {},
            data,
            url,
            null,
        );
        const tileSource = new osd.IIIFTileSource(configured);
        applyLevel0LowZoomFullImageStrategy(tileSource, viewport);
        return tileSource;
    } catch {
        return data;
    }
}

function applyLevel0LowZoomFullImageStrategy(
    tileSource: any,
    viewport?: { width: number; height: number },
): void {
    if (!isIiifLevel0Profile(tileSource?.profile)) return;
    if (typeof tileSource?.getTileUrl !== 'function') return;
    if (tileSource.__triiiceratopsLevel0LowZoomPrepared) return;

    const originalGetTileUrl = tileSource.getTileUrl.bind(tileSource);
    const originalGetNumTiles =
        typeof tileSource.getNumTiles === 'function'
            ? tileSource.getNumTiles.bind(tileSource)
            : null;
    const fitMaxLevel = getFitMaxLevel(tileSource, viewport);
    const advertisedScaleFactors = getAdvertisedScaleFactors(tileSource);
    const tiledOnlyMinLevel = getTiledOnlyMinLevel(
        tileSource,
        advertisedScaleFactors,
        originalGetNumTiles,
    );

    if (originalGetNumTiles) {
        tileSource.getNumTiles = function (level: number) {
            if (shouldHideLevel(level, tiledOnlyMinLevel, advertisedScaleFactors, this)) {
                return { x: 0, y: 0 };
            }
            if (
                isFullImageLevel(
                    this,
                    level,
                    fitMaxLevel,
                    advertisedScaleFactors,
                    originalGetNumTiles,
                    tiledOnlyMinLevel,
                )
            ) {
                return { x: 1, y: 1 };
            }
            return originalGetNumTiles(level);
        };
    }

    if (typeof tileSource?.minLevel === 'number' && tiledOnlyMinLevel >= 0) {
        tileSource.minLevel = Math.max(tileSource.minLevel, tiledOnlyMinLevel);
    }

    tileSource.getTileUrl = function (level: number, x: number, y: number) {
        if (shouldHideLevel(level, tiledOnlyMinLevel, advertisedScaleFactors, this)) {
            const safeLevel = tiledOnlyMinLevel >= 0 ? tiledOnlyMinLevel : level;
            return originalGetTileUrl(safeLevel, x, y);
        }
        if (
            isFullImageLevel(
                this,
                level,
                fitMaxLevel,
                advertisedScaleFactors,
                originalGetNumTiles,
                tiledOnlyMinLevel,
            )
        ) {
            return getFullImageUrlForLevel(this, level);
        }

        return originalGetTileUrl(level, x, y);
    };

    tileSource.__triiiceratopsLevel0LowZoomPrepared = true;
}

function isFullImageLevel(
    tileSource: any,
    level: number,
    fitMaxLevel: number,
    advertisedScaleFactors: Set<number>,
    getNumTilesBase: ((level: number) => { x: number; y: number }) | null,
    tiledOnlyMinLevel: number,
): boolean {
    if (tiledOnlyMinLevel >= 0) return false;
    if (fitMaxLevel >= 0 && level <= fitMaxLevel) return true;
    if (!isAdvertisedTileLevel(tileSource, level, advertisedScaleFactors)) {
        return true;
    }
    if (!getNumTilesBase) return false;
    const numTiles = getNumTilesBase(level);
    return numTiles?.x === 1 && numTiles?.y === 1;
}

function getTiledOnlyMinLevel(
    tileSource: any,
    advertisedScaleFactors: Set<number>,
    getNumTilesBase: ((level: number) => { x: number; y: number }) | null,
): number {
    if (!getNumTilesBase) return -1;
    if (
        typeof tileSource?.minLevel !== 'number' ||
        typeof tileSource?.maxLevel !== 'number'
    )
        return -1;
    if (advertisedScaleFactors.size === 0) return -1;

    for (let level = tileSource.minLevel; level <= tileSource.maxLevel; level++) {
        if (!isAdvertisedTileLevel(tileSource, level, advertisedScaleFactors)) {
            continue;
        }
        const tiles = getNumTilesBase(level);
        if (tiles?.x > 1 || tiles?.y > 1) {
            return level;
        }
    }
    return -1;
}

function shouldHideLevel(
    level: number,
    tiledOnlyMinLevel: number,
    advertisedScaleFactors: Set<number>,
    tileSource: any,
): boolean {
    if (tiledOnlyMinLevel < 0) return false;
    if (level < tiledOnlyMinLevel) return true;
    return !isAdvertisedTileLevel(tileSource, level, advertisedScaleFactors);
}

function getAdvertisedScaleFactors(tileSource: any): Set<number> {
    const result = new Set<number>();
    const factors = tileSource?.scale_factors;
    if (Array.isArray(factors)) {
        for (const value of factors) {
            if (typeof value === 'number' && value > 0) result.add(value);
        }
    }
    return result;
}

function isAdvertisedTileLevel(
    tileSource: any,
    level: number,
    advertisedScaleFactors: Set<number>,
): boolean {
    if (advertisedScaleFactors.size === 0) return true;
    if (
        typeof tileSource?.maxLevel !== 'number' ||
        typeof level !== 'number'
    ) {
        return true;
    }
    const scaleFactor = Math.pow(2, tileSource.maxLevel - level);
    return advertisedScaleFactors.has(scaleFactor);
}

function getFitMaxLevel(
    tileSource: any,
    viewport?: { width: number; height: number },
): number {
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return -1;
    if (
        typeof tileSource?.minLevel !== 'number' ||
        typeof tileSource?.maxLevel !== 'number' ||
        typeof tileSource?.getLevelScale !== 'function' ||
        typeof tileSource?.width !== 'number' ||
        typeof tileSource?.height !== 'number'
    )
        return -1;

    let fitMaxLevel = -1;
    for (let level = tileSource.minLevel; level <= tileSource.maxLevel; level++) {
        const scale = tileSource.getLevelScale(level);
        const levelWidth = Math.ceil(tileSource.width * scale);
        const levelHeight = Math.ceil(tileSource.height * scale);
        if (levelWidth <= viewport.width && levelHeight <= viewport.height) {
            fitMaxLevel = level;
        }
    }
    return fitMaxLevel;
}

function getFullImageUrlForLevel(tileSource: any, level: number): string {
    const scale = tileSource.getLevelScale(level);
    const levelWidth = Math.ceil(tileSource.width * scale);
    const levelHeight = Math.ceil(tileSource.height * scale);
    const isVersion3 = tileSource.version === 3;
    const isLevel0 = isIiifLevel0Profile(tileSource?.profile);

    const size = isVersion3
        ? levelWidth === tileSource.width && levelHeight === tileSource.height
            ? 'max'
            : isLevel0
              ? `${levelWidth},`
              : `${levelWidth},${levelHeight}`
        : levelWidth === tileSource.width
          ? 'full'
          : `${levelWidth},`;

    const quality = isVersion3 ? 'default' : 'native';
    return `${tileSource._id}/full/${size}/0/${quality}.${tileSource.tileFormat}`;
}

// Fetch string info.json URLs once to detect auth errors and build prepared
// sources for OSD. Non-string tile sources are passed through unchanged.
export async function resolveTileSources(
    params: ResolveTileSourcesParams,
): Promise<TileSourceResolutionResult> {
    const { sources, osd, viewport } = params;
    const resolved = await Promise.all(
        sources.map(async (source) => {
            if (typeof source !== 'string') return source;

            try {
                const response = await fetch(source);
                if (response.status === 401) {
                    return { __authError: true };
                }
                if (!response.ok) return source;

                let data: any = null;
                try {
                    data = await response.json();
                } catch {
                    return source;
                }

                return createIiifTileSource(osd, data, source, viewport);
            } catch {
                // Network errors: pass through and let OSD handle it.
                return source;
            }
        }),
    );

    if (resolved.some(isAuthErrorMarker)) {
        return { ok: false, error: { type: 'auth' } };
    }

    return { ok: true, resolved };
}
