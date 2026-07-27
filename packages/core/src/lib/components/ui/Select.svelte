<script module lang="ts">
    let uid = 0;
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLSelectAttributes } from 'svelte/elements';

    type Size = 'xs' | 'sm' | 'md' | 'lg';

    interface Props extends Omit<HTMLSelectAttributes, 'size'> {
        value?: unknown;
        size?: Size;
        /** Transparent until focus. */
        ghost?: boolean;
        class?: string;
        style?: string;
        children?: Snippet;
    }

    let {
        value = $bindable(),
        size = 'md',
        ghost = false,
        class: className = '',
        style = '',
        children,
        ...rest
    }: Props = $props();

    const SIZE: Record<Size, string> = {
        xs: 'calc(var(--size-field,0.25rem)*6)',
        sm: 'calc(var(--size-field,0.25rem)*8)',
        md: 'calc(var(--size-field,0.25rem)*10)',
        lg: 'calc(var(--size-field,0.25rem)*12)',
    };
    let computedStyle = $derived(`--size:${SIZE[size]};${style}`);

    const listId = `tri-listbox-${uid++}`;

    // The hidden native <select> is the source of truth: bind:value, onchange
    // (spread via rest), and form submission all flow through it unchanged. The
    // custom listbox is a themed visual layer that drives it.
    let nativeEl = $state<HTMLSelectElement | null>(null);
    let triggerEl = $state<HTMLButtonElement | null>(null);
    let listEl = $state<HTMLDivElement | null>(null);

    type Item = { value: string; label: string; disabled: boolean };
    let items = $state<Item[]>([]);
    let open = $state(false);
    let activeIndex = $state(-1);

    let isDisabled = $derived(!!(rest.disabled as boolean | undefined));
    let selectedValueStr = $derived(value == null ? '' : String(value));
    let selected = $derived(
        items.find((it) => it.value === selectedValueStr) ?? items[0],
    );

    function rebuild() {
        if (!nativeEl) return;
        items = Array.from(nativeEl.querySelectorAll('option')).map((o) => ({
            value: o.value,
            label: (o.textContent ?? '').trim(),
            disabled: o.disabled,
        }));
    }

    $effect(() => {
        if (!nativeEl) return;
        rebuild();
        const mo = new MutationObserver(() => rebuild());
        mo.observe(nativeEl, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
        });
        return () => mo.disconnect();
    });

    function choose(i: number) {
        const item = items[i];
        if (!nativeEl || !item || item.disabled) return;
        nativeEl.value = item.value;
        // Fire real events so bind:value updates and consumer onchange runs
        // with event.currentTarget === the native <select>.
        nativeEl.dispatchEvent(new Event('input', { bubbles: true }));
        nativeEl.dispatchEvent(new Event('change', { bubbles: true }));
        close();
    }

    function position() {
        if (!triggerEl || !listEl) return;
        const r = triggerEl.getBoundingClientRect();
        listEl.style.minWidth = `${r.width}px`;
        listEl.style.left = `${r.left}px`;
        const listH = listEl.offsetHeight;
        const spaceBelow = window.innerHeight - r.bottom;
        if (spaceBelow < listH && r.top > spaceBelow) {
            listEl.style.top = `${Math.max(4, r.top - listH - 4)}px`;
        } else {
            listEl.style.top = `${r.bottom + 4}px`;
        }
    }

    function scrollActiveIntoView() {
        const el = listEl?.children[activeIndex] as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
    }

    function onOutsidePointer(e: PointerEvent) {
        // composedPath() pierces the shadow boundary; e.target alone retargets
        // to the host element, which would make a trigger click look "outside".
        const path = e.composedPath();
        if ((triggerEl && path.includes(triggerEl)) ||
            (listEl && path.includes(listEl)))
            return;
        close();
    }

    function openList() {
        if (isDisabled || open || !listEl) return;
        open = true;
        listEl.showPopover();
        position();
        activeIndex = items.findIndex((it) => it.value === selectedValueStr);
        if (activeIndex < 0)
            activeIndex = items.findIndex((it) => !it.disabled);
        scrollActiveIntoView();
        window.addEventListener('scroll', position, true);
        window.addEventListener('resize', position);
        document.addEventListener('pointerdown', onOutsidePointer, true);
    }

    function close() {
        if (!open) return;
        open = false;
        listEl?.hidePopover();
        window.removeEventListener('scroll', position, true);
        window.removeEventListener('resize', position);
        document.removeEventListener('pointerdown', onOutsidePointer, true);
        triggerEl?.focus();
    }

    function toggle() {
        open ? close() : openList();
    }

    function moveActive(dir: 1 | -1) {
        if (!items.length) return;
        let i = activeIndex;
        for (let step = 0; step < items.length; step++) {
            i = (i + dir + items.length) % items.length;
            if (!items[i].disabled) {
                activeIndex = i;
                scrollActiveIntoView();
                return;
            }
        }
    }

    function setActiveEdge(from: 'start' | 'end') {
        const order =
            from === 'start'
                ? items.map((_, i) => i)
                : items.map((_, i) => items.length - 1 - i);
        for (const i of order) {
            if (!items[i].disabled) {
                activeIndex = i;
                scrollActiveIntoView();
                return;
            }
        }
    }

    let typeBuffer = '';
    let typeTimer: ReturnType<typeof setTimeout> | undefined;
    function typeahead(ch: string) {
        typeBuffer += ch.toLowerCase();
        clearTimeout(typeTimer);
        typeTimer = setTimeout(() => (typeBuffer = ''), 600);
        const match = items.findIndex(
            (it) => !it.disabled && it.label.toLowerCase().startsWith(typeBuffer),
        );
        if (match >= 0) {
            activeIndex = match;
            scrollActiveIntoView();
        }
    }

    function onTriggerKeydown(e: KeyboardEvent) {
        if (isDisabled) return;
        if (!open) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
                e.preventDefault();
                openList();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveActive(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveActive(-1);
                break;
            case 'Home':
                e.preventDefault();
                setActiveEdge('start');
                break;
            case 'End':
                e.preventDefault();
                setActiveEdge('end');
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (activeIndex >= 0) choose(activeIndex);
                break;
            case 'Escape':
                e.preventDefault();
                close();
                break;
            case 'Tab':
                close();
                break;
            default:
                if (e.key.length === 1 && !e.metaKey && !e.ctrlKey)
                    typeahead(e.key);
        }
    }
