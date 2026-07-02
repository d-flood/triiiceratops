import { vi } from 'vitest';

/**
 * happy-dom doesn't implement a real 2D canvas context or image decoding, so
 * `composeImages` (draw-to-canvas + toBlob) and the `new Image()` decode step
 * it depends on can't run for real in tests. This stubs just enough of both
 * to exercise the compositing call sites without pixel-level rendering.
 */
export function installCanvasCompositingMocks(): {
    drawImage: ReturnType<typeof vi.fn>;
    restore: () => void;
} {
    const drawImage = vi.fn();

    const getContextSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(
            () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
        );

    const toBlobSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation(function (
            this: HTMLCanvasElement,
            callback: BlobCallback,
            type?: string,
        ) {
            callback(
                new Blob([new Uint8Array([1, 2, 3])], {
                    type: type || 'image/png',
                }),
            );
        });

    const OriginalImage = globalThis.Image;

    class MockImage {
        onload: (() => void) | null = null;
        onerror: ((event?: unknown) => void) | null = null;
        naturalWidth = 100;
        naturalHeight = 100;
        #src = '';

        set src(value: string) {
            this.#src = value;
            queueMicrotask(() => this.onload?.());
        }

        get src() {
            return this.#src;
        }
    }

    // @ts-expect-error test override of a browser global happy-dom doesn't render
    globalThis.Image = MockImage;

    return {
        drawImage,
        restore() {
            getContextSpy.mockRestore();
            toBlobSpy.mockRestore();
            globalThis.Image = OriginalImage;
        },
    };
}
