import * as util from "./util";
import tileID, { Tile } from "./tileID";
import * as styleSpec from "@maplibre/maplibre-gl-style-spec"
import type * as mb from "maplibre-gl"
import type { mat4 } from "gl-matrix";
import type { WindSource, WindSourceSpec } from "./source";
//import type { mat4 } from 'gl-matrix';

type PropertySpec = Record<string, mb.StylePropertySpecification & {
  //default: any;
  //[k:keyof ss.LayerSpecification]: any;
}>

export type LayerConfig = (mb.LayerSpecification | (Omit<mb.LayerSpecification, "type"> & { type: "arrow" | "particles" | "sampleFill"; })) & {
  [k: string]: any;
  after?: string,
  properties?: { [k: string]: any; };
  source?: any;
}

export type LayerOptions = mb.LayerSpecification & {
  source?: any;
}

/**
 * This is an abstract base class that handles most of the mapbox specific
 * stuff as well as a lot of the bookkeeping.
 */
export default abstract class Layer implements mb.CustomLayerInterface {
  constructor(propertySpec: PropertySpec, { id, source, ...options }: LayerOptions) {
    this.id = id;
    this.type = "custom";
    this.renderingMode = "2d";
    this.source = source;
    this.propertySpec = propertySpec;
    this.source.metadata(this.setWind.bind(this));

    // This will initialize the default values
    Object.keys(this.propertySpec).forEach(spec => {
      this.setProperty(spec, (options as any)[spec] || this.propertySpec[spec].default);
    });
  }

  //@ts-ignore
  gl: WebGLRenderingContext;
  map?: mb.Map;

  id: string;
  type: "custom";
  renderingMode?: "2d" | "3d" | undefined;
  prerender?(gl: WebGLRenderingContext, matrix: mat4): void;
  pixelToGridRatio = 1;
  propertySpec: PropertySpec;
  source: WindSource;
  colorRampTexture?: WebGLTexture;

  //@ts-ignore
  windData: WindSourceSpec;
  //tileZoomOffset: number;
  private _zoomUpdatable: Record<string, mb.CameraExpression | mb.CompositeExpression> = {};
  private _propsOnInit: Record<string, mb.ConstantExpression | mb.SourceExpression> = {};
  protected _tiles: Record<string, Tile> = {};

  //[prop: string]: any;

  /**
   * Update a property using a mapbox style epxression.
   */
  setProperty(prop: string, value: unknown) {
    const spec = this.propertySpec[prop];
    if (!spec) return;
    const expr = styleSpec.expression.createPropertyExpression(value, spec);
    if (expr.result === "success") {
      switch (expr.value.kind) {
        case "camera":
        case "composite":
          return (this._zoomUpdatable[prop] = expr.value);
        default:
          if (this.map) {
            return this._setPropertyValue(prop, expr.value);
          } else {
            return (this._propsOnInit[prop] = expr.value);
          }
      }
    } else {
      throw new Error(expr.value as any);
    }
  }

  // Child classes can interact with style properties in 2 ways:
  // Either as a camelCased instance variable or by declaring a
  // a setter function which will recieve the *expression* and
  // it is their responsibility to evaluate it.
  _setPropertyValue(prop: string, value: mb.ConstantExpression | mb.SourceExpression | mb.CameraExpression | mb.CompositeExpression) {
    const name = prop
      .split("-")
      .map(a => a[0].toUpperCase() + a.slice(1))
      .join("");
    const setterName = "set" + name;
    //@ts-ignore
    if (this[setterName]) {
      //@ts-ignore
      this[setterName](value);
    } else {
      //@ts-ignore
      this[name[0].toLowerCase() + name.slice(1)] = value.evaluate({
        zoom: (this.map && this.map.getZoom()) ?? 1 // EDIT "?? 1"
      });
    }
  }

  // Properties that use data drive styling (i.e. ["get", "speed"]),
  // will want to use this method. Since all speed values are evalutated
  // on the GPU side, but expressions are evaluated on the CPU side,
  // we need to evaluate the expression eagerly. We do it here by sampling
  // 256 possible speed values in the range of the dataset and storing
  // those in a 16x16 texture. The shaders than can simply pick the appropriate
  // pixel to determine the correct color.
  buildColorRamp(expr: mb.StylePropertyExpression) {
    const colors = new Uint8Array(256 * 4);
    let range = 1;
    if (expr.kind === "source" || expr.kind === "composite") {
      const u = this.windData!.uMax - this.windData!.uMin;
      const v = this.windData!.vMax - this.windData!.vMin;

      range = Math.sqrt(u * u + v * v);
    }

    for (let i = 0; i < 256; i++) {
      const color = expr.evaluate(
        expr.kind === "constant" || expr.kind === "source"
          ? {} as mb.GlobalProperties
          //: { zoom: this.map.zoom },
          : { zoom: this.map!.getZoom() }, // ?
        { properties: { speed: (i / 255) * range } } as unknown as mb.Feature
      );
      colors[i * 4 + 0] = color.r * 255;
      colors[i * 4 + 1] = color.g * 255;
      colors[i * 4 + 2] = color.b * 255;
      colors[i * 4 + 3] = color.a * 255;
    }
    this.colorRampTexture = util.createTexture(
      this.gl!,
      this.gl!.LINEAR,
      colors,
      16,
      16
    );
  }

