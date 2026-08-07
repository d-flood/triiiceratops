/* eslint-disable */
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';
/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

const de_toggle_single_page_mode = /** @type {(inputs: {}) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Wechseln Sie in den Einzelseitenmodus`)
};

/** @type {(inputs: {}) => LocalizedString} */
const en_toggle_single_page_mode = () => /** @type {LocalizedString} */ ('toggle_single_page_mode')

/**
* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
*
* - Changing this function will be over-written by the next build.
*
* - If you want to change the translations, you can either edit the source files e.g. `en.json`, or
* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
* 
* @param {{}} inputs
* @param {{ locale?: "en" | "de" }} options
* @returns {LocalizedString}
*/
/* @__NO_SIDE_EFFECTS__ */
export const toggle_single_page_mode = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.toggle_single_page_mode(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("toggle_single_page_mode", locale)
	if (locale === "en") return en_toggle_single_page_mode(inputs)
	return de_toggle_single_page_mode(inputs)
};