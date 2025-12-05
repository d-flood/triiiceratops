import L, { Map, TileLayer, TileEvent } from "leaflet";
import { DEFAULT_OPTIONS, SERVER_CAPABILITIES_DEFAULT, IIIFLayerOptions, ServerCapabilities } from "./types";
import { IIIF_EVENTS } from "./event";
import { computeServerCapabilities } from "./utils/server-capabilities";
import { templateUrl } from "./utils/helper";
import { projectSquare } from "./utils/projection";

export class IIIFLayer extends TileLayer {
  // Layer options (initialized by super)
  public options!: IIIFLayerOptions;

  // Leaflet map
  map: Map | null = null;
  _url = "";

  // Promise of the call to the IIIF server to initialize the layer
  // (initialized by the call to initialize that is done internally per leaflet)
  initializePromise!: Promise<void>;

  // Server capabilities
  server: ServerCapabilities = SERVER_CAPABILITIES_DEFAULT;

  // Dimension of the image
  height = 0;
  width = 0;

  zoomLayers: Array<{
    // Map zoom level
    zoom: number;
    // the scaling ratio
    scale: number;
    // height of the image at this scale
    height: number;
    // width of the image at this scale
    width: number;
    // number of tiles in x & y
    tiles: [number, number];
  }> = [];

  /**
   * IIIF Layer constructor.
   *
   * @param {string} url The IIIF info endpoint for an image  (ex: https://stacks.stanford.edu/image/iiif/hg676jb4964%2F0380_796-44/info.json)
   * @param {object} options List of options for the layer
   */
  constructor(url: string, options: Partial<IIIFLayerOptions> = {}) {
    super(url, options);
    this.setUrl(templateUrl(url));
  }

  /**
   * Initialize the layer by calling the info endpoint of the image,
   * compute the server capabilities and set the initial state.
   * @override
   */
  initialize(url: string, options: Partial<IIIFLayerOptions>): this {
    this.initializePromise = new Promise((resolve, reject) => {
      fetch(url)
        .then(response => {
          response
            .json()
            .then(data => {
              // saving the image dimension
              this.height = data.height;
              this.width = data.width;

              // server capabilities
              this.server = computeServerCapabilities(data);

              // Settings
              this.options = L.Util.setOptions(
                this,
                Object.assign(
                  {},
                  DEFAULT_OPTIONS,
                  // Server pref
                  {
                    tileSize: this.server.tileSize || DEFAULT_OPTIONS.tileSize,
                    tileFormat: this.server.formats[0] || DEFAULT_OPTIONS.tileFormat,
                    quality: this.server.qualities && this.server.qualities.includes("native") ? "native" : "default",
                    minZoom: this.server.minZoom || DEFAULT_OPTIONS.minZoom,
                    maxZoom: this.server.maxZoom || DEFAULT_OPTIONS.maxZoom,
                  },
                  // User's options
                  options,
                ),
              );
              resolve();
            })
            .catch((e: Error) => reject(`Fail to fetch url ${url} : ${e}`));
        })
        .catch((e: Error) => reject(`Fail to fetch url ${url} : ${e}`));
    });
    return this;
  }

  onAdd(map: Map): this {
    this.map = map;

    // Wait for info.json fetch and parse to complete
    this.initializePromise.then(() => {
      // Compute image sizes
      this.computeZoomLayers();

      super.onAdd(map);

      // Fit bounds
      if (this.options.fitBounds) {
        (this.map as Map).fitBounds(this.getBounds());
      }

      // Set max bound
      if (this.options.setMaxBounds) {
        (this.map as Map).setMaxBounds(this.getBounds());
      }

      // calling super after we compute all the zoom
      // super.onAdd(map);
    });

    // register events
    this.registerEvents(map);

    return this;
  }

  onRemove(map: Map): this {
    // calling super
    super.onRemove(map);

    // Remove maxBounds set for this image
    if (this.options.setMaxBounds) {
      // bug in the type definition
      map.setMaxBounds((null as unknown) as L.LatLngBoundsExpression);
    }

    // unregister events
    this.unRegisterEvents(map);

    return this;
  }

