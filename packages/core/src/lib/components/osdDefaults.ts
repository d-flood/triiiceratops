export const DEFAULT_MIN_PIXEL_RATIO = 0.5;
export const DEFAULT_MIN_ZOOM_IMAGE_RATIO = 0.9;
export const MOBILE_DRAWER_FALLBACK = ['canvas', 'webgl', 'html'] as const;

export function isAndroidChrome(userAgent: string): boolean {
    return /Android/i.test(userAgent) && /\bChrome\//i.test(userAgent);
}

export function isIOS(userAgent: string): boolean {
    return /\b(iPhone|iPad|iPod)\b/i.test(userAgent);
}

export function shouldUseMobileDrawerFallback(params: {
    userAgent: string;
    drawerOverride: unknown;
}): boolean {
    const { userAgent, drawerOverride } = params;
    if (drawerOverride !== undefined) return false;
    return isAndroidChrome(userAgent) || isIOS(userAgent);
}
