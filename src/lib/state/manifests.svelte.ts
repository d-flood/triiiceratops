import * as manifesto from 'manifesto.js';

export class ManifestsState {
    manifests = $state({}); // Record<string, { json: any, manifesto: any, error: any, isFetching: boolean }>

    constructor() {
        console.log('ManifestsState: manifesto module:', manifesto);
    }

    async fetchManifest(manifestId) {
        console.log('ManifestsState: fetchManifest called for', manifestId);
        if (this.manifests[manifestId]) {
            console.log('ManifestsState: already has manifest', manifestId);
            return; // Already fetched or fetching
        }

        this.manifests[manifestId] = { isFetching: true };

        try {
            console.log('ManifestsState: fetching...', manifestId);
            const response = await fetch(manifestId);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();
            console.log('ManifestsState: fetched json', json);
            const manifestoObject = manifesto.parseManifest(json);
            console.log('ManifestsState: parsed manifesto', manifestoObject);
            this.manifests[manifestId] = { json, manifesto: manifestoObject, isFetching: false };
            console.log('ManifestsState: set manifest in object');
        } catch (error) {
            console.error('Error fetching manifest:', error);
            this.manifests[manifestId] = { error: error.message, isFetching: false };
        }
    }

    getManifest(manifestId) {
        const entry = this.manifests[manifestId];
        // console.log('ManifestsState: getManifest', manifestId, entry);
        return entry?.manifesto;
    }

    async fetchAnnotationList(url) {
        if (this.manifests[url]) return; // Already fetched or fetching

        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                this.manifests[url] = { json: data };
            } else {
                console.error(`Failed to fetch annotation list: ${url}`);
            }
        } catch (e) {
            console.error(`Error fetching annotation list: ${url}`, e);
        }
    }

    getCanvases(manifestId) {
        console.log('ManifestsState: getCanvases', manifestId);
        const m = this.getManifest(manifestId);
        if (!m) {
            console.log('ManifestsState: no manifest found for getCanvases');
            return [];
        }
        const sequences = m.getSequences();
        console.log('ManifestsState: sequences', sequences);
        if (!sequences || !sequences.length) return [];
        const canvases = sequences[0].getCanvases();
        console.log('ManifestsState: canvases from manifesto', canvases);
        return canvases;
    }

    getAnnotations(manifestId, canvasId) {
        console.log('ManifestsState: getAnnotations called', manifestId, canvasId);
        const m = this.getManifest(manifestId);
        if (!m) return [];

        const canvas = m.getSequences()[0].getCanvasById(canvasId);
        if (!canvas) return [];

        // Manifesto handles fetching external resources if configured, 
        // but for now we might need to manually handle the promise if it's not loaded.
        // However, manifesto.js usually expects the data to be present or loaded via its own mechanisms.
        // For this simple port, let's see what canvas.getContent() returns.
        // Actually, for annotations (painting), we use getImages().
        // For other annotations, we might need otherContent.

        // Let's try to get all annotations.
        // Note: Manifesto might not auto-fetch external annotation lists without a plugin or extra setup.
        // We might need to stick to our manual fetch for external lists if manifesto doesn't do it out of the box easily.

        // Re-implementing the manual fetch logic but using Manifesto objects where possible.
        // Actually, let's keep the manual fetch for now but store it in the map, 
        // and then parse the result.

        // Wait, the user wants to use the library.
        // Manifesto has `canvas.getContent()` which returns AnnotationLists.

        // Let's stick to the previous logic for fetching external lists, but use Manifesto to parse them?
        // Or better, let's see if we can just return the raw annotations for now, 
        // as the previous logic was working for fetching.

        // Let's keep the manual fetch for external lists for now to ensure we don't break the fetching we just fixed.
        // But we can use Manifesto to navigate the structure.

        const annos = this.manualGetAnnotations(manifestId, canvasId);
        console.log('ManifestsState: returning annotations', annos);
        return annos;
    }

    // Keeping this for now to ensure we don't break the fetching logic we just fixed.
    // We can refactor this to use Manifesto's resource handling later if needed.
    manualGetAnnotations(manifestId, canvasId) {
        const manifestoObject = this.getManifest(manifestId);
        if (!manifestoObject) return [];

        const canvas = manifestoObject.getSequences()[0].getCanvasById(canvasId);
        if (!canvas) return [];

        // Manifesto wraps the JSON. We can access the underlying JSON via canvas.__jsonld
        // Or better, use canvas.getContent() if it works, but for external lists manual fetch is robust.
        const canvasJson = canvas.__jsonld;

        let annotations = [];

        // Helper to parse list using Manifesto
        const parseList = (listJson) => {
            try {
                // manifesto.create detects type. For AnnotationList it should return an AnnotationList object.
                const resource = manifesto.create(listJson);
                // Check if it has getResources
                if (resource && resource.getResources) {
                    return resource.getResources();
                }
                // If not, maybe it's just raw json if create failed to identify
                return listJson.resources || listJson.items || [];
            } catch (e) {
                console.warn("ManifestsState: manifesto.create failed for list, using raw", e);
                return listJson.resources || listJson.items || [];
            }
        };

        // IIIF v2 otherContent
        if (canvasJson.otherContent) {
            canvasJson.otherContent.forEach(content => {
                const id = content['@id'] || content.id;
                if (id && !content.resources) {
                    const externalList = this.manifests[id];
                    if (externalList) {
                        if (externalList.json) {
                            const parsed = parseList(externalList.json);
                            annotations.push(...parsed);
                        }
                    } else {
                        console.log('ManifestsState: fetching external annotation list', id);
                        this.fetchAnnotationList(id);
                    }
                } else if (content.resources) {
                    // It's embedded
                    // We can wrap this in manifesto.create too if we wrap it in a list structure?
                    // Or just use raw for embedded for now, but mixed types might be annoying.
                    // Let's rely on the robust parsing I added to Overlay for raw/mixed.
                    // But the user wants library usage.
                    // const r = manifesto.create(content); // might work?
                    annotations.push(...content.resources);
                }
            });
        }

        // IIIF v3 annotations
        if (canvasJson.annotations) {
            canvasJson.annotations.forEach(content => {
                const id = content.id || content['@id'];
                if (id && !content.items) {
                    const externalList = this.manifests[id];
                    if (externalList) {
                        if (externalList.json) {
                            const parsed = parseList(externalList.json);
                            annotations.push(...parsed);
                        }
                    } else {
                        this.fetchAnnotationList(id);
                    }
                } else if (content.items) {
                    annotations.push(...content.items);
                }
            });
        }

        return annotations;
    }
}

export const manifestsState = new ManifestsState();
