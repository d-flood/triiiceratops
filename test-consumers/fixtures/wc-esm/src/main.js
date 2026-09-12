// Registering the custom element through the packaged element entry, consumed
// as a bundler ESM import (contrast with plain-html-iife, which loads the same
// artifact via a bare <script> tag with no bundler).
import 'triiiceratops/element';
// The German chrome catalog is an ASSET, not part of the element bundle: a host
// that wants German imports it from the `triiiceratops/locales/*` subpath and
// hands it to the viewer as `messages`. A host reading only English pays
// nothing for it.
import de from 'triiiceratops/locales/de.json';

const viewer = document.querySelector('triiiceratops-viewer');
viewer.messages = { de };
viewer.config = { locale: 'de', search: { open: true } };
