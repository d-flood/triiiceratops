/**
 * One template ref, two viewers (SPEC user story 36).
 *
 * Vue's handle is an ordinary template ref rather than a wrapper-owned prop, so
 * nothing in the component's signature stops a consumer from putting the same
 * ref on two `<TriiiceratopsViewer>`s — and Vue itself would simply let the
 * second mount overwrite the box, leaving every composable reading through it
 * following whichever viewer mounted last. These tests pin the opposite: the
 * second viewer raises `TriiiceratopsHandleConflictError` naming both elements,
 * framework-natively, and the shapes where sharing is legitimate stay silent.
 *
 * Driven through `createApp` against the REAL custom element, like the rest of
 * the Vue suite, so ownership is measured on the same mount path a consumer
 * gets rather than on a component double.
 */

import {
    createApp,
    defineComponent,
    h,
    KeepAlive,
    nextTick,
    shallowRef,
} from 'vue';
import type { App, VNode } from 'vue';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { TriiiceratopsHandleConflictError } from '../framework/index.js';
import type { TriiiceratopsViewerInstance } from './handle.js';
import { TriiiceratopsViewer } from './viewer.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

let container: HTMLDivElement;
let app: App | null = null;
let captured: unknown[] = [];

beforeAll(() => {
    installInertAnimations();
    defineRealViewerElement();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    captured = [];
});

afterEach(async () => {
    app?.unmount();
    app = null;
    container.remove();
    await settle(0);
});

/**
 * Mount, routing every error Vue catches into `captured` instead of the
 * console — the same seam a real application's `app.config.errorHandler` is.
 */
async function mount(component: Parameters<typeof createApp>[0]): Promise<App> {
    app = createApp(component);
    app.config.errorHandler = (error) => {
        captured.push(error);
    };
    app.mount(container);
    await settle();
    await nextTick();
    return app;
}

function conflicts(): TriiiceratopsHandleConflictError[] {
    return captured.filter(
        (error): error is TriiiceratopsHandleConflictError =>
            error instanceof TriiiceratopsHandleConflictError,
    );
}

function viewerElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(VIEWER_TAG));
}

describe('one template ref on two viewers', () => {
    it('raises TriiiceratopsHandleConflictError naming both elements', async () => {
        const handle = shallowRef<TriiiceratopsViewerInstance | null>(null);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                id: 'viewer-a',
                                ref: handle,
                            }),
                            h(TriiiceratopsViewer, {
                                id: 'viewer-b',
                                ref: handle,
                            }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toHaveLength(1);
        const failure = conflicts()[0];
        expect(failure.name).toBe('TriiiceratopsHandleConflictError');
        expect(failure.code).toBe('VIEWER_HANDLE_CONFLICT');
        expect(failure.message).toContain('id="viewer-a"');
        expect(failure.message).toContain('id="viewer-b"');
    });

    it('leaves the first viewer bound and usable', async () => {
        const handle = shallowRef<TriiiceratopsViewerInstance | null>(null);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                id: 'viewer-a',
                                ref: handle,
                            }),
                            h(TriiiceratopsViewer, {
                                id: 'viewer-b',
                                ref: handle,
                            }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toHaveLength(1);
        // The FIRST viewer keeps its binding: the conflict is the second
        // viewer's mistake, and resolving it must not require a reload.
        const elements = viewerElements();
        expect(elements).toHaveLength(2);
        expect(elements[0].id).toBe('viewer-a');
        const state = (elements[0] as { viewerState?: unknown }).viewerState;
        expect(state).toBeDefined();
    });

    it('raises it for a string ref used twice in one component', async () => {
        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                id: 'viewer-a',
                                ref: 'viewer',
                            }),
                            h(TriiiceratopsViewer, {
                                id: 'viewer-b',
                                ref: 'viewer',
                            }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toHaveLength(1);
        expect(conflicts()[0].message).toContain('id="viewer-b"');
    });
});

