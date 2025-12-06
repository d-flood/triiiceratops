


import { TileLayer, DomEvent, type Coords, type DoneCallback, type TileLayerOptions, Point } from 'leaflet';

export interface IIIFTileSource {
  '@id': string;
  width: number;
  height: number;
  tile_width?: number; // Usually 256 or 512
  tile_height?: number;
  scale_factors?: number[];
  sizes?: { width: number; height: number }[];
  profile?: string | string[] | any;
  tiles?: { width: number, scaleFactors: number[]}[];
}

export class IIIFLayer extends TileLayer {
  iiifData: IIIFTileSource;
  _tierSizeInTiles: number[][] = [];
  _imageSizes: Point[] = [];
  maxNativeZoom: number = 0;
  
  zoomLayers: Array<{
    zoom: number;
    scale: number;
    height: number;
    width: number;
    tiles: [number, number];
  }> = [];

  constructor(iiifData: IIIFTileSource, options: TileLayerOptions = {}) {
    const defaultOptions = {
        minZoom: -6, // Allow zooming out significantly
        maxZoom: 3,  // Allow native + overzoom
        crossOrigin: true,            
        tileSize: 256,
        updateWhenIdle: true,
        keepBuffer: 2
    };
    
    super('', { ...defaultOptions, ...options });
    this.iiifData = iiifData;
    
    const data = this.iiifData;

    // Set tilesize
    if (data.tiles) {
       this.options.tileSize = data.tiles[0].width;
    } else if (data.tile_width) {
       this.options.tileSize = data.tile_width;
    }
    
    // We treat Zoom 0 as 1:1 resolution (1 map unit = 1 image pixel)
    // IIIF Scale Factor 1 = Zoom 0.
    // IIIF Scale Factor 2 = Zoom -1.
    // IIIF Scale Factor 4 = Zoom -2.
    
    // We calculate the minimum zoom needed to see the whole image
    // minZoom = - ceil(log2(max(w,h) / tileSize))
    const tileSize = this.options.tileSize as number;
    const maxDimension = Math.max(data.width, data.height);
    const calculatedMinZoom = -Math.ceil(Math.log2(maxDimension / tileSize));
    
    this.options.minZoom = Math.min(this.options.minZoom || 0, calculatedMinZoom);
    this.options.maxNativeZoom = 0; // We define Z0 as native res
    
    // Register tile load event to fix dimensions of edge tiles
    this.on('tileload', this._tileOnLoadStyle.bind(this));
  }

  override createTile(coords: Coords, done: DoneCallback): HTMLElement {
    const tile = document.createElement('img');

    // @ts-ignore
    DomEvent.on(tile, 'load', this._tileOnLoad.bind(this, done, tile));
    // @ts-ignore
    DomEvent.on(tile, 'error', this._tileOnError.bind(this, done, tile));

    if (this.options.crossOrigin) {
      tile.crossOrigin = '';
    }

    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    tile.src = this.getTileUrl(coords);

    return tile;
  }

