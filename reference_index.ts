import { IIIFLayerOptions, IIIFControlOptions, ServerCapabilities } from "./types";
import { IIIF_EVENTS } from "./event";
import { IIIFLayer } from "./layer";
import { IIIFControl } from "./toolbar";

export { IIIFLayer, IIIFControl, IIIFLayerOptions, IIIFControlOptions, ServerCapabilities };

window.L["Iiif"] = { Event: IIIF_EVENTS };

window.L.tileLayer["iiif"] = function(url: string, options: IIIFLayerOptions) {
  return new IIIFLayer(url, options);
};

window.L.control["iiif"] = function(layer: IIIFLayer, options: IIIFControlOptions) {
  return new IIIFControl(layer, options);
};
