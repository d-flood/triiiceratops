import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissible } from './dismissible';
import { createFocusMemory, type ViewerFocusMemory } from './focusMemory';

function mount(): { overlay: HTMLElement; trigger: HTMLButtonElement } {
    const trigger = document.createElement('button');
    trigger.textContent = 'open';
    const overlay = document.createElement('div');
    document.body.append(trigger, overlay);
    return { overlay, trigger };
}

/** Stands in for the viewer's own memory, scoped to the test's DOM. */
function focusMemoryOn(scope: HTMLElement): ViewerFocusMemory {
    const memory = createFocusMemory();
    memory.attach(scope);
    memories.push(memory);
    return memory;
}

let memories: ViewerFocusMemory[] = [];

afterEach(() => {
    for (const memory of memories) memory.destroy();
    memories = [];
    document.body.innerHTML = '';
});

describe('dismissible', () => {
    it('dismisses on Escape and returns focus to the invoker', () => {
        const { overlay, trigger } = mount();
        const onDismiss = vi.fn();
        const action = dismissible(overlay, { onDismiss, invoker: trigger });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(onDismiss).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(trigger);
        action.destroy();
    });

    it('ignores keys other than Escape', () => {
        const { overlay } = mount();
        const onDismiss = vi.fn();
        const action = dismissible(overlay, { onDismiss });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );

        expect(onDismiss).not.toHaveBeenCalled();
        action.destroy();
    });

    it('keeps Escape from reaching a parent overlay', () => {
        const { overlay } = mount();
        const parentHeard = vi.fn();
        document.body.addEventListener('keydown', parentHeard);
        const action = dismissible(overlay, { onDismiss: () => {} });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(parentHeard).not.toHaveBeenCalled();
        document.body.removeEventListener('keydown', parentHeard);
        action.destroy();
    });

    it('dismisses on a pointer press outside', () => {
        const { overlay } = mount();
        const onDismiss = vi.fn();
        const action = dismissible(overlay, { onDismiss });

        document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        );

        expect(onDismiss).toHaveBeenCalledOnce();
        action.destroy();
    });

    it('does not dismiss on a press inside, or on a declared trigger', () => {
        const { overlay, trigger } = mount();
        const inner = document.createElement('span');
        overlay.append(inner);
        const onDismiss = vi.fn();
        const action = dismissible(overlay, { onDismiss, within: [trigger] });

        inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        trigger.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        );

        expect(onDismiss).not.toHaveBeenCalled();
        action.destroy();
    });

    it('moves focus into the overlay on mount, making it focusable if needed', () => {
        const { overlay } = mount();
        const action = dismissible(overlay, { onDismiss: () => {} });

        expect(overlay.tabIndex).toBe(-1);
        expect(document.activeElement).toBe(overlay);
        action.destroy();
    });

    it('leaves focus alone when focusOnMount is off', () => {
        const { overlay, trigger } = mount();
        trigger.focus();
        const action = dismissible(overlay, {
            onDismiss: () => {},
            focusOnMount: false,
        });

        expect(document.activeElement).toBe(trigger);
        action.destroy();
    });

    it('falls back to whatever had focus when no invoker is given', () => {
        const { overlay, trigger } = mount();
        trigger.focus();
        const action = dismissible(overlay, { onDismiss: () => {} });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(document.activeElement).toBe(trigger);
        action.destroy();
    });

    it('resolves the opener through the shadow root, not the host', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const trigger = document.createElement('button');
        const overlay = document.createElement('div');
        shadow.append(trigger, overlay);
        trigger.focus();

        const action = dismissible(overlay, { onDismiss: () => {} });
        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        // `document.activeElement` here is the host; the trigger is what the
        // reader actually left.
        expect(shadow.activeElement).toBe(trigger);
        action.destroy();
    });

    it('exposes a dismiss() so a close button returns focus by the same rule', () => {
        const { overlay, trigger } = mount();
        const onDismiss = vi.fn();
        const controls: { dismiss?: () => void } = {};
        const action = dismissible(overlay, {
            onDismiss,
            invoker: trigger,
            controls,
        });

        // A close button calling `onDismiss` directly skips the focus return —
        // which is how the panel close button dropped focus to <body>.
        controls.dismiss?.();

        expect(onDismiss).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(trigger);
        action.destroy();
    });

    it('re-resolves the invoker by identity, so a rebuilt control still gets focus', () => {
        const { overlay, trigger } = mount();
        trigger.dataset.panelToggle = 'metadata';
        trigger.focus();
        const action = dismissible(overlay, {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusMemory: focusMemoryOn(document.body),
        });

        // The toolbar is torn down and rebuilt while the overlay is open — the
        // node captured at mount is gone, its twin is not.
        trigger.remove();
        const rebuilt = document.createElement('button');
        rebuilt.dataset.panelToggle = 'metadata';
        document.body.append(rebuilt);

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(document.activeElement).toBe(rebuilt);
        action.destroy();
    });

    it("takes focus with focusOnMount 'orphaned' only when the invoker was destroyed", () => {
        const { overlay, trigger } = mount();
        const focusMemory = focusMemoryOn(document.body);
        trigger.dataset.panelToggle = 'metadata';
        trigger.focus();
        const options = {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusOnMount: 'orphaned' as const,
            focusMemory,
        };

        // Invoker still standing: focus stays on it.
        const surviving = dismissible(overlay, options);
        expect(document.activeElement).toBe(trigger);
        surviving.destroy();

        // Invoker destroyed by the state change that opened the overlay: focus
        // is on <body> with nowhere to go, so the overlay takes it and Escape
        // becomes reachable without tabbing in.
        trigger.remove();
        const orphaned = dismissible(overlay, options);
        expect(document.activeElement).toBe(overlay);
        orphaned.destroy();
    });

    it("leaves focus alone with 'orphaned' when nothing was focused at all", () => {
        // A panel opened programmatically must not steal focus on load.
        const { overlay } = mount();
        const focusMemory = focusMemoryOn(document.body);
        const elsewhere = document.createElement('button');
        document.body.append(elsewhere);
        elsewhere.focus();

        const action = dismissible(overlay, {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusOnMount: 'orphaned',
            focusMemory,
        });

        expect(document.activeElement).toBe(elsewhere);
        action.destroy();
    });

    it("does not treat 'orphaned' as any removed control, only the invoker", () => {
        // Something unrelated was removed while it had focus (a toolbar overflow
        // collapsing, say). That is not this panel's invoker, so there is no
        // reason to believe the reader was sent here — leave focus be.
        const { overlay, trigger } = mount();
        const focusMemory = focusMemoryOn(document.body);
        trigger.dataset.panelToggle = 'search';
        trigger.focus();
        trigger.remove();

        const action = dismissible(overlay, {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusOnMount: 'orphaned',
            focusMemory,
        });

        expect(document.activeElement).not.toBe(overlay);
        action.destroy();
    });

    it('resolves the invoker only within its own viewer', () => {
        // Two viewers on one page: identity is unique per viewer, not per
        // document, so a document-wide lookup lands in the wrong one.
        const other = document.createElement('div');
        const otherToggle = document.createElement('button');
        otherToggle.dataset.panelToggle = 'metadata';
        other.append(otherToggle);
        const mine = document.createElement('div');
        const overlay = document.createElement('div');
        mine.append(overlay);
        document.body.append(other, mine);

        const action = dismissible(overlay, {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusMemory: focusMemoryOn(mine),
        });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(document.activeElement).not.toBe(otherToggle);
        action.destroy();
    });

    it('prefers the live opener over the toggle its identity names', () => {
        // Opened from somewhere other than the toolbar toggle: focus belongs
        // back on the control the reader actually left.
        const { overlay, trigger } = mount();
        const toolbarToggle = document.createElement('button');
        toolbarToggle.dataset.panelToggle = 'metadata';
        document.body.append(toolbarToggle);
        trigger.focus();

        const action = dismissible(overlay, {
            onDismiss: () => {},
            invokerSelector: '[data-panel-toggle="metadata"]',
            focusMemory: focusMemoryOn(document.body),
        });

        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(document.activeElement).toBe(trigger);
        action.destroy();
    });

    it('stops listening once destroyed', () => {
        const { overlay } = mount();
        const onDismiss = vi.fn();
        dismissible(overlay, { onDismiss }).destroy();

        document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        );
        overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );

        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('honours options changed after mount', () => {
        const { overlay } = mount();
        const onDismiss = vi.fn();
        const action = dismissible(overlay, { onDismiss });

        action.update({ onDismiss, outsidePointer: false });
        document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        );

        expect(onDismiss).not.toHaveBeenCalled();
        action.destroy();
    });
});
