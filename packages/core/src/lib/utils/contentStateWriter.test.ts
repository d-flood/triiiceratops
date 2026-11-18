import { flushSync } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { configureLogging } from '../logging/logger';
import { ViewerState } from '../state/viewer.svelte';
import { createRendererStub } from '../testing/rendererStub';
import { parseContentState } from './contentState';
import { startContentStateWriter } from './contentStateWriter';

const MANIFEST = 'https://example.org/manifest';
const CANVAS = 'https://example.org/canvas';
const PARAM = 'iiif-content';

let originalUrl: string;
let originalState: unknown;
let stop: (() => void) | undefined;

beforeEach(() => {
    originalUrl = location.href;
    originalState = history.state;
    history.replaceState({ route: 'item' }, '', '/item?host=keep#section');
});

afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    history.replaceState(originalState, '', originalUrl);
});

function viewer() {
    const state = new ViewerState(null, CANVAS);
    state.manifestId = MANIFEST;
    state.visibleCanvasIds = [CANVAS];
    const renderer = createRendererStub({ centre: { x: 500, y: 500 } });
    const move = (x: number) => {
        renderer.setView({ centre: { x, y: 500 } });
        renderer.emitFrame();
    };
    return { state, renderer, move };
}

function writtenValue(param = PARAM) {
    return new URL(location.href).searchParams.get(param);
}

it('writes a changed settled capture once, preserving the host URL and history', () => {
    const { state, renderer, move } = viewer();
    const replace = vi.spyOn(history, 'replaceState');
    const push = vi.spyOn(history, 'pushState');
    const length = history.length;
    stop = startContentStateWriter(state, { param: PARAM, report: vi.fn() });
    state.attachRenderer(renderer);
    renderer.emitFrame();
    expect(replace).not.toHaveBeenCalled();

    const stable = vi.spyOn(renderer, 'isViewStable').mockReturnValue(false);
    move(550);
    expect(replace).not.toHaveBeenCalled();
    stable.mockReturnValue(true);
    renderer.emitFrame();
    expect(replace).toHaveBeenCalledOnce();
    expect(parseContentState(writtenValue()!)).toMatchObject({
        manifestId: MANIFEST,
        canvasId: CANVAS,
        region: { x: 150, y: 200, width: 800, height: 600 },
    });

    const value = writtenValue();
    move(550.1);
    expect(writtenValue()).toBe(value);
    expect(replace).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(history.length).toBe(length);
    expect(history.state).toEqual({ route: 'item' });
    expect(writtenValue('host')).toBe('keep');
    expect(location.hash).toBe('#section');
});

it('uses the current settled view as the baseline on restart and detaches on stop', () => {
    const { state, renderer, move } = viewer();
    const replace = vi.spyOn(history, 'replaceState');
    const options = { param: PARAM, report: vi.fn() };
    state.attachRenderer(renderer);
    stop = startContentStateWriter(state, options);
    move(530);
    expect(replace).toHaveBeenCalledOnce();
    const value = writtenValue();

    stop();
    stop();
    expect(renderer.frameListenerCount).toBe(0);
    move(550);
    expect(replace).toHaveBeenCalledOnce();
    expect(writtenValue()).toBe(value);

    stop = startContentStateWriter(state, options);
    move(550.1);
    expect(replace).toHaveBeenCalledOnce();
    move(570);
    expect(replace).toHaveBeenCalledTimes(2);
});

it('writes to the given parameter', () => {
    const { state, renderer, move } = viewer();
    state.attachRenderer(renderer);
    stop = startContentStateWriter(state, {
        param: 'item-view',
        report: vi.fn(),
    });

    move(550);
    expect(parseContentState(writtenValue('item-view')!)).toMatchObject({
        manifestId: MANIFEST,
        canvasId: CANVAS,
    });
    expect(writtenValue()).toBeNull();
});

