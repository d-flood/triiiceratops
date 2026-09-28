/** The material embedded viewers run on: locally served, behind level-0 services. */

export type Example = {
    readonly manifest: string;
    readonly canvases: number;
    readonly label: string;
    readonly reserve?: {
        readonly width: number;
        readonly height: number;
    };
    readonly firstCanvas: {
        readonly width: number;
        readonly height: number;
        readonly prerender?: {
            readonly src: string;
            readonly alt: string;
        };
    };
};

export const HERO_EXAMPLE: Example = {
    manifest: '/material/landing/manifest.json',
    canvases: 11,
    label: 'Public-domain visual study set',
    reserve: {
        width: 1200,
        height: 1400,
    },
    firstCanvas: {
        width: 3645,
        height: 5267,
        prerender: {
            src: '/material/landing/images/haeckel/0,0,3645,5267/228,330/0/default.jpg',
            alt: 'Plate 8 from Ernst Haeckel’s Kunstformen der Natur, showing jellyfish with coral, ochre, and aqua anatomy.',
        },
    },
};
