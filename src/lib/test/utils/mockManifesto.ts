/**
 * Mock utilities for Manifesto.js objects
 */

export interface MockCanvas {
    id: string;
    label?: string | any[];
    height?: number;
    width?: number;
    __jsonld?: any;
    getLabel?: () => any;
    getImages?: () => any[];
    getContent?: () => any[];
    getThumbnail?: () => any;
}

export interface MockManifest {
    __jsonld?: any;
    getSequences?: () => any[];
    getService?: (profile: string) => any;
}

/**
 * Create a mock Manifesto canvas object
 */
export function createMockCanvas(config: {
    id: string;
    label?: string;
    images?: any[];
    content?: any[];
    thumbnail?: any;
    jsonld?: any;
}): MockCanvas {
    const canvas: MockCanvas = {
        id: config.id,
        __jsonld: config.jsonld || {},
    };

    // Mock getLabel method
    canvas.getLabel = () => {
        if (config.label) {
            return [{ value: config.label }];
        }
        return [];
    };

    // Mock getImages (v2 style)
    if (config.images) {
        canvas.getImages = () => config.images || [];
    }

    // Mock getContent (v3 style)
    if (config.content) {
        canvas.getContent = () => config.content || [];
    }

    // Mock getThumbnail
    if (config.thumbnail) {
        canvas.getThumbnail = () => config.thumbnail;
    }

    return canvas;
}

/**
 * Create a mock Manifesto manifest object
 */
export function createMockManifest(config: {
    canvases?: MockCanvas[];
    searchService?: { id: string; profile: string };
    jsonld?: any;
}): MockManifest {
    const manifest: MockManifest = {
        __jsonld: config.jsonld || {},
    };

    // Mock getSequences
    if (config.canvases) {
        manifest.getSequences = () => [
            {
                getCanvases: () => config.canvases,
                getCanvasById: (id: string) => {
                    return config.canvases?.find((c) => c.id === id) || null;
                },
            },
        ];
    }

    // Mock getService for search
    if (config.searchService) {
        manifest.getService = (profile: string) => {
            if (
                profile === config.searchService?.profile ||
                profile === 'http://iiif.io/api/search/1/search' ||
                profile === 'http://iiif.io/api/search/0/search'
            ) {
                return config.searchService;
            }
            return null;
        };
    } else {
        manifest.getService = () => null;
    }

    return manifest;
}

/**
 * Create a mock image resource with IIIF service
 */
export function createMockImageWithService(config: {
    imageId: string;
    serviceId: string;
    serviceType?: string;
}) {
    return {
        id: config.imageId,
        type: 'Image',
        service: [
            {
                id: config.serviceId,
                '@id': config.serviceId,
                type: config.serviceType || 'ImageService3',
                profile: 'level1',
            },
        ],
        getService: () => ({
            id: config.serviceId,
            '@id': config.serviceId,
            type: config.serviceType || 'ImageService3',
        }),
    };
}

/**
 * Create a mock annotation body (v3 style)
 */
export function createMockAnnotationBody(config: {
    imageId: string;
    serviceId: string;
}): any {
    return {
        id: config.imageId,
        type: 'Image',
        service: [
            {
                id: config.serviceId,
                type: 'ImageService3',
                profile: 'level1',
            },
        ],
    };
}

/**
 * Create a mock annotation resource (v2 style)
 */
export function createMockAnnotationResource(config: {
    imageId: string;
    serviceId: string;
}): any {
    return {
        '@id': config.imageId,
        '@type': 'dctypes:Image',
        service: {
            '@id': config.serviceId,
            profile: 'http://iiif.io/api/image/2/level1.json',
        },
    };
}