  // data management
  setWind(windData: WindSourceSpec) {
    this.windData = windData;
    if (this.map) {
      this._initialize();
      this.map.triggerRepaint();
    }
  }

  computeVisibleTiles(pixelToGridRatio: number, tileSize: number, { maxzoom, minzoom }: { maxzoom: number, minzoom: number; }) {
    const pixels = this.gl!.canvas.height * this.map!.getZoom();
    const actualZoom = pixels / (tileSize * pixelToGridRatio);

    const practicalZoom = Math.max(
      Math.min(maxzoom, Math.floor(actualZoom)),
      minzoom
    );

    const bounds = this.map!.getBounds(); // +!

    const tileCount = 2 ** practicalZoom;

    // const top = Math.floor(((90 - bounds.getNorth()) / 180) * tileCount);
    // const bottom = Math.ceil(((90 - bounds.getSouth()) / 180) * tileCount);
    const left = Math.floor(((bounds.getWest() + 180) / 360) * tileCount);
    const right = Math.ceil(((bounds.getEast() + 180) / 360) * tileCount);

    const top = (Math.floor((1 - Math.log(Math.tan(bounds.getNorth() * Math.PI / 180) + 1 / Math.cos(bounds.getNorth() * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, practicalZoom)));
    const bottom = (Math.ceil((1 - Math.log(Math.tan(bounds.getSouth() * Math.PI / 180) + 1 / Math.cos(bounds.getSouth() * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, practicalZoom)));


    const tiles: Tile[] = [];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let properX = x % tileCount;
        if (properX < 0) {
          properX += tileCount;
        }
        tiles.push(
          tileID(practicalZoom, properX, y, Math.floor(x / tileCount))
        );
      }
    }
    return tiles;
  }

  tileLoaded(tile: Tile) {
    this._tiles[tile.toString()] = tile;
    this.map!.triggerRepaint();
  }

  // lifecycle

  // called by mapboxgl
  onAdd(map: mb.Map, gl: WebGLRenderingContext) {
    this.gl = gl;
    this.map = map;
    if (this.windData) {
      this._initialize();
    }
  }

  protected abstract initialize(map: mb.Map, gl: WebGLRenderingContext): void;
  protected abstract draw(gl: WebGLRenderingContext, matrix: Float32List, tile: any, offset: Float32List, data?: any): void;

  // This will be called when we have everything we need:
  // the gl context and the data
  // we will call child classes `initialize` as well as do a bunch of
  // stuff to get the properties in order
  _initialize() {
    this.initialize(this.map!, this.gl);
    Object.entries(this._propsOnInit).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });
    this._propsOnInit = {};
    this.zoom();
    this.map!.on("zoom", this.zoom.bind(this));
    this.map!.on("move", this.move.bind(this));
  }

  // Most properties allow zoom dependent styling. Here we update those.
  zoom() {
    Object.entries(this._zoomUpdatable).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });
  }

  // Finds all tiles that should be loaded from the server. This gets overriden in some subclasses.
  // RC: in our case it is definitely overloaded
  computeLoadableTiles() {
    return this.computeVisibleTiles(
      this.pixelToGridRatio,
      Math.min(this.windData!.width, this.windData!.height),
      this.windData!
    );
  }

  move() {
    const tiles = this.computeLoadableTiles();
    tiles.forEach(tile => {
      if (!this._tiles[tile.toString()]) {
        this.source.loadTile(tile, this.tileLoaded.bind(this));
      }
    });
  }

  // This is called when the map is destroyed or the gl context lost.
  onRemove(map: mb.Map) {
    //@ts-ignore
    delete this.gl;
    delete this.map;
    map.off("zoom", this.zoom);
  }

  // called by mapboxgl
  render(gl: WebGLRenderingContext, matrix: mat4) {
    if (this.windData) {
      this.computeVisibleTiles(
        this.pixelToGridRatio, // cannot find where this is defined
        Math.min(this.windData.width, this.windData.height),
        this.windData
      ).forEach(tile => {
        const texture = this._tiles[tile.toString()];
        if (!texture) return;
        this.draw(gl, matrix, texture, tile.viewMatrix());
      });
    }
  }
}
