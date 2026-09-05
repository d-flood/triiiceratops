// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function markPoint(context: PluginContext, canvasId: string) {
    const at = { x: 600, y: 450 }; // canvas space, as an annotation stores it

    return context.viewerState.registerOverlayLayer({
        // The prefix is the id the viewer knows this plugin by — never a literal.
        id: `${context.surface.id}:markers`,
        mount: (container: HTMLElement) => {
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.textContent = 'Analysis point 1';
            // The layer is transparent to pointer events; this child opts in.
            pin.style.cssText =
                'position:absolute;pointer-events:auto;transform:translate(-50%,-50%)';
            container.append(pin);

            const place = () => {
                const point = context.viewerState.canvasToScreen(at, canvasId);
                // `null` means that canvas is not laid out — one honest branch.
                pin.hidden = point === null;
                if (point) {
                    pin.style.left = `${point.x}px`;
                    pin.style.top = `${point.y}px`;
                }
            };

            place();
            // The `frame` cadence: the image moved. This write lands in the same
            // frame the tiles are painted in, so the pin does not trail them.
            const stop = context.viewerState.subscribeFrame(place);

            return () => {
                stop();
                pin.remove();
            };
        },
    });
}
