import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, type LogLevel } from '../logging/logger.js';
import { createViewerHandleSlot } from './handle.js';
import type { TriiiceratopsViewerElement, ViewerHandle } from './types.js';

/**
 * The consumer-created handle slot and its three lifecycle rules.
 *
 * The slot is deliberately framework-neutral and DOM-light: what it owns is
 * ownership itself — which viewer may publish into it, and what a consumer
 * reads while nobody has. Real elements are used for the identity rules only,
 * so the conflict diagnostic names something a developer can actually find on
 * the page.
 */

function fakeElement(id: string): TriiiceratopsViewerElement {
    const element = document.createElement('triiiceratops-viewer');
    element.setAttribute('id', id);
    return element as unknown as TriiiceratopsViewerElement;
}

function handleFor(element: TriiiceratopsViewerElement): ViewerHandle {
    return {
        element,
        state: {} as ViewerHandle['state'],
    };
}

function captureLogs(): Array<{ level: LogLevel; message: string }> {
    const records: Array<{ level: LogLevel; message: string }> = [];
    configureLogging({
        debug: true,
        sink: (level, args) => records.push({ level, message: args.join(' ') }),
    });
    return records;
}

afterEach(() => {
    configureLogging({ debug: false, sink: null });
    vi.useRealTimers();
});

describe('handle slot reads', () => {
    it('reads null until a viewer publishes, and is reference-stable', () => {
        const slot = createViewerHandleSlot();
        expect(slot.get()).toBeNull();
        expect(slot.get()).toBe(slot.get());

        const element = fakeElement('a');
        const handle = handleFor(element);
        slot.claim(element).publish(handle);

        expect(slot.get()).toBe(handle);
        expect(slot.get()).toBe(handle);
    });

    it('wakes subscribers only when the published handle changes', () => {
        const slot = createViewerHandleSlot();
        const woke = vi.fn();
        const unsubscribe = slot.subscribe(woke);

        const element = fakeElement('a');
        const claim = slot.claim(element);
        const handle = handleFor(element);
        claim.publish(handle);
        expect(woke).toHaveBeenCalledTimes(1);

        claim.publish(handle);
        expect(woke).toHaveBeenCalledTimes(1);

        claim.publish(handleFor(element));
        expect(woke).toHaveBeenCalledTimes(2);

        unsubscribe();
        unsubscribe();
        claim.publish(handleFor(element));
        expect(woke).toHaveBeenCalledTimes(2);
    });
});

describe('a second viewer claiming a bound handle', () => {
    it('throws, naming both elements', () => {
        const slot = createViewerHandleSlot();
        const first = fakeElement('viewer-one');
        const second = fakeElement('viewer-two');
        slot.claim(first);

        let thrown: unknown;
        try {
            slot.claim(second);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toMatchObject({
            name: 'TriiiceratopsHandleConflictError',
            code: 'VIEWER_HANDLE_CONFLICT',
        });
        // Ambiguous ownership must be findable, not just reported.
        expect((thrown as Error).message).toContain('id="viewer-one"');
        expect((thrown as Error).message).toContain('id="viewer-two"');
    });

    it('lets the same element re-claim, so a strict-mode remount is fine', () => {
        const slot = createViewerHandleSlot();
        const element = fakeElement('viewer-one');
        const first = slot.claim(element);
        first.publish(handleFor(element));

        expect(() => slot.claim(element)).not.toThrow();
    });

    it('does not corrupt the published handle when a conflicting claim throws', () => {
        const slot = createViewerHandleSlot();
        const first = fakeElement('viewer-one');
        const handle = handleFor(first);
        slot.claim(first).publish(handle);

        expect(() => slot.claim(fakeElement('viewer-two'))).toThrow();
        expect(slot.get()).toBe(handle);
    });
});

describe('unbinding and rebinding', () => {
    it('reverts to unbound on release and accepts a new viewer', () => {
        const slot = createViewerHandleSlot();
        const woke = vi.fn();
        slot.subscribe(woke);

        const first = fakeElement('viewer-one');
        const firstClaim = slot.claim(first);
        firstClaim.publish(handleFor(first));
        expect(slot.get()?.element).toBe(first);

        firstClaim.release();
        expect(slot.get()).toBeNull();

        // A remount — a different element for the same logical viewer.
        const second = fakeElement('viewer-two');
        const secondClaim = slot.claim(second);
        const rebound = handleFor(second);
        secondClaim.publish(rebound);

        expect(slot.get()).toBe(rebound);
        expect(woke).toHaveBeenCalledTimes(3);
    });

    it('ignores a released claim that publishes late', () => {
        const slot = createViewerHandleSlot();
        const first = fakeElement('viewer-one');
        const firstClaim = slot.claim(first);
        firstClaim.release();
        firstClaim.release();

        const second = fakeElement('viewer-two');
        const handle = handleFor(second);
        slot.claim(second).publish(handle);

        // The unmounted viewer's stale claim must not clobber the live one.
        firstClaim.publish(handleFor(first));
        firstClaim.release();
        expect(slot.get()).toBe(handle);
    });
});

describe('the never-bound development warning', () => {
    it('warns once when the handle is never passed to a viewer', () => {
        vi.useFakeTimers();
        const records = captureLogs();
        const slot = createViewerHandleSlot();

        slot.armUnboundWarning();
        vi.runAllTimers();

        const warnings = records.filter((r) => r.level === 'warn');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('never passed');

        // Arming again after the warning does not repeat it.
        slot.armUnboundWarning();
        vi.runAllTimers();
        expect(records.filter((r) => r.level === 'warn')).toHaveLength(1);
    });

    it('stays silent once a viewer claims the handle', () => {
        vi.useFakeTimers();
        const records = captureLogs();
        const slot = createViewerHandleSlot();

        slot.armUnboundWarning();
        slot.claim(fakeElement('viewer-one'));
        vi.runAllTimers();

        expect(records.filter((r) => r.level === 'warn')).toHaveLength(0);
    });

    it('stays silent when the arming is cancelled', () => {
        vi.useFakeTimers();
        const records = captureLogs();
        const slot = createViewerHandleSlot();

        const cancel = slot.armUnboundWarning();
        cancel();
        cancel();
        vi.runAllTimers();

        expect(records.filter((r) => r.level === 'warn')).toHaveLength(0);
    });

    it('stays silent outside development', () => {
        vi.useFakeTimers();
        const records: unknown[] = [];
        configureLogging({ debug: false, sink: () => records.push(1) });
        const slot = createViewerHandleSlot();

        slot.armUnboundWarning();
        vi.runAllTimers();

        expect(records).toHaveLength(0);
    });
});
