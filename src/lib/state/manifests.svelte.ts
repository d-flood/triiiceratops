import * as manifesto from "manifesto.js";

interface ManifestEntry {
  json?: any;
  manifesto?: any;
  error?: any;
  isFetching?: boolean;
}

export class ManifestsState {
  manifests: Record<string, ManifestEntry> = $state({});

  constructor() {
    console.log("ManifestsState: manifesto module:", manifesto);
  }

  async fetchManifest(manifestId: string) {
    console.log("ManifestsState: fetchManifest called for", manifestId);
    if (this.manifests[manifestId]) {
      console.log("ManifestsState: already has manifest", manifestId);
      return; // Already fetched or fetching
    }

    this.manifests[manifestId] = { isFetching: true };

    try {
      console.log("ManifestsState: fetching...", manifestId);
      const response = await fetch(manifestId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();
      console.log("ManifestsState: fetched json", json);
      const manifestoObject = manifesto.parseManifest(json);
      console.log("ManifestsState: parsed manifesto", manifestoObject);
      this.manifests[manifestId] = {
        json,
        manifesto: manifestoObject,
        isFetching: false,
      };
      console.log("ManifestsState: set manifest in object");
    } catch (error: any) {
      console.error("Error fetching manifest:", error);
      this.manifests[manifestId] = { error: error.message, isFetching: false };
    }
  }

  getManifest(manifestId: string) {
    const entry = this.manifests[manifestId];
    // console.log('ManifestsState: getManifest', manifestId, entry);
    return entry?.manifesto;
  }

  async fetchAnnotationList(url: string) {
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

  getCanvases(manifestId: string) {
    console.log("ManifestsState: getCanvases", manifestId);
    const m = this.getManifest(manifestId);
    if (!m) {
      console.log("ManifestsState: no manifest found for getCanvases");
      return [];
    }
    const sequences = m.getSequences();
    console.log("ManifestsState: sequences", sequences);
    if (!sequences || !sequences.length) return [];
    const canvases = sequences[0].getCanvases();
    console.log("ManifestsState: canvases from manifesto", canvases);
    return canvases;
  }

  getAnnotations(manifestId: string, canvasId: string) {
    console.log("ManifestsState: getAnnotations called", manifestId, canvasId);
    const m = this.getManifest(manifestId);
    if (!m) return [];

    const canvas = m.getSequences()[0].getCanvasById(canvasId);
    if (!canvas) return [];

    const annos = this.manualGetAnnotations(manifestId, canvasId);
    console.log("ManifestsState: returning annotations", annos);
    return annos;
  }

  // We can refactor this to use Manifesto's resource handling later if needed.
  manualGetAnnotations(manifestId: string, canvasId: string) {
    const manifestoObject = this.getManifest(manifestId);
    if (!manifestoObject) return [];

    const canvas = manifestoObject.getSequences()[0].getCanvasById(canvasId);
    if (!canvas) return [];

    // Manifesto wraps the JSON. We can access the underlying JSON via canvas.__jsonld
    // Or better, use canvas.getContent() if it works, but for external lists manual fetch is robust.
    const canvasJson = canvas.__jsonld;

    let annotations: any[] = [];

    // Helper to parse list using Manifesto
    const parseList = (listJson: any) => {
      // manifesto.create is not available in 4.3.0 or not exported nicely?
      // Just return raw resources.
      return listJson.resources || listJson.items || [];
    };

    // IIIF v2 otherContent
    if (canvasJson.otherContent) {
      canvasJson.otherContent.forEach((content: any) => {
        const id = content["@id"] || content.id;
        if (id && !content.resources) {
          const externalList = this.manifests[id];
          if (externalList) {
            if (externalList.json) {
              const parsed = parseList(externalList.json);
              annotations.push(...parsed);
            }
          } else {
            console.log(
              "ManifestsState: fetching external annotation list",
              id
            );
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
      canvasJson.annotations.forEach((content: any) => {
        const id = content.id || content["@id"];
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
