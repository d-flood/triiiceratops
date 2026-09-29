import { flushSync, mount, unmount } from 'svelte';

import TriiiceratopsViewerElement from './TriiiceratopsViewerElement.svelte';

export type ElementProp = {
    attribute: string;
    type: 'String' | 'Boolean' | 'Object';
    reflect: boolean;
};

export const ELEMENT_PROPS: Record<string, ElementProp> = {
    manifestId: {
        attribute: 'manifest-id',
        type: 'String',
        reflect: true,
    },
    manifestJson: {
        attribute: 'manifest-json',
        type: 'Object',
        reflect: false,
    },
    canvasId: {
        attribute: 'canvas-id',
        type: 'String',
        reflect: true,
    },
    theme: {
        attribute: 'theme',
        type: 'String',
        reflect: true,
    },
    contentState: {
        attribute: 'content-state',
        type: 'String',
        reflect: false,
    },
    // Presence opts in, like `disabled`: `read-content-state-from-url="false"`
    // is still on, so `viewerElementAttributes` omits a false framework prop.
    readContentStateFromUrl: {
        attribute: 'read-content-state-from-url',
        type: 'Boolean',
        reflect: false,
    },
    acceptDroppedContentState: {
        attribute: 'accept-dropped-content-state',
        type: 'Boolean',
        reflect: false,
    },
    themeConfig: {
        attribute: 'theme-config',
        type: 'String',
        reflect: false,
    },
    config: {
        attribute: 'config',
        type: 'String',
        reflect: false,
    },
    initialCanvasRegion: {
        attribute: 'initial-canvas-region',
        type: 'String',
        reflect: false,
    },
    messages: {
        attribute: 'messages',
        type: 'String',
        reflect: false,
    },
    // Function- and array-valued inputs are property-only. Their attributes
    // stay observed but inert: a `String` keeps a stray one harmless, and the
    // wrapper drops any value of the wrong kind.
    loadMessages: {
        attribute: 'loadmessages',
        type: 'String',
        reflect: false,
    },
    searchProvider: {
        attribute: 'searchprovider',
        type: 'String',
        reflect: false,
    },
    plugins: {
        attribute: 'plugins',
        type: 'String',
        reflect: false,
    },
    onpluginerror: {
        attribute: 'onpluginerror',
        type: 'String',
        reflect: false,
    },
    onviewererror: {
        attribute: 'onviewererror',
        type: 'String',
        reflect: false,
    },
};

const PROPERTY_BY_ATTRIBUTE: Record<string, string> = Object.fromEntries(
    Object.entries(ELEMENT_PROPS).map(([key, p]) => [p.attribute, key]),
);

function toProperty(key: string, value: string | null): unknown {
    switch (ELEMENT_PROPS[key]?.type) {
        case 'Boolean':
            return value != null;
        case 'Object':
            return value && JSON.parse(value);
        default:
            return value;
    }
}

function toAttribute({ type }: ElementProp, value: any): string | null {
    switch (type) {
        case 'Boolean':
            return value ? '' : null;
        case 'Object':
            return value == null ? null : JSON.stringify(value);
        default:
            return value;
    }
}

export class ViewerElement extends HTMLElement {
    static get observedAttributes(): string[] {
        return Object.keys(PROPERTY_BY_ATTRIBUTE);
    }

    static {
        for (const key in ELEMENT_PROPS) {
            Object.defineProperty(this.prototype, key, {
                get(this: ViewerElement) {
                    const component = this.#component;
                    return component && key in component
                        ? component[key]
                        : this.#props[key];
                },
                set(this: ViewerElement, value: unknown) {
                    if (
                        ELEMENT_PROPS[key].type === 'Boolean' &&
                        typeof value !== 'boolean'
                    ) {
                        value = value != null;
                    }
                    this.#props[key] = value;
                    if (this.#component) {
                        this.#inputs[key](value);
                        flushSync();
                    }
                },
            });
        }
    }

    #props: Record<string, unknown> = {};
    #inputs: Record<string, (value: unknown) => void> = {};
    #component?: Record<string, any>;
    #connected = false;
    #reflecting = false;
    #stopReflecting?: () => void;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    get viewerState() {
        return this.#component?.viewerState;
    }

    async connectedCallback(): Promise<void> {
        this.#connected = true;
        if (this.#component) return;
        await Promise.resolve();
        if (!this.#connected || this.#component) return;

        for (const { name, value } of this.attributes) {
            const key = PROPERTY_BY_ATTRIBUTE[name] ?? name;
            if (!(key in this.#props))
                this.#props[key] = toProperty(key, value);
        }
        const own = this as unknown as Record<string, unknown>;
        for (const key in ELEMENT_PROPS) {
            if (!(key in this.#props) && own[key] !== undefined) {
                this.#props[key] = own[key];
                delete own[key];
            }
        }

        const props = { ...this.#props };
        for (const key in ELEMENT_PROPS) {
            let value = $state.raw(this.#props[key]);
            this.#inputs[key] = (next) => (value = next);
            Object.defineProperty(props, key, {
                get: () => value,
                enumerable: true,
            });
        }
        const component = mount(TriiiceratopsViewerElement, {
            target: this.shadowRoot!,
            props,
            intro: false,
        }) as Record<string, any>;
        this.#component = component;

        this.#stopReflecting = $effect.root(() => {
            $effect.pre(() => {
                this.#reflecting = true;
                for (const key in ELEMENT_PROPS) {
                    const prop = ELEMENT_PROPS[key];
                    if (!prop.reflect || !(key in component)) continue;
                    const value = toAttribute(
                        prop,
                        (this.#props[key] = component[key]),
                    );
                    if (value == null) this.removeAttribute(prop.attribute);
                    else this.setAttribute(prop.attribute, value);
                }
                this.#reflecting = false;
            });
        });
    }

    attributeChangedCallback(
        name: string,
        _previous: string | null,
        value: string | null,
    ): void {
        if (this.#reflecting) return;
        const key = PROPERTY_BY_ATTRIBUTE[name] ?? name;
        this.#props[key] = toProperty(key, value);
        if (this.#component) this.#inputs[key](this.#props[key]);
    }

    disconnectedCallback(): void {
        this.#connected = false;
        // A move within the DOM reconnects before this runs.
        void Promise.resolve().then(() => {
            if (!this.#connected && this.#component) {
                void unmount(this.#component);
                this.#stopReflecting?.();
                this.#component = undefined;
            }
        });
    }
}
