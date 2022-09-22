import Layer, { LayerOptions } from "./layer";
import type * as ss from "mapbox-gl/dist/style-spec";
import { Tile } from "./tileID";
import type * as mb from "mapbox-gl";
declare class SampleFill extends Layer {
    constructor(options: LayerOptions);
    backgroundProgram: any;
    quadBuffer: WebGLBuffer | null;
    sampleOpacity: number;
    initialize(map: mb.Map, gl: WebGLRenderingContext): void;
    setSampleFillColor(expr: ss.StylePropertyExpression): void;
    draw(gl: WebGLRenderingContext, matrix: number[], tile: Tile, offset: number[]): void;
}
declare const _default: (options: LayerOptions) => SampleFill;
export default _default;
