import { describe, expect, it, vi } from 'vitest';
import { createRevealSession } from './osdReveal';

type Handler = () => void;

class MockViewer {
    private handlers = new Map<string, Set<Handler>>();

    addHandler(eventName: string, handler: Handler) {
        const set = this.handlers.get(eventName) ?? new Set<Handler>();
        set.add(handler);
        this.handlers.set(eventName, set);
    }

    removeHandler(eventName: string, handler: Handler) {
        const set = this.handlers.get(eventName);
        if (!set) return;
        set.delete(handler);
        if (set.size === 0) this.handlers.delete(eventName);
    }

    emit(eventName: string) {
        const set = this.handlers.get(eventName);
        if (!set) return;
        for (const handler of [...set]) {
            handler();
        }
    }

    getHandlerCount(eventName: string) {
        return this.handlers.get(eventName)?.size ?? 0;
    }
}

describe('createRevealSession', () => {
    it('reveals when open fires', () => {
        const viewer = new MockViewer();
        let currentKey = 'abc';
        const setVisible = vi.fn();

        createRevealSession({
            viewer,
            capturedKey: 'abc',
            getCurrentKey: () => currentKey,
            setViewerImageVisible: setVisible,
        });

        viewer.emit('open');
        expect(setVisible).toHaveBeenCalledTimes(1);
        expect(setVisible).toHaveBeenCalledWith(true);
    });

    it('reveals when tile-drawn fires', () => {
        const viewer = new MockViewer();
        const setVisible = vi.fn();

        createRevealSession({
            viewer,
            capturedKey: 'abc',
            getCurrentKey: () => 'abc',
            setViewerImageVisible: setVisible,
        });

        viewer.emit('tile-drawn');
        expect(setVisible).toHaveBeenCalledTimes(1);
        expect(setVisible).toHaveBeenCalledWith(true);
    });

    it('reveals on timeout when no events fire', () => {
        vi.useFakeTimers();

        const viewer = new MockViewer();
        const setVisible = vi.fn();

        createRevealSession({
            viewer,
            capturedKey: 'abc',
            getCurrentKey: () => 'abc',
            setViewerImageVisible: setVisible,
            timeoutMs: 25,
        });

        vi.advanceTimersByTime(25);
        expect(setVisible).toHaveBeenCalledTimes(1);
        expect(setVisible).toHaveBeenCalledWith(true);

        vi.useRealTimers();
    });

    it('does not reveal when key is stale', () => {
        const viewer = new MockViewer();
        let currentKey = 'abc';
        const setVisible = vi.fn();

        createRevealSession({
            viewer,
            capturedKey: 'abc',
            getCurrentKey: () => currentKey,
            setViewerImageVisible: setVisible,
        });

        currentKey = 'new-key';
        viewer.emit('open');
        expect(setVisible).not.toHaveBeenCalled();
    });

    it('cleans up handlers and timer on cleanup', () => {
        vi.useFakeTimers();

        const viewer = new MockViewer();
        const setVisible = vi.fn();

        const cleanup = createRevealSession({
            viewer,
            capturedKey: 'abc',
            getCurrentKey: () => 'abc',
            setViewerImageVisible: setVisible,
            timeoutMs: 25,
        });

        expect(viewer.getHandlerCount('open')).toBe(1);
        expect(viewer.getHandlerCount('tile-drawn')).toBe(1);
        expect(viewer.getHandlerCount('animation')).toBe(1);
        expect(viewer.getHandlerCount('update-viewport')).toBe(1);

        cleanup();
        expect(viewer.getHandlerCount('open')).toBe(0);
        expect(viewer.getHandlerCount('tile-drawn')).toBe(0);
        expect(viewer.getHandlerCount('animation')).toBe(0);
        expect(viewer.getHandlerCount('update-viewport')).toBe(0);

        vi.advanceTimersByTime(30);
        expect(setVisible).not.toHaveBeenCalled();

        vi.useRealTimers();
    });
});
