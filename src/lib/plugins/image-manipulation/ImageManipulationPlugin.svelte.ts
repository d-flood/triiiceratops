import type { Component } from 'svelte';
type OSDViewer = import('openseadragon').OpenSeadragon.Viewer;
import Sliders from 'phosphor-svelte/lib/Sliders';
import { BasePlugin, type PluginContext } from '../../types/plugin';
import { applyFilters, clearFilters, hasActiveFilters } from './filters';
import { DEFAULT_FILTERS, type ImageFilters } from './types';
import ImageManipulationPanel from './ImageManipulationPanel.svelte';

export class ImageManipulationPlugin extends BasePlugin {
    readonly id = 'image-manipulation';
    readonly name = 'Image Manipulation';
    readonly version = '1.0.0';

    // Reactive state using Svelte 5 runes
    private _panelOpen = $state(false);
    private _filters = $state<ImageFilters>({ ...DEFAULT_FILTERS });

    private osd: OSDViewer | null = null;

    onRegister(context: PluginContext): void {
        super.onRegister(context);

        // Register menu button
        context.registerMenuButton({
            id: `${this.id}:toggle`,
            icon: Sliders as Component,
            tooltip: 'Image Adjustments',
            onClick: () => this.togglePanel(),
            isActive: () => this._panelOpen,
            activeClass: 'btn-secondary',
            order: 50,
        });

        // Register panel
        context.registerPanel({
            id: `${this.id}:panel`,
            component: ImageManipulationPanel as Component,
            position: 'left',
            isVisible: () => this._panelOpen,
            props: {
                filters: this._filters,
                onFilterChange: (f: ImageFilters) => this.setFilters(f),
                onReset: () => this.resetFilters(),
                onClose: () => this.togglePanel(),
            },
        });
    }

    onViewerReady(viewer: OSDViewer): void {
        this.osd = viewer;

        // Apply existing filters if any
        if (hasActiveFilters(this._filters)) {
            applyFilters(viewer, this._filters);
        }

        // Re-apply filters when new images unlock (canvas change)
        this.osd.addHandler('open', () => {
            if (this.osd && hasActiveFilters(this._filters)) {
                applyFilters(this.osd, this._filters);
            }
        });
    }

    onDestroy(): void {
        if (this.osd) {
            clearFilters(this.osd);
        }
        this.osd = null;
        super.onDestroy();
    }

    // Public API

    togglePanel(): void {
        this._panelOpen = !this._panelOpen;
    }

    setFilters(filters: ImageFilters): void {
        // Mutate properties to maintain reference for bound props
        this._filters.brightness = filters.brightness;
        this._filters.contrast = filters.contrast;
        this._filters.saturation = filters.saturation;
        this._filters.invert = filters.invert;
        this._filters.grayscale = filters.grayscale;

        if (this.osd) {
            applyFilters(this.osd, filters);
        }
    }

    resetFilters(): void {
        Object.assign(this._filters, DEFAULT_FILTERS);
        if (this.osd) {
            clearFilters(this.osd);
        }
    }

    getFilters(): ImageFilters {
        return { ...this._filters };
    }
}
