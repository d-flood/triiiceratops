export function tooltip(
    node: HTMLElement,
    params: { content: string; position?: 'top' | 'bottom' | 'left' | 'right' },
) {
    let tip: HTMLDivElement | null = null;

    function create() {
        if (tip) return;
        tip = document.createElement('div');
        // Mimic DaisyUI tooltip style
        // tooltip: --tooltip-color: #e5e7eb; --tooltip-text-color: #000000; ...
        // We'll use standard utility classes that match the theme roughly
        // bg-neutral text-neutral-content is usually closest to daisyui tooltip default
        tip.className =
            'fixed z-[9999] px-2 py-1 text-xs rounded bg-neutral text-neutral-content shadow-sm pointer-events-none opacity-0 transition-opacity duration-150 whitespace-nowrap max-w-xs';
        tip.textContent = params.content;
        document.body.appendChild(tip);
        updatePosition();

        // Trigger reflow/paint for transition
        requestAnimationFrame(() => {
            if (tip) tip.style.opacity = '1';
        });
    }

    function destroy() {
        if (tip) {
            tip.style.opacity = '0';
            // Allow transition to finish
            setTimeout(() => {
                if (tip && tip.parentNode) {
                    tip.remove();
                }
            }, 150);
            tip = null;
        }
    }

    function updatePosition() {
        if (!tip) return;
        const rect = node.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        const pos = params.position || 'top';
        const gap = 6; // slightly smaller gap

        let top = 0;
        let left = 0;

        switch (pos) {
            case 'top':
                top = rect.top - tipRect.height - gap;
                left = rect.left + (rect.width - tipRect.width) / 2;
                break;
            case 'bottom':
                top = rect.bottom + gap;
                left = rect.left + (rect.width - tipRect.width) / 2;
                break;
            case 'left':
                top = rect.top + (rect.height - tipRect.height) / 2;
                left = rect.left - tipRect.width - gap;
                break;
            case 'right':
                top = rect.top + (rect.height - tipRect.height) / 2;
                left = rect.right + gap;
                break;
        }

        // Keep within viewport logic (basic)
        if (left < 0) left = 0;
        if (top < 0) top = 0;
        if (left + tipRect.width > window.innerWidth)
            left = window.innerWidth - tipRect.width;
        if (top + tipRect.height > window.innerHeight)
            top = window.innerHeight - tipRect.height;

        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
    }

    function onMouseEnter() {
        create();
    }

    function onMouseLeave() {
        destroy();
    }

    // Also update on scroll?
    // For now, let's just destroy on scroll to avoid detached tooltips
    function onScroll() {
        if (tip) destroy();
    }

    node.addEventListener('mouseenter', onMouseEnter);
    node.addEventListener('mouseleave', onMouseLeave);
    node.addEventListener('focus', onMouseEnter);
    node.addEventListener('blur', onMouseLeave);
    window.addEventListener('scroll', onScroll, true); // Capture to detect any scroll

    return {
        update(newParams: {
            content: string;
            position?: 'top' | 'bottom' | 'left' | 'right';
        }) {
            params = newParams;
            if (tip) {
                tip.textContent = params.content;
                updatePosition();
            }
        },
        destroy() {
            destroy();
            node.removeEventListener('mouseenter', onMouseEnter);
            node.removeEventListener('mouseleave', onMouseLeave);
            node.removeEventListener('focus', onMouseEnter);
            node.removeEventListener('blur', onMouseLeave);
            window.removeEventListener('scroll', onScroll, true);
        },
    };
}
