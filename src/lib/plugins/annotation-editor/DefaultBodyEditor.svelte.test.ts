import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import DefaultBodyEditor from './DefaultBodyEditor.svelte';
import AnnotationEditorPanel from './AnnotationEditorPanel.svelte';
import AnnotationEditorController from './AnnotationEditorController.svelte';
import type { AnnotationBodyEditorApi, DrawingTool } from './types';
import { VIEWER_STATE_KEY } from '../../state/viewer.svelte';

const runtimeContext = {
    manifestId: 'manifest-1',
    canvasId: 'canvas-1',
    isEditing: false,
    selectedAnnotation: null,
    hostContext: null,
};

function makeApi(overrides: Partial<AnnotationBodyEditorApi> = {}) {
    return {
        annotation: {
            id: 'anno-1',
            type: 'Annotation',
            body: [],
            target: { source: 'canvas-1' },
        },
        bodies: [],
        context: runtimeContext,
        isHydrating: false,
        save: vi.fn(async () => {}),
        cancel: vi.fn(),
        requestDelete: vi.fn(),
        ...overrides,
    } satisfies AnnotationBodyEditorApi;
}

function panelProps(overrides: Record<string, unknown> = {}) {
    return {
        isEditing: false,
        activeTool: 'rectangle' as const,
        selectedAnnotation: null as any,
        showDeleteConfirm: false,
        isHydratingSelection: false,
        canCreateAnnotation: true,
        createDisabledReason: null,
        persistenceError: null,
        bodyEditor: null,
        runtimeContext,
        onDismissError: vi.fn(),
        canUndo: false,
        canRedo: false,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        availableTools: ['rectangle', 'polygon', 'point'] as DrawingTool[],
        onToggleEditing: vi.fn(),
        onSetTool: vi.fn(),
        onSaveBodies: vi.fn(),
        onCancelSelection: vi.fn(),
        onRequestDelete: vi.fn(),
        onConfirmDelete: vi.fn(),
        onCancelDelete: vi.fn(),
        embedded: false,
        ...overrides,
    };
}

describe('DefaultBodyEditor', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('preserves unknown structured bodies when saving an edited sibling body', async () => {
        const structuredBody = {
            type: 'Dataset',
            value: { rows: [{ label: 'A' }] },
        };
        const save = vi.fn(async () => {});
        const api = makeApi({
            bodies: [
                structuredBody,
                {
                    type: 'TextualBody',
                    purpose: 'commenting',
                    value: 'draft note',
                },
            ],
            save,
        });

        const app = mount(DefaultBodyEditor, { target, props: { api } });
        await tick();

        expect(target.textContent).toContain('shown read-only');

        const textarea = target.querySelector('textarea');
        if (!textarea) throw new Error('expected textarea');
        textarea.value = 'edited note';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        const saveButton = Array.from(target.querySelectorAll('button')).find(
            (button) => button.textContent?.includes('Save Changes'),
        );
        saveButton?.click();
        await tick();

        expect(save).toHaveBeenCalledWith([
            structuredBody,
            {
                type: 'TextualBody',
                purpose: 'commenting',
                value: 'edited note',
            },
        ]);

        await unmount(app);
    });

    it('limits the built-in purpose choices to configured purposes', async () => {
        const api = makeApi({
            bodies: [
                {
                    type: 'TextualBody',
                    purpose: 'tagging',
                    value: 'tag one',
                },
            ],
        });

        const app = mount(DefaultBodyEditor, {
            target,
            props: { api, purposes: ['tagging'] },
        });
        await tick();

        const options = Array.from(target.querySelectorAll('option')).map(
            (option) => option.value,
        );
        expect(options).toEqual(['tagging']);

        await unmount(app);
    });

    it('hides the add-content action when multiple bodies are disabled without dropping existing bodies', async () => {
        const api = makeApi({
            bodies: [
                {
                    type: 'TextualBody',
                    purpose: 'commenting',
                    value: 'first',
                },
                {
                    type: 'TextualBody',
                    purpose: 'tagging',
                    value: 'second',
                },
            ],
        });

        const app = mount(DefaultBodyEditor, {
            target,
            props: { api, allowMultipleBodies: false },
        });
        await tick();

        expect(target.textContent).not.toContain('Add Content');
        const values = Array.from(
            target.querySelectorAll('textarea, input'),
        ).map(
            (input) => (input as HTMLInputElement | HTMLTextAreaElement).value,
        );
        expect(values).toContain('first');
        expect(values).toContain('second');

        await unmount(app);
    });
});

