export const DEFAULT_MIN_PIXEL_RATIO = 0.5;
export const DEFAULT_MIN_ZOOM_IMAGE_RATIO = 0.9;
export const MOBILE_DRAWER_FALLBACK = ['canvas', 'webgl', 'html'];
export function isAndroidChrome(userAgent) {
    return /Android/i.test(userAgent) && /\bChrome\//i.test(userAgent);
}
export function isIOS(userAgent) {
    return /\b(iPhone|iPad|iPod)\b/i.test(userAgent);
}
export function shouldUseMobileDrawerFallback(params) {
    const { userAgent, drawerOverride } = params;
    if (drawerOverride !== undefined)
        return false;
    return isAndroidChrome(userAgent) || isIOS(userAgent);
}
