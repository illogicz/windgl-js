import * as styleSpec from "@maplibre/maplibre-gl-style-spec";
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";
import type { WindSource, WindSourceSpec } from "./source";
import tileID, { Tile } from "./tileID";
import * as util from "./util";

type PropertySpecs<Props extends string> = {
  [P in Props]: PropertySpec;
};
type PropertySpec = mb.StylePropertySpecification & {
  //default?: mb.ExpressionSpecificationDefinition
}

export type LayerConfig<Props extends string> = (mb.LayerSpecification | (Omit<mb.LayerSpecification, "type"> & { type: "arrow" | "particles" | "sampleFill"; })) & {
  after?: string,
  properties?: { [K in Props]: mb.StylePropertySpecification; };
  source?: any;
}

export type LayerOptions<Props extends string> = mb.LayerSpecification & { source: WindSource } & {
  [K in Props]: mb.StylePropertySpecification;
}

/**
 * This is an abstract base class that handles most of the mapbox specific
 * stuff as well as a lot of the bookkeeping.
 */
export default abstract class Layer<Props extends string> implements mb.CustomLayerInterface {
  constructor(propertySpec: PropertySpecs<Props>, { id, source, ...options }: LayerOptions<Props>) {
    this.id = id;
    this.type = "custom";
    this.renderingMode = "2d";
    this.source = source;
    this.propertySpec = propertySpec;

    this._zoomUpdatable = {};
    this._propsOnInit = {};
    this.tileZoomOffset = 0;
    this._tiles = {};

    this.zoom = this.zoom.bind(this);
    this.move = this.move.bind(this);
    this.setWind = this.setWind.bind(this);
    this.source.metadata(this.setWind);

    // This will initialize the default values
    Object.keys(this.propertySpec).forEach(spec => {
      this.setProperty(spec, options[spec] || this.propertySpec[spec].default);
    });
  }

  protected abstract initialize(map: mb.Map, gl: WebGLRenderingContext): void;
  protected abstract draw(gl: WebGLRenderingContext, matrix: Float32List, tile: any, offset: Float32List, data?: any): void;

  //@ts-ignore 
  gl: WebGLRenderingContext;
  map?: mb.Map;

  id: string;
  type: "custom";
  renderingMode?: "2d" | "3d";
  pixelToGridRatio: number = 1;
  propertySpec: PropertySpecs<Props>;
  source: WindSource;
  colorRampTexture?: WebGLTexture;

  //@ts-ignore
  windData: WindSourceSpec;
  tileZoomOffset: number;
  private _zoomUpdatable: Partial<Record<Props, mb.CameraExpression | mb.CompositeExpression>>;
  private _propsOnInit: Partial<Record<Props, mb.ConstantExpression | mb.SourceExpression>>;
  protected _tiles: Record<string, Tile>;

  //[prop: string]: any;

  /**
   * Update a property using a mapbox style epxression.
   */
  setProperty(prop: Props, value: unknown) {
    const spec = this.propertySpec[prop];
    if (!spec) return;
    const expr = styleSpec.expression.createPropertyExpression(value, spec);
    console.log(prop, expr)
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
  _setPropertyValue(prop: Props, value: mb.ConstantExpression | mb.SourceExpression | mb.CameraExpression | mb.CompositeExpression) {
    const name = prop
      .split("-")
      .map(a => a[0].toUpperCase() + a.slice(1))
      .join("");
    const setterName = "set" + name;
    //@ts-ignore
    if (this[setterName]) {
      //@ts-ignore
      this[setterName](value);
      //@ts-ignore
      console.log("execute", `${setterName}(${value})`, this[setterName])
    } else {
      const setterName = name[0].toLowerCase() + name.slice(1);
      const zoom = (this.map && this.map.getZoom());
      //@ts-ignore
      this[setterName] = value.evaluate({
        zoom: zoom ?? 1 // EDIT "?? 1"
      });
      console.log("create", `value.evaluate({ zoom:${zoom} ?? 1})`);
      //@ts-ignore
      console.log(`this.${setterName} = ${this[setterName]}`, value)
    }
  }

  // Properties that use data drive styling (i.e. ["get", "speed"]),
  // will want to use this method. Since all speed values are evalutated
  // on the GPU side, but expressions are evaluated on the CPU side,
  // we need to evaluate the expression eagerly. We do it here by sampling
  // 256 possible speed values in the range of the dataset and storing
  // those in a 16x16 texture. The shaders than can simply pick the appropriate
  // pixel to determine the correct color.
  buildColorRamp(expr: mb.StylePropertyExpression, width = 16, filter = this.gl!.LINEAR) {
    if (256 % width) throw new Error("color ramp width must be a factor of 256");
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
      filter,
      colors,
      width,
      256 / width
    );
  }

