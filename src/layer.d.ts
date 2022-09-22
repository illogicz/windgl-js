import { Tile } from "./tileID";
import type * as ss from "mapbox-gl/dist/style-spec";
import type { WindSource, WindSourceSpec } from "./source";
import type * as mb from "mapbox-gl";
declare type PropertySpec = Record<string, ss.StylePropertySpecification & {}>;
export declare type LayerConfig = (ss.LayerSpecification | (Omit<ss.LayerSpecification, "type"> & {
    type: "arrow" | "particles" | "sampleFill";
})) & {
    [k: string]: any;
    after?: string;
    properties?: {
        [k: string]: any;
    };
    source?: any;
};
export declare type LayerOptions = ss.LayerSpecification & {
    source?: any;
};
/**
 * This is an abstract base class that handles most of the mapbox specific
 * stuff as well as a lot of the bookkeeping.
 */
export default abstract class Layer implements mb.CustomLayerInterface {
    constructor(propertySpec: PropertySpec, { id, source, ...options }: LayerOptions);
    gl: WebGLRenderingContext;
    map?: mb.Map;
    id: string;
    type: "custom";
    renderingMode?: "2d" | "3d" | undefined;
    prerender?(gl: WebGLRenderingContext, matrix: number[]): void;
    pixelToGridRatio: number;
    propertySpec: PropertySpec;
    source: WindSource;
    colorRampTexture?: WebGLTexture;
    windData: WindSourceSpec;
    private _zoomUpdatable;
    private _propsOnInit;
    protected _tiles: Record<string, Tile>;
    /**
     * Update a property using a mapbox style epxression.
     */
    setProperty(prop: string, value: unknown): any;
    _setPropertyValue(prop: string, value: ss.ConstantExpression | ss.SourceExpression | ss.CameraExpression | ss.CompositeExpression): void;
    buildColorRamp(expr: ss.StylePropertyExpression): void;
    setWind(windData: WindSourceSpec): void;
    computeVisibleTiles(pixelToGridRatio: number, tileSize: number, { maxzoom, minzoom }: {
        maxzoom: number;
        minzoom: number;
    }): Tile[];
    tileLoaded(tile: Tile): void;
    onAdd(map: mb.Map, gl: WebGLRenderingContext): void;
    protected abstract initialize(map: mb.Map, gl: WebGLRenderingContext): void;
    protected abstract draw(gl: WebGLRenderingContext, matrix: Float32List, tile: any, offset: Float32List, data?: any): void;
    _initialize(): void;
    zoom(): void;
    computeLoadableTiles(): Tile[];
    move(): void;
    onRemove(map: mb.Map): void;
    render(gl: WebGLRenderingContext, matrix: number[]): void;
}
export {};
