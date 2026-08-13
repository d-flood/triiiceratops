/**
 * Lit adapter (`@triiiceratops/plugin-sdk/lit`).
 *
 * Exposes the SDK's memoized, equality-gated selector contract as a
 * Lit `ReactiveController` that requests a host update whenever the selected
 * value changes and unsubscribes when the host disconnects.
 *
 * This module imports NO framework runtime — the `ReactiveController` /
 * `ReactiveControllerHost` shapes are `lit` TYPES (erased at build), and the
 * controller drives the host purely through the `addController` /
 * `requestUpdate` methods passed to it. It never imports another framework
 * adapter, the SDK base entry, or core's Svelte reactivity (ADR 0008): the sole
 * reactive source is a `Selector` from `PluginContext.selectors`.
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Selector } from 'triiiceratops';

/**
 * A `ReactiveController` bound to one selector.
 *
 * Read the latest selected value from {@link value} inside the host's `render`.
 * The controller subscribes on host connect and requests a host update on each
 * gated change; it unsubscribes on host disconnect, so a disconnected host
 * receives no further updates.
 *
 * @example
 * ```ts
 * class MyPanel extends LitElement {
 *   #open = new SelectorController(this, this.context.selectors.select(s => s.toolbarOpen));
 *   render() { return html`${this.#open.value ? 'open' : 'closed'}`; }
 * }
 * ```
 */
export class SelectorController<T> implements ReactiveController {
    /** The current selected value; read this from the host's `render`. */
    value: T;

    #host: ReactiveControllerHost;
    #selector: Selector<T>;
    #unsubscribe: (() => void) | null = null;

    constructor(host: ReactiveControllerHost, selector: Selector<T>) {
        this.#host = host;
        this.#selector = selector;
        this.value = selector.get();
        host.addController(this);
    }

    hostConnected(): void {
        // Sync in case state changed while disconnected, then track changes.
        this.value = this.#selector.get();
        this.#unsubscribe = this.#selector.subscribe((value) => {
            this.value = value;
            this.#host.requestUpdate();
        });
    }

    hostDisconnected(): void {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
    }
}
