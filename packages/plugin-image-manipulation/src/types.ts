export interface ImageFilters {
    brightness: number;
    contrast: number;
    saturation: number;
    invert: boolean;
    grayscale: boolean;
}

export const DEFAULT_FILTERS: Readonly<ImageFilters> = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false,
    grayscale: false,
};
