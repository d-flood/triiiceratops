import { definePluginStyles } from '@triiiceratops/plugin-sdk';

import stageCss from './stage.css?raw';

export const { STYLES, STYLE_ID } = definePluginStyles(stageCss, 'stage');
