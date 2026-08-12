import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissible } from './dismissible';

function mount(): { overlay: HTMLElement; trigger: HTMLButtonElement } {
    const trigger = document.createElement('button');
    trigger.textContent = 'open';
    const overlay = document.createElement('div');
    document.body.append(trigger, overlay);
    return { overlay, trigger };
}

afterEach(() => {
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
