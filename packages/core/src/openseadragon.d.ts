// Minimal local typings for OpenSeadragon used in this project.
// This is not exhaustive; it only covers the APIs we reference.
declare module 'openseadragon' {
    // Callable default export that constructs a viewer
    function OpenSeadragon(
        options: OpenSeadragon.Options,
    ): OpenSeadragon.Viewer;
    export default OpenSeadragon;

    export namespace OpenSeadragon {
        interface Options {
            element?: HTMLElement | string;
            tileSources?: unknown;
            prefixUrl?: string;
            showNavigator?: boolean;
            maxZoomPixelRatio?: number;
            minZoomLevel?: number;
            zoomPerClick?: number;
            zoomPerScroll?: number;
            visibilityRatio?: number;
            preserveImageSizeOnResize?: boolean;
            // Allow extra options without typing them all
            [key: string]: any;
        }

        class Point {
            constructor(x: number, y: number);
            x: number;
            y: number;
        }

        interface Drawer {
            canvas?: HTMLCanvasElement;
        }

        interface Viewer {
            drawer: Drawer;
            canvas?: HTMLCanvasElement; // Some builds expose a canvas directly
            addHandler(eventName: string, handler: (event: any) => void): void;
            removeHandler(
                eventName: string,
                handler: (event: any) => void,
            ): void;
            open(tileSource: any): void;
            viewport?: any;
            navigator?: any;
            setFullPage(fullPage: boolean): void;
            isOpen(): boolean;
            // Index signature to accommodate additional properties used indirectly
            [key: string]: any;
        }
    }
}
