export const REVEAL_FALLBACK_MS = 1500;

const REVEAL_EVENTS = ['open', 'tile-drawn', 'animation', 'update-viewport'];

type OSDLikeViewer = {
    addHandler: (eventName: string, handler: () => void) => void;
    removeHandler: (eventName: string, handler: () => void) => void;
};

type RevealSessionParams = {
    viewer: OSDLikeViewer;
    capturedKey: string;
    getCurrentKey: () => string;
    setViewerImageVisible: (isVisible: boolean) => void;
    timeoutMs?: number;
};

export function createRevealSession({
    viewer,
    capturedKey,
    getCurrentKey,
    setViewerImageVisible,
    timeoutMs = REVEAL_FALLBACK_MS,
}: RevealSessionParams): () => void {
    let disposed = false;
    let revealed = false;
    const handlers = new Map<string, () => void>();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
        if (disposed) return;
        disposed = true;

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        for (const [eventName, handler] of handlers.entries()) {
            viewer.removeHandler(eventName, handler);
        }
        handlers.clear();
    };

    const revealIfCurrent = () => {
        if (revealed || disposed) return;
        revealed = true;
        cleanup();
        if (capturedKey !== getCurrentKey()) return;
        setViewerImageVisible(true);
    };

    for (const eventName of REVEAL_EVENTS) {
        const handler = () => revealIfCurrent();
        handlers.set(eventName, handler);
        viewer.addHandler(eventName, handler);
    }

    timeoutId = setTimeout(revealIfCurrent, timeoutMs);

    return cleanup;
}
