export declare const DEFAULT_MIN_PIXEL_RATIO = 0.5;
export declare const DEFAULT_MIN_ZOOM_IMAGE_RATIO = 0.9;
export declare const MOBILE_DRAWER_FALLBACK: readonly ["canvas", "webgl", "html"];
export declare function isAndroidChrome(userAgent: string): boolean;
export declare function isIOS(userAgent: string): boolean;
export declare function shouldUseMobileDrawerFallback(params: {
    userAgent: string;
    drawerOverride: unknown;
}): boolean;
