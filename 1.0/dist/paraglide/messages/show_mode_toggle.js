/* eslint-disable */
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';
/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

const de_show_mode_toggle = /** @type {(inputs: {}) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Modus-Umschalter anzeigen`)
};

/** @type {(inputs: {}) => LocalizedString} */
const en_show_mode_toggle = () => /** @type {LocalizedString} */ ('show_mode_toggle')

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
export const show_mode_toggle = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.show_mode_toggle(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("show_mode_toggle", locale)
	if (locale === "en") return en_show_mode_toggle(inputs)
	return de_show_mode_toggle(inputs)
};