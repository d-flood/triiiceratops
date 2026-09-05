// Lit adapter unit tests.
//
// Drives SelectorController through a fake ReactiveControllerHost against the
// SDK's real selector runtime and a deterministic fake viewer state: initial
// value, host-update requests after a command, equality-gate suppression of
// no-op updates, and disconnect stopping updates. Real LitElement lifecycle is
// proven at the packed seam (the plugin-lit fixture).

import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SelectorController } from './lit.js';
import {
    makeFakeHarness,
    selectToolbarOpen,
    type FakeHarness,
} from './test/fakeViewerState.js';

/** Minimal ReactiveControllerHost that records requestUpdate calls. */
class FakeHost implements ReactiveControllerHost {
    updates = 0;
    connected = false;
    #controllers: ReactiveController[] = [];

    addController(controller: ReactiveController): void {
        this.#controllers.push(controller);
        if (this.connected) controller.hostConnected?.();
    }
    removeController(controller: ReactiveController): void {
        this.#controllers = this.#controllers.filter((c) => c !== controller);
    }
    requestUpdate(): void {
        this.updates += 1;
    }
    get updateComplete(): Promise<boolean> {
        return Promise.resolve(true);
    }

    connect(): void {
        this.connected = true;
        for (const c of this.#controllers) c.hostConnected?.();
    }
    disconnect(): void {
        this.connected = false;
        for (const c of this.#controllers) c.hostDisconnected?.();
    }
}

let harness: FakeHarness;
let host: FakeHost;

beforeEach(() => {
    harness = makeFakeHarness();
    host = new FakeHost();
});

afterEach(() => {
    harness.runtime.dispose();
});

function makeController() {
    return new SelectorController(
        host,
        harness.context.selectors.select(selectToolbarOpen),
    );
}

describe('SelectorController (Lit)', () => {
    it('exposes the initial selected value before connect', () => {
        const controller = makeController();
        expect(controller.value).toBe(false);
    });

    it('requests a host update after a command changes the selected member', () => {
        const controller = makeController();
        host.connect();
        harness.state.toggleToolbar();
        expect(controller.value).toBe(true);
        expect(host.updates).toBe(1);
    });

    it('the equality gate suppresses host updates for an unselected change', () => {
        const controller = makeController();
        host.connect();
        harness.state.bumpCounter();
        expect(controller.value).toBe(false);
        expect(host.updates).toBe(0);
    });

    it('stops requesting updates after host disconnect', () => {
        makeController();
        host.connect();
        host.disconnect();
        harness.state.toggleToolbar();
        expect(host.updates).toBe(0);
    });

    it('re-subscribes on reconnect', () => {
        const controller = makeController();
        host.connect();
        host.disconnect();
        host.connect();
        harness.state.toggleToolbar();
        expect(controller.value).toBe(true);
        expect(host.updates).toBe(1);
    });
});
