/**
 * IIFE entry point for the Image Manipulation plugin.
 * This file is used to build a standalone script that can be loaded via <script> tag.
 *
 * Usage:
 * <script src="triiiceratops-element.iife.js"></script>
 * <script src="triiiceratops-plugin-image-manipulation.iife.js"></script>
 * <script>
 *   const viewer = document.querySelector('triiiceratops-viewer');
 *   viewer.plugins = [window.TriiiceratopsPlugins.ImageManipulation];
 * </script>
 */

import ImageManipulationController from './ImageManipulationController.svelte';
import SlidersIcon from 'phosphor-svelte/lib/Sliders';

// Ensure the namespace exists (should already be created by the element script)
window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};

// Register the plugin
window.TriiiceratopsPlugins.ImageManipulation = {
    name: 'Image Manipulation',
    icon: SlidersIcon,
    panel: ImageManipulationController,
    position: 'left',
};