  override getTileUrl(coords: Coords): string {
    const { x, y, z } = coords;
    
    // Z=0 is Scale 1.
    // Z=-1 is Scale 2 (downsampled by 2).
    // IIIF Scale Factor = 2^(-z)
    // If z > 0 (overzoom), scale factor < 1 (upscaling), but we usually request scale 1 tiles and let browser scale?
    // Leaflet only calls getTileUrl for native zoom levels normally unless maxNativeZoom set. 
    // We set maxNativeZoom = 0.
    // So z should be <= 0.
    
    // However, if we allow positive maxNativeZoom, logic holds:
    // scaleFactor = 2^(-z). 
    
    // Wait, if Z is very negative (zoomed out), scale factor is large (e.g. 32).
    const iiifScaleFactor = Math.pow(2, -z);
    
    const tileSize = this.options.tileSize as number;
    
    // The region of the original image covered by this tile
    // At scale 1 (z=0), cover 256px.
    // At scale 2 (z=-1), cover 512px.
    const tileCoverSize = tileSize * iiifScaleFactor;
    
    // Calculate global image coordinates
    // Tile (x, y) at zoom z maps to what region?
    const tileBaseSize = tileSize * iiifScaleFactor;
    
    // Check if tile is within valid grid range to prevent negative requests
    // We strictly filter out negative columns/rows
    if (x < 0 || y < 0) return "";
    
    const minx = x * tileBaseSize;
    const miny = y * tileBaseSize;
    
    // Validate bounds
    const w = this.iiifData.width;
    const h = this.iiifData.height;
    
    // Safety check: if starting point is outside image, invalid
    // Use > (not >=) for strict equality might fail on exact edges, but usually safe
    if (minx >= w || miny >= h) return "";
    
    // Calculate region width/height
    const regionW = Math.min(tileCoverSize, w - minx);
    const regionH = Math.min(tileCoverSize, h - miny);
    
    if (regionW <= 0 || regionH <= 0) return "";
    
    // Avoid subpixel rendering artifacts by flooring the coordinates
    // IIIF server expects integer coordinates
    const rX = Math.floor(minx);
    const rY = Math.floor(miny);
    const rW = Math.floor(regionW);
    const rH = Math.floor(regionH);

    // Region parameter
    const region = `${minx},${miny},${regionW},${regionH}`;
    
    // Size parameter
    // We use ceil to ensure we get all data, but visual sizing will be handled by _tileOnLoadStyle
    const sizeW = Math.ceil(regionW / iiifScaleFactor);
    const size = `${sizeW},`;
    
    // Safety check for empty size
    if (sizeW <= 0) return "";
    
    let baseUrl = this.iiifData['@id'];
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    // Strip possible '/info.json' suffix if exists (some manifests provide it in @id)
    baseUrl = baseUrl.replace(/\/info\.json\/?$/, '/');

    return `${baseUrl}${region}/${size}/0/default.jpg`;
  }

  /**
   * Handle border of images when the tiles are not full.
   * Logic: Ensure the displayed tile size perfectly matches the region it covers,
   * avoiding sub-pixel expansion or "strips" caused by server-side ceiling.
   */
  _tileOnLoadStyle(e: any): void {
     const tile = e.tile as HTMLImageElement;
     const coords = e.coords; // Leaflet coords {x, y, z}
     
     if (!coords) return;
     
     const z = coords.z;
     const x = coords.x;
     const y = coords.y;

     // Recalculate scale (same logic as getTileUrl)
     // Native maxNativeZoom logic from constructor
     // scale = 2 ^ (maxNativeZoom - z)
     // Note: We need access to maxNativeZoom. In Leaflet TileLayer, this.options.maxNativeZoom is set?
     // Actually we set it in _setupIIIF.
     // But we used 'z' directly in getTileUrl with a min(z, maxNativeZoom).
     // Wait, if Leaflet requests overzoomed tiles, z > maxNativeZoom.
     // But we are setting style for the *loaded* tile.
     // If z > maxNativeZoom, Leaflet is already scaling a z=maxNativeZoom tile?
     // No, 'tileload' fires when the tile requested *at z* loads.
     // If we conform to standard Leaflet, we only serve tiles up to maxNativeZoom.
     // So z <= maxNativeZoom.
     
     // Retrieve maxNativeZoom.
     // Accessing private property or options?
     // this.options.maxNativeZoom is reliable.
     //@ts-ignore
     const maxNativeZoom = this.options.maxNativeZoom || 0;
     const nativeZ = Math.min(z, maxNativeZoom);
     const scale = Math.pow(2, maxNativeZoom - nativeZ);
     
     const tileSize = this.options.tileSize as number;
     const tileBaseSize = tileSize * scale;
     
     const minx = x * tileBaseSize;
     const miny = y * tileBaseSize;
     
     const w = this.iiifData.width;
     const h = this.iiifData.height;
     
     // Calculate expected region size
     const regionW = Math.min(tileBaseSize, w - minx);
     const regionH = Math.min(tileBaseSize, h - miny);
     
     // Calculate precise CSS pixel size
     // This is the key fix: We force the visual size to match (Region / Scale)
     // even if the image returned (Size) was slightly larger due to ceiling.
     const styleW = regionW / scale;
     const styleH = regionH / scale;
     
     // Only apply if it differs from standard tileSize (edge tiles)
     // Use a small epsilon for float comparison, or just check if < tileSize
     if (styleW < tileSize || styleH < tileSize) {
         tile.style.width = `${styleW}px`;
         tile.style.height = `${styleH}px`;
     } else {
         // Reset in case of reuse (Leaflet reuses img elements)
         tile.style.width = `${tileSize}px`;
         tile.style.height = `${tileSize}px`;
     }
  }
}