describe('sharing that is legitimate stays silent', () => {
    it('allows two viewers with two separate refs', async () => {
        const first = shallowRef<TriiiceratopsViewerInstance | null>(null);
        const second = shallowRef<TriiiceratopsViewerInstance | null>(null);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                id: 'viewer-a',
                                ref: first,
                            }),
                            h(TriiiceratopsViewer, {
                                id: 'viewer-b',
                                ref: second,
                            }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toEqual([]);
        expect(first.value?.element?.id).toBe('viewer-a');
        expect(second.value?.element?.id).toBe('viewer-b');
    });

    it('allows the same ref NAME in two different components', async () => {
        const Host = defineComponent({
            props: { viewerId: { type: String, required: true } },
            setup(props) {
                return (): VNode =>
                    h(TriiiceratopsViewer, {
                        id: props.viewerId,
                        ref: 'viewer',
                    });
            },
        });

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(Host, { viewerId: 'viewer-a' }),
                            h(Host, { viewerId: 'viewer-b' }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toEqual([]);
    });

    it('allows one ref across a v-for, where Vue collects an array', async () => {
        const handles = shallowRef<TriiiceratopsViewerInstance[]>([]);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h(
                            'div',
                            null,
                            ['viewer-a', 'viewer-b'].map((id) =>
                                h(TriiiceratopsViewer, {
                                    id,
                                    key: id,
                                    ref: handles,
                                    // What `v-for` compiles to: every match is
                                    // collected, so sharing is the intent.
                                    ref_for: true,
                                }),
                            ),
                        );
                },
            }),
        );

        expect(conflicts()).toEqual([]);
        expect(handles.value).toHaveLength(2);
    });

    it('allows one CALLBACK ref serving two viewers', async () => {
        const seen: string[] = [];
        const collect = (instance: unknown): void => {
            const element = (instance as TriiiceratopsViewerInstance | null)
                ?.element;
            if (element) seen.push(element.id);
        };

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                id: 'viewer-a',
                                ref: collect,
                            }),
                            h(TriiiceratopsViewer, {
                                id: 'viewer-b',
                                ref: collect,
                            }),
                        ]);
                },
            }),
        );

        expect(conflicts()).toEqual([]);
        expect(seen.sort()).toEqual(['viewer-a', 'viewer-b']);
    });

    it('lets a later viewer claim a ref the previous one released', async () => {
        const handle = shallowRef<TriiiceratopsViewerInstance | null>(null);
        const showFirst = shallowRef(true);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h(
                            'div',
                            null,
                            showFirst.value
                                ? [
                                      h(TriiiceratopsViewer, {
                                          id: 'viewer-a',
                                          key: 'a',
                                          ref: handle,
                                      }),
                                  ]
                                : [
                                      h(TriiiceratopsViewer, {
                                          id: 'viewer-b',
                                          key: 'b',
                                          ref: handle,
                                      }),
                                  ],
                        );
                },
            }),
        );

        expect(conflicts()).toEqual([]);
        expect(handle.value?.element?.id).toBe('viewer-a');

        showFirst.value = false;
        await settle();
        await nextTick();

        expect(conflicts()).toEqual([]);
        expect(handle.value?.element?.id).toBe('viewer-b');
    });

    it('survives a <KeepAlive> round trip of the same viewer', async () => {
        const handle = shallowRef<TriiiceratopsViewerInstance | null>(null);
        const active = shallowRef(true);

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h(KeepAlive, null, {
                            default: () =>
                                active.value
                                    ? h(TriiiceratopsViewer, {
                                          id: 'viewer-a',
                                          ref: handle,
                                      })
                                    : null,
                        });
                },
            }),
        );

        expect(handle.value?.element?.id).toBe('viewer-a');

        // Deactivate, then reactivate. `<KeepAlive>` never unmounts, so nothing
        // releases the ref except the deactivation hook.
        active.value = false;
        await settle();
        await nextTick();
        active.value = true;
        await settle();
        await nextTick();

        expect(conflicts()).toEqual([]);
        expect(handle.value?.element?.id).toBe('viewer-a');
    });

    it('lets a <KeepAlive> swap hand one ref to the incoming viewer', async () => {
        // The cached viewer is deactivated, not unmounted, and Vue has already
        // cleared the ref for it — so it must not go on owning the box the
        // viewer taking its place is about to be written into.
        const handle = shallowRef<TriiiceratopsViewerInstance | null>(null);
        const which = shallowRef('a');

        await mount(
            defineComponent({
                setup() {
                    return (): VNode =>
                        h(KeepAlive, null, {
                            default: () =>
                                h(TriiiceratopsViewer, {
                                    id: `viewer-${which.value}`,
                                    key: which.value,
                                    ref: handle,
                                }),
                        });
                },
            }),
        );

        expect(handle.value?.element?.id).toBe('viewer-a');

        which.value = 'b';
        await settle();
        await nextTick();

        expect(conflicts()).toEqual([]);
        expect(handle.value?.element?.id).toBe('viewer-b');
    });
});
