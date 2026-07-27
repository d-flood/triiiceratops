/** The image filter values the plugin applies to the OSD canvas. */
export interface ImageFilters {
    brightness: number; // 0-200, default 100 (100 = no change)
    contrast: number; // 0-200, default 100
    saturation: number; // 0-200, default 100
    invert: boolean;
    grayscale: boolean;
}

/** The neutral filter state (no visual change), and the reset target. */
export const DEFAULT_FILTERS: Readonly<ImageFilters> = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false,
    grayscale: false,
};
