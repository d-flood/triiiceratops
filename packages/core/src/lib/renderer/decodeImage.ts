/**
 * Decode a loaded `<img>` before its first draw.
 *
 * Drawing an element that has only loaded makes `drawImage` decode it on the
 * main thread, inside the frame: about 80–125 ms for a 4000×3000 JPEG. An
 * `ImageBitmap` is decoded up front. Where one cannot be made — SVG without
 * intrinsic size, or no `createImageBitmap` — `decode()` warms the element and
 * the element is drawn as before. A cross-origin image without CORS still
 * yields a bitmap, and it taints the canvas exactly as the element would.
 */
export async function decodeImage(
    image: HTMLImageElement,
): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(image);
        } catch {
            // Fall through to the element.
        }
    }
    try {
        await image.decode();
    } catch {
        // The load succeeded, so the element still draws.
    }
    return image;
}
