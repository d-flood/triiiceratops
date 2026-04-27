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

import { registerIifePlugin } from '../../types/plugin';
import { ImageManipulationPlugin } from './index';

registerIifePlugin('ImageManipulation', ImageManipulationPlugin);