describe('AnnotationEditorPanel body editor host', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('passes the api to Svelte component body editors', async () => {
        const onSaveBodies = vi.fn(async () => {});
        const props = $state(
            panelProps({
                selectedAnnotation: {
                    id: 'anno-1',
                    type: 'Annotation',
                    body: {
                        type: 'TextualBody',
                        purpose: 'commenting',
                        value: 'component body',
                    },
                    target: { source: 'canvas-1' },
                },
                bodyEditor: { component: DefaultBodyEditor },
                onSaveBodies,
            }),
        );

        const app = mount(AnnotationEditorPanel, { target, props });
        await tick();

        const saveButton = Array.from(target.querySelectorAll('button')).find(
            (button) => button.textContent?.includes('Save Changes'),
        );
        saveButton?.click();
        await tick();

        expect(onSaveBodies).toHaveBeenCalledWith({
            type: 'TextualBody',
            purpose: 'commenting',
            value: 'component body',
        });

        await unmount(app);
    });

    it('re-renders DOM body editors on hydration and cleans up on switch and deselect', async () => {
        const cleanups: string[] = [];
        const render = vi.fn(
            (container: HTMLElement, api: AnnotationBodyEditorApi) => {
                container.textContent = `${api.annotation.id}:${api.isHydrating}`;
                return () => cleanups.push(api.annotation.id);
            },
        );

        const props = $state(
            panelProps({
                selectedAnnotation: {
                    id: 'anno-1',
                    type: 'Annotation',
                    body: { type: 'TextualBody', value: 'one' },
                    target: { source: 'canvas-1' },
                },
                bodyEditor: { render },
            }),
        );

        const app = mount(AnnotationEditorPanel, { target, props });
        await tick();

        expect(render).toHaveBeenCalledTimes(1);
        expect(render.mock.calls[0][1].annotation.id).toBe('anno-1');
        expect(target.textContent).toContain('anno-1:false');

        props.isHydratingSelection = true;
        await tick();

        expect(render).toHaveBeenCalledTimes(2);
        expect(render.mock.calls[1][1].annotation.id).toBe('anno-1');
        expect(render.mock.calls[1][1].isHydrating).toBe(true);
        expect(cleanups).toEqual(['anno-1']);

        props.selectedAnnotation = {
            id: 'anno-2',
            type: 'Annotation',
            body: { type: 'TextualBody', value: 'two' },
            target: { source: 'canvas-1' },
        };
        await tick();

        expect(render.mock.calls.at(-1)?.[1].annotation.id).toBe('anno-2');
        expect(cleanups).toContain('anno-1');

        props.selectedAnnotation = null;
        await tick();

        expect(cleanups.at(-1)).toBe('anno-2');

        await unmount(app);
    });

    it('body editor api proxies save, cancel, and delete requests', async () => {
        let capturedApi: AnnotationBodyEditorApi | null = null;
        const onSaveBodies = vi.fn(async () => {});
        const onCancelSelection = vi.fn();
        const onRequestDelete = vi.fn();
        const structuredBody = {
            type: 'Dataset',
            value: { label: 'Complex body' },
        };

        const props = $state(
            panelProps({
                selectedAnnotation: {
                    id: 'anno-1',
                    type: 'Annotation',
                    body: structuredBody,
                    target: { source: 'canvas-1' },
                },
                bodyEditor: {
                    render: (
                        _container: HTMLElement,
                        api: AnnotationBodyEditorApi,
                    ) => {
                        capturedApi = api;
                    },
                },
                onSaveBodies,
                onCancelSelection,
                onRequestDelete,
            }),
        );

        const app = mount(AnnotationEditorPanel, { target, props });
        await tick();

        expect(capturedApi).not.toBeNull();
        const api = capturedApi as unknown as AnnotationBodyEditorApi;
        expect(api.bodies).toEqual([structuredBody]);
        await api.save(structuredBody);
        api.cancel();
        api.requestDelete();

        expect(onSaveBodies).toHaveBeenCalledWith(structuredBody);
        expect(onCancelSelection).toHaveBeenCalledTimes(1);
        expect(onRequestDelete).toHaveBeenCalledTimes(1);

        await unmount(app);
    });

    it('can hide the mode toggle and undo/redo chrome', async () => {
        const app = mount(AnnotationEditorPanel, {
            target,
            props: panelProps({
                showModeToggle: false,
                showUndoRedo: false,
            }),
        });
        await tick();

        const buttonLabels = Array.from(target.querySelectorAll('button')).map(
            (button) => button.textContent?.trim(),
        );
        expect(buttonLabels).not.toContain('Edit');
        expect(buttonLabels).not.toContain('Create');
        expect(buttonLabels).not.toContain('Undo');
        expect(buttonLabels).not.toContain('Redo');

        await unmount(app);
    });
});