it('warns about duplicate parameter claims until all writers release them', () => {
    const sink = vi.fn();
    const stops: Array<() => void> = [];
    function start(param: string) {
        const stopWriter = startContentStateWriter(viewer().state, {
            param,
            report: vi.fn(),
        });
        stops.push(stopWriter);
        return stopWriter;
    }

    configureLogging({ debug: true, sink });
    try {
        const stopFirst = start(PARAM);
        start('item-view');
        expect(sink).not.toHaveBeenCalled();

        const stopSecond = start(PARAM);
        expect(sink).toHaveBeenCalledExactlyOnceWith('warn', [
            expect.stringContaining(PARAM),
        ]);

        stopFirst();
        stopFirst();
        const stopThird = start(PARAM);
        expect(sink).toHaveBeenCalledTimes(2);
        stopSecond();
        stopThird();

        start(PARAM);
        expect(sink).toHaveBeenCalledTimes(2);
    } finally {
        stops.forEach((stopWriter) => stopWriter());
        configureLogging({ debug: false, sink: null });
    }
});

it('ignores null captures while waiting for a baseline', () => {
    const { state, renderer, move } = viewer();
    state.manifestId = null;
    const replace = vi.spyOn(history, 'replaceState');
    stop = startContentStateWriter(state, { param: PARAM, report: vi.fn() });
    state.attachRenderer(renderer);
    renderer.emitFrame();
    state.manifestId = MANIFEST;
    move(530);
    expect(replace).not.toHaveBeenCalled();
    move(550);
    expect(replace).toHaveBeenCalledOnce();
});

it('writes time-only changes after a seek or pause and stays quiet during playback', () => {
    vi.useFakeTimers();
    const { state, renderer, move } = viewer();
    renderer.setView({ scale: 0.5 });
    let playback = { present: true, paused: true, currentTime: 0 };
    const listeners = new Set<() => void>();
    const playhead = (paused: boolean, currentTime: number) => {
        playback = { present: true, paused, currentTime };
        for (const listener of listeners) listener();
    };
    state.registerSdkChrome({ id: 'fake', mount: () => () => {} } as never);
    state.registerTransportChrome({
        id: 'fake:playback',
        icons: {} as never,
        port: {} as never,
        view: () => playback as never,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    });
    const replace = vi.spyOn(history, 'replaceState');
    state.attachRenderer(renderer);
    stop = startContentStateWriter(state, { param: PARAM, report: vi.fn() });
    flushSync();

    playhead(true, 5);
    vi.advanceTimersByTime(199);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(replace).toHaveBeenCalledOnce();
    const value = writtenValue()!;
    expect(
        decodeURIComponent(atob(value.replace(/-/g, '+').replace(/_/g, '/'))),
    ).toContain('#t=5');

    playhead(false, 6);
    move(550);
    vi.advanceTimersByTime(1000);
    expect(replace).toHaveBeenCalledOnce();
    playhead(true, 7);
    vi.advanceTimersByTime(200);
    expect(replace).toHaveBeenCalledTimes(2);
    expect(parseContentState(writtenValue()!)?.time).toEqual({ seconds: 7 });
});

it('reports a refused write once and retries on later settled views', () => {
    const { state, renderer, move } = viewer();
    const error = new DOMException('History write refused', 'SecurityError');
    const refuse = () => {
        throw error;
    };
    const replace = vi
        .spyOn(history, 'replaceState')
        .mockImplementationOnce(refuse)
        .mockImplementationOnce(refuse);
    const report = vi.fn();
    state.attachRenderer(renderer);
    stop = startContentStateWriter(state, { param: PARAM, report });

    move(530);
    move(550);
    expect(writtenValue()).toBeNull();
    move(570);

    expect(replace).toHaveBeenCalledTimes(3);
    expect(writtenValue()).not.toBeNull();
    expect(report).toHaveBeenCalledExactlyOnceWith({
        severity: 'warning',
        scope: 'content-state',
        code: 'content-state-write-failed',
        message: expect.any(String),
        error,
    });
});

it('does not subscribe without a browser', () => {
    const { state, renderer } = viewer();
    state.attachRenderer(renderer);
    vi.stubGlobal('window', undefined);
    try {
        stop = startContentStateWriter(state, {
            param: PARAM,
            report: vi.fn(),
        });
        expect(renderer.frameListenerCount).toBe(0);
    } finally {
        vi.unstubAllGlobals();
    }
});