  /**
   * Generate the tile IIIF url based on the tile coordinates
   */
  public getTileUrl(coords: L.Coords): string {
    const z = coords["z"];
    const x = coords["x"];
    const y = coords["y"];
    const zoomLayer = this.zoomLayers.find(layer => layer.zoom === z);
    if (!zoomLayer) throw new Error(`Can't create tile for zoom ${z}`);

    // Handle rotation
    const unprojectedSquare = projectSquare(-1 * this.options.rotation, {
      bottomLeft: { x, y },
      topRight: { x: x + 1, y: y + 1 },
    });

    const tileSizeX = this.options.tileSize.x / zoomLayer.scale;
    const tileSizeY = this.options.tileSize.y / zoomLayer.scale;

    // Compute the image region / bbox NW/SE
    let minX = Math.min(unprojectedSquare.bottomLeft.x * tileSizeX, this.width);
    const minY = Math.min(unprojectedSquare.bottomLeft.y * tileSizeY, this.height);
    let maxX = Math.min(minX + tileSizeX, this.width);
    const maxY = Math.min(minY + tileSizeY, this.height);

    // In mirroring, if we do the diff with the width,
    // we then have the bbox NE/SO,
    // so we need to switch back to NW/SE by add/subs the diff
    if (this.options.mirroring === true) {
      const diffX = maxX - minX;
      minX = this.width - minX - diffX;
      maxX = this.width - maxX + diffX;
    }

    // some servers only accept w, format as for instancce biiif generator: https://github.com/IIIF-Commons/biiif.
    // This size format should be configured based on the image profile spec https://iiif.io/api/image/2.1/#profile-description
    // But this lib does not support this yet so making hard coded workaround for now.
    let size: [number, number] | [number, ""] = [Math.abs(maxX - minX), Math.abs(maxY - minY)].map((s) =>
      Math.ceil(s * zoomLayer.scale),
    ) as [number, number];
    if (size[0] === size[1]) size = [size[0], ""];

    const params = {
      format: this.options.tileFormat,
      quality: this.options.quality,
      mirroring: this.options.mirroring,
      region: [minX, minY, Math.abs(maxX - minX), Math.abs(maxY - minY)],
      rotation: (360 - this.options.rotation) % 360,
      size,
    };

    return L.Util.template(this._url, {
      format: params.format,
      quality: params.quality,
      mirroring: params.mirroring ? "!" : "",
      region: params.region.join(","),
      rotation: params.rotation,
      size: params.size.join(","),
    });
  }

  protected _isValidTile(coords: L.Coords): boolean {
    let isValid = false;
    const x = coords["x"];
    const y = coords["y"];
    const z = coords["z"];

    // Handle rotation (leaflet axis are reversed, so a 90 rotation is in fact a -90 rotation)
    const unprojectedSquare = projectSquare(-1 * this.options.rotation, {
      bottomLeft: { x, y },
      topRight: { x: x + 1, y: y + 1 },
    });

    if (this.options.minZoom <= z && z <= this.options.maxZoom) {
      const originalZoomLayer = this.zoomLayers.find(layer => layer.zoom === z);
      if (
        originalZoomLayer &&
        0 <= unprojectedSquare.bottomLeft.x &&
        unprojectedSquare.bottomLeft.x < originalZoomLayer.tiles[0] &&
        0 <= unprojectedSquare.bottomLeft.y &&
        unprojectedSquare.bottomLeft.y < originalZoomLayer.tiles[1]
      )
        isValid = true;
    }
    return isValid;
  }

  /**
   * Compute the bounds of the layer.
   */
  private getBounds(): L.LatLngBounds {
    let result = L.latLngBounds([0, 1], [1, 0]);

    const originalZoomLayer = this.zoomLayers.find(layer => layer.scale === 1);
    if (this.map !== null && originalZoomLayer) {
      const projectedSquare = projectSquare(this.options.rotation, {
        bottomLeft: { x: 0, y: originalZoomLayer.height },
        topRight: { x: originalZoomLayer.width, y: 0 },
      });

      const sw = this.map.unproject(L.point(projectedSquare.bottomLeft), 0);
      const ne = this.map.unproject(L.point(projectedSquare.topRight), 0);
      result = L.latLngBounds(sw, ne);
    }

    return result;
  }