  // data management
  setWind(windData: WindSourceSpec) {
    this.windData = windData;
    if (this.map) {
      this._initialize(this.map);
      this.map.triggerRepaint();
    }
  }

  computeVisibleTiles(pixelToGridRatio: number, tileSize: number, { maxzoom, minzoom }: { maxzoom: number, minzoom: number; }) {

    /* Orig
    const pixels = this.gl!.canvas.height * this.map!.getZoom();
    const actualZoom = pixels / (tileSize * pixelToGridRatio);
    const practicalZoom = Math.max(
      Math.min(maxzoom, Math.floor(actualZoom)),
      minzoom
    );
    */

    // Most sig diff should be ceil instead of floor for zoom level
    const height = this.gl!.canvas.height;
    const nTiles = height / (tileSize * pixelToGridRatio);
    const tileZoom = Math.ceil(Math.log2(nTiles));
    const dataZoom = Math.max(minzoom, Math.min(maxzoom, tileZoom));
    const tileCount = 2 ** dataZoom;

    const bounds = this.map!.getBounds();

    // Tile coords
    const top = Math.floor(((90 - bounds.getNorth()) / 180) * tileCount);
    const bottom = Math.ceil(((90 - bounds.getSouth()) / 180) * tileCount);
    const left = Math.floor(((bounds.getWest() + 180) / 360) * tileCount);
    const right = Math.ceil(((bounds.getEast() + 180) / 360) * tileCount);

    //const top = (Math.floor((1 - Math.log(Math.tan(bounds.getNorth() * Math.PI / 180) + 1 / Math.cos(bounds.getNorth() * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, practicalZoom)));
    //const bottom = (Math.ceil((1 - Math.log(Math.tan(bounds.getSouth() * Math.PI / 180) + 1 / Math.cos(bounds.getSouth() * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, practicalZoom)));

    const tiles: Tile[] = [];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let properX = x % tileCount;
        if (properX < 0) {
          properX += tileCount;
        }
        tiles.push(
          tileID(dataZoom, properX, y, Math.floor(x / tileCount))
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
      this._initialize(map);
    }
  }

  // This is called when the map is destroyed or the gl context lost.
  onRemove(map: mb.Map) {
    //@ts-ignore
    delete this.gl;
    delete this.map;
    map.off("zoom", this.zoom);
    map.off("move", this.move);
    this.source.unlisten(this.setWind);
  }

  // This will be called when we have everything we need:
  // the gl context and the data
  // we will call child classes `initialize` as well as do a bunch of
  // stuff to get the properties in order
  _initialize(map: mb.Map) {
    this.initialize(this.map!, this.gl);
    Object.entries(this._propsOnInit).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });
    this._propsOnInit = {};
    this.zoom();
    map.on("zoom", this.zoom);
    map.on("move", this.move);
  }

  // Most properties allow zoom dependent styling. Here we update those.
  zoom() {
    Object.entries(this._zoomUpdatable).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });
  }

  move() {
    const tiles = this.computeLoadableTiles();
    tiles.forEach(tile => {
      if (!this._tiles[tile.toString()]) {
        this.source.loadTile(tile, this.tileLoaded.bind(this));
      }
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





  //prerender?(gl: WebGLRenderingContext, matrix: mat4): void;

  // called by mapboxgl
  render(gl: WebGLRenderingContext, matrix: mat4) {
    if (this.windData) {
      this.computeVisibleTiles(
        this.pixelToGridRatio, // cannot find where this is defined
        Math.min(this.windData.width, this.windData.height),
        this.windData
      ).forEach(tile => {
        //console.log("visibleTile", tile)
        const texture = this._tiles[tile.toString()];
        if (!texture) return;
        this.draw(gl, matrix, texture, tile.viewMatrix());
      });
    }
  }
}
