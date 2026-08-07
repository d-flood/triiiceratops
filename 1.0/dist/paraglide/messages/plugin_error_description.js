/* eslint-disable */
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';
/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

const en_plugin_error_description = /** @type {(inputs: { plugin: NonNullable<unknown> }) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.plugin} could not run and has been isolated so the rest of the viewer keeps working.`)
};

const de_plugin_error_description = /** @type {(inputs: { plugin: NonNullable<unknown> }) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.plugin} konnte nicht ausgeführt werden und wurde isoliert, damit der Rest des Viewers weiter funktioniert.`)
};

/**
* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
*
* - Changing this function will be over-written by the next build.
*
* - If you want to change the translations, you can either edit the source files e.g. `en.json`, or
* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
* 
* @param {{ plugin: NonNullable<unknown> }} inputs
* @param {{ locale?: "en" | "de" }} options
* @returns {LocalizedString}
*/
/* @__NO_SIDE_EFFECTS__ */
export const plugin_error_description = (inputs, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.plugin_error_description(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("plugin_error_description", locale)
	if (locale === "en") return en_plugin_error_description(inputs)
	return de_plugin_error_description(inputs)
};