</script>

<div class="select-wrapper {className}" {style}>
    <select
        bind:this={nativeEl}
        class="native-select"
        bind:value
        tabindex="-1"
        aria-hidden="true"
        {...rest}
    >
        {@render children?.()}
    </select>

    <button
        bind:this={triggerEl}
        type="button"
        class="select"
        class:ghost
        class:open
        style={computedStyle}
        disabled={isDisabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest['aria-label'] as string | undefined}
        onclick={toggle}
        onkeydown={onTriggerKeydown}
    >
        <span class="select-label" class:placeholder={selected?.disabled}>
            {selected?.label ?? ''}
        </span>
    </button>

    <div
        bind:this={listEl}
        id={listId}
        role="listbox"
        class="listbox"
        popover="manual"
        tabindex="-1"
    >
        {#each items as item, i (item.value + ' ' + i)}
            <div
                role="option"
                class="option"
                class:active={i === activeIndex}
                class:selected={item.value === selectedValueStr}
                aria-selected={item.value === selectedValueStr}
                aria-disabled={item.disabled}
                onclick={() => choose(i)}
                onpointermove={() => (activeIndex = i)}
            >
                {item.label}
            </div>
        {/each}
    </div>
</div>

<style>
    .select-wrapper {
        display: inline-flex;
        width: clamp(3rem, 20rem, 100%);
        max-width: 100%;
    }

    /* Source-of-truth <select>, kept out of view but still in the a11y/form
       tree for value binding and submission. */
    .native-select {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
        pointer-events: none;
    }

    .select {
        border: var(--border) solid var(--input-color);
        appearance: none;
        background-color: var(--input-bg);
        vertical-align: middle;
        width: 100%;
        height: var(--size);
        touch-action: manipulation;
        white-space: nowrap;
        box-shadow:
            0 1px
                color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000)
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        --input-color: color-mix(in oklab, var(--content) 20%, #0000);
        --size: calc(var(--size-field, 0.25rem) * 10);
        background-image: linear-gradient(45deg, #0000 50%, currentColor 50%),
            linear-gradient(135deg, currentColor 50%, #0000 50%);
        background-position:
            calc(100% - 20px) calc(1px + 50%),
            calc(100% - 16.1px) calc(1px + 50%);
        background-repeat: no-repeat;
        background-size:
            4px 4px,
            4px 4px;
        border-start-start-radius: var(--join-ss, var(--radius-buttons));
        border-start-end-radius: var(--join-se, var(--radius-buttons));
        border-end-end-radius: var(--join-ee, var(--radius-buttons));
        border-end-start-radius: var(--join-es, var(--radius-buttons));
        align-items: center;
        gap: 0.375rem;
        padding-inline: 0.75rem 1.75rem;
        font-size: 0.875rem;
        display: inline-flex;
        position: relative;
        cursor: pointer;
        color: inherit;
        text-align: start;
    }

    .select-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .select-label.placeholder {
        color: color-mix(in oklab, var(--content) 55%, transparent);
    }

    .select:hover:not(:disabled) {
        --input-color: color-mix(in oklab, var(--content) 40%, #0000);
    }

    .select:focus-visible,
    .select.open {
        --input-color: var(--content);
        box-shadow: 0 1px
            color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000);
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
        z-index: 1;
    }

    .select:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--panel-bg);
        background-color: var(--panel-bg);
        color: color-mix(in oklab, var(--content) 40%, transparent);
    }

    .ghost {
        box-shadow: none;
        background-color: #0000;
        border-color: #0000;
        transition: background-color 0.2s;
    }
    .ghost:hover:not(:disabled) {
        background-color: color-mix(in oklab, var(--content) 8%, transparent);
    }
    .ghost:focus-visible,
    .ghost.open {
        background-color: var(--input-bg);
        color: var(--content);
    }

    /* Themed popover list — fully controllable radius, colors, and states,
       unlike a native <select> popup. Rendered in the top layer so panel
       overflow never clips it. */
    .listbox {
        position: fixed;
        inset: auto;
        margin: 0;
        padding: 0.1875rem;
        border: var(--border) solid
            color-mix(in oklab, var(--content) 20%, #0000);
        background-color: var(--input-bg);
        color: var(--content);
        border-radius: var(--radius-buttons);
        box-shadow: 0 8px 24px oklch(0 0 0 / calc(0.12 + var(--depth) * 0.06));
        max-height: 16rem;
        overflow-y: auto;
        min-width: 8rem;
        z-index: 1;
    }
    .listbox:not(:popover-open) {
        display: none;
    }

    .option {
        padding: 0.25rem 0.5rem;
        border-radius: calc(var(--radius-buttons) * 0.6);
        cursor: pointer;
        font-size: 0.8125rem;
        line-height: 1.3;
        white-space: nowrap;
        color: inherit;
    }
    .option.active {
        background-color: color-mix(in oklab, var(--content) 12%, #0000);
    }
    .option.selected {
        background-color: color-mix(in oklab, var(--color-primary) 90%, #0000);
        color: var(--color-primary-content);
    }
    .option.selected.active {
        background-color: var(--color-primary);
    }
    .option[aria-disabled='true'] {
        opacity: 0.5;
        cursor: not-allowed;
        color: color-mix(in oklab, var(--content) 55%, transparent);
    }
</style>