describe('AnnotationEditorController UI config', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('starts in create mode when configured and creation is allowed', async () => {
        const app = mount(AnnotationEditorController, {
            target,
            props: {
                config: {
                    ui: {
                        showModeToggle: false,
                        startInCreateMode: true,
                    },
                },
            },
            context: new Map([
                [
                    VIEWER_STATE_KEY,
                    {
                        manifestId: 'manifest-1',
                        canvasId: 'canvas-1',
                        osdViewer: null,
                    },
                ],
            ]),
        });
        await tick();

        expect(target.textContent).toContain('Drawing Tool');
        expect(target.textContent).not.toContain('Create');

        await unmount(app);
    });

    it('falls back to edit mode when configured create mode is disabled', async () => {
        const app = mount(AnnotationEditorController, {
            target,
            props: {
                config: {
                    canCreateAnnotation: () => false,
                    ui: {
                        startInCreateMode: true,
                    },
                },
            },
            context: new Map([
                [
                    VIEWER_STATE_KEY,
                    {
                        manifestId: 'manifest-1',
                        canvasId: 'canvas-1',
                        osdViewer: null,
                    },
                ],
            ]),
        });
        await tick();

        expect(target.textContent).toContain(
            'Click on an annotation to select and edit it',
        );
        expect(target.textContent).not.toContain('Drawing Tool');

        await unmount(app);
    });

    it('re-evaluates creation gates when the extension invalidates host context', async () => {
        let allowed = false;
        const invalidators: Array<() => void> = [];
        const unsubscribe = vi.fn();

        const app = mount(AnnotationEditorController, {
            target,
            props: {
                config: {
                    extension: {
                        subscribe: (callback) => {
                            invalidators.push(callback);
                            return unsubscribe;
                        },
                        canCreate: () => allowed,
                        getCreateDisabledReason: () =>
                            allowed ? null : 'Host selection required',
                    },
                },
            },
            context: new Map([
                [
                    VIEWER_STATE_KEY,
                    {
                        manifestId: 'manifest-1',
                        canvasId: 'canvas-1',
                        osdViewer: null,
                        annotationEditBus: {
                            requestEdit: vi.fn(),
                            activeEditAnnotationId: null,
                        },
                    },
                ],
            ]),
        });
        await tick();

        expect(target.textContent).toContain('Host selection required');

        allowed = true;
        invalidators[0]?.();
        await tick();

        expect(target.textContent).not.toContain('Host selection required');

        await unmount(app);
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