  /**
   * Compute the different images by zoom level
   */
  private computeZoomLayers(): void {
    this.zoomLayers = [];

    let zoom = this.options.minZoom;
    while (zoom <= this.options.maxZoom) {
      const scale = Math.pow(2, zoom);
      const height = Math.ceil(this.height * scale);
      const width = Math.ceil(this.width * scale);
      this.zoomLayers.push({
        zoom,
        scale,
        height,
        width,
        tiles: [Math.ceil(width / this.options.tileSize.x), Math.ceil(height / this.options.tileSize.y)],
      });
      zoom++;
    }
    // Setting the min /max zoom in the options & map
    if (this.map !== null) {
      this.map.setMaxZoom(this.zoomLayers[this.zoomLayers.length - 1].zoom);
      this.map.setMinZoom(this.zoomLayers[0].zoom);
    }
  }

  private registerEvents(map: Map): void {
    this.on("tileload", this.onTileLoadStyle);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    map.on(IIIF_EVENTS.CHANGE_FORMAT, (e: any) => this.changeFormat(e.value));
    map.on(IIIF_EVENTS.CHANGE_QUALITY, (e: any) => this.changeQuality(e.value));
    map.on(IIIF_EVENTS.CHANGE_ROTATION, (e: any) => this.changeRotation(e.value));
    map.on(IIIF_EVENTS.CHANGE_MIRRORING, (e: any) => this.changeMirroring(e.value));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  private unRegisterEvents(map: Map): void {
    this.off("tileload", this.onTileLoadStyle);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    map.off(IIIF_EVENTS.CHANGE_FORMAT, (e: any) => this.changeFormat(e.value));
    map.off(IIIF_EVENTS.CHANGE_QUALITY, (e: any) => this.changeQuality(e.value));
    map.off(IIIF_EVENTS.CHANGE_ROTATION, (e: any) => this.changeRotation(e.value));
    map.off(IIIF_EVENTS.CHANGE_MIRRORING, (e: any) => this.changeMirroring(e.value));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  private changeFormat(value: string): void {
    this.options.tileFormat = value;
    this.redraw();
  }

  private changeQuality(value: string): void {
    this.options.quality = value;
    this.redraw();
  }

  private changeRotation(value: number): void {
    this.options.rotation = value;
    // Set max bound
    if (this.options.setMaxBounds && this.map !== null) {
      this.map.setMaxBounds(this.getBounds());
    }
    this.redraw();
  }

  private changeMirroring(value: boolean): void {
    this.options.mirroring = value;
    this.redraw();
  }

  /**
   * Handle border of images when the tiles are not full.
   */
  private onTileLoadStyle(tile: TileEvent): void {
    if (tile.tile.naturalWidth !== this.options.tileSize.x || tile.tile.naturalHeight !== this.options.tileSize.y) {
      tile.tile.style.width = `${tile.tile.naturalWidth}px`;
      tile.tile.style.height = `${tile.tile.naturalHeight}px`;

      const rotation = this.options.rotation % 360;
      switch (rotation) {
        case 90:
          tile.tile.style.top = `${this.options.tileSize.x - tile.tile.naturalHeight}px`;
          tile.tile.style.right = `${this.options.tileSize.y - tile.tile.naturalWidth}px`;
          break;
        case 180:
          tile.tile.style.top = `${this.options.tileSize.x - tile.tile.naturalHeight}px`;
          tile.tile.style.left = `${this.options.tileSize.y - tile.tile.naturalWidth}px`;
          break;
        case 270:
          tile.tile.style.top = "0";
          tile.tile.style.bottom = `${this.options.tileSize.x - tile.tile.naturalHeight}px`;
          tile.tile.style.left = `${this.options.tileSize.y - tile.tile.naturalWidth}px`;
          break;
      }
    }
  }
}
