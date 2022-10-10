import { BaseLayer, LayerOptions, PropertySpecs } from "../baseLayer";
import { tile, Tile } from "./tileID";
//
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";
import type { TextureFilter, TileSourceSpec, WindSource } from "./tileSource";
import { buildColorGrid, createColorRampTexture } from "../util/colorRamp";

/**
 * Tile specfic base layer
 */
export abstract class TileLayer<Props extends string> extends BaseLayer<Props> {
  constructor(propertySpec: PropertySpecs<Props>, options: LayerOptions<Props>, source: WindSource) {
    super(propertySpec, options)
    this.source = source;
    this.tileZoomOffset = 0;
    this._tiles = {};

    this.sourceLoaded = this.sourceLoaded.bind(this);
    this.source.metadata(this.sourceLoaded);
  }

  protected abstract draw(gl: WebGLRenderingContext, matrix: mat4, tile: any, offset: Float32List, data?: any): void;

  protected colorRampTexture?: WebGLTexture;
  protected pixelToGridRatio: number = 1;
  protected source: WindSource;
  protected windData!: TileSourceSpec;
  protected tileZoomOffset: number;
  protected _tiles: Record<string, Tile>;


  public render(gl: WebGLRenderingContext, matrix: mat4) {
    const tiles = new Set<Tile>();
    if (this.windData) {
      this.computeVisibleTiles(
        this.pixelToGridRatio, // cannot find where this is defined
        [this.windData.width, this.windData.height],
        this.windData
      ).forEach(tile => {
        const texture = this._tiles[tile.key];
        if (!texture) return;
        tiles.add(tile)
        this.draw(gl, matrix, texture, tile.viewMatrix());
      });
    }
  }

  protected override initialize() {
    if (!this.windData) return false;
    return super.initialize();
  }

  public override onRemove(map: mb.Map) {
    super.onRemove(map);
    this.source.unlisten(this.sourceLoaded);
  }

  public setFilter(f: TextureFilter) {
    this.source.setFilter(f, this.gl);
    this.map?.triggerRepaint();
  }

  protected override onMove() {
    super.onMove();
    const tiles = this.computeLoadableTiles();
    tiles.forEach(tile => {
      if (!this._tiles[tile.key]) {
        this.source.loadTile(tile, this.tileLoaded.bind(this));
      }
    });
  }


  // data management
  protected sourceLoaded(windData: TileSourceSpec) {
    this.windData = windData;
    if (this.initialize()) {
      this.map!.triggerRepaint()
    }
  }

  protected computeVisibleTiles(pixelToGridRatio: number, tileSize: [number, number], { maxzoom, minzoom }: { maxzoom: number, minzoom: number }) {

    const pixelRatio = this.map!.transform.worldSize / tileSize[1];
    const tileZoom = Math.log2(pixelRatio / pixelToGridRatio);
    const dataZoom = Math.max(minzoom, Math.min(maxzoom, Math.floor(tileZoom)));
    const tileCount = 2 ** dataZoom;

    const bounds = this.map!.getBounds();

    // Tile coords
    const top = Math.floor(((90 - bounds.getNorth()) / 180) * tileCount);
    const bottom = Math.ceil(((90 - bounds.getSouth()) / 180) * tileCount);
    const left = Math.floor(((bounds.getWest() + 180) / 360) * tileCount);
    const right = Math.ceil(((bounds.getEast() + 180) / 360) * tileCount);

    const tiles: Tile[] = [];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let properX = x % tileCount;
        if (properX < 0) {
          properX += tileCount;
        }
        tiles.push(
          tile(dataZoom, properX, y, Math.floor(x / tileCount))
        );
      }
    }
    return tiles;
  }

  // Finds all tiles that should be loaded from the server. This gets overriden in some subclasses.
  // RC: in our case it is definitely overloaded
  protected computeLoadableTiles() {
    return this.computeVisibleTiles(
      this.pixelToGridRatio,
      [this.windData.width, this.windData.height],
      this.windData
    );
  }

  private tileLoaded(tile: Tile) {
    this._tiles[tile.key] = tile;
    this.map?.triggerRepaint();
  }
  onRenderTiles?: (tiles: Set<Tile>) => void;

  protected buildColorRamp(expr: mb.StylePropertyExpression) {
    return this.colorRampTexture = createColorRampTexture(this.gl!, this.map!, expr, [0, this.windData.speedMax]);
  }
  protected buildColorGrid(
    x: mb.StylePropertyExpression,
    y: mb.StylePropertyExpression,
    range: [number, number, number, number]
  ) {
    return buildColorGrid(this.gl!, this.map!, x, y, range, this.gl!.LINEAR);
  }
}
