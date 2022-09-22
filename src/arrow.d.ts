import Layer, { LayerOptions } from "./layer";
import type * as mb from "mapbox-gl";
import type * as ss from "mapbox-gl/dist/style-spec";
import { Tile } from "./tileID";
declare class Arrows extends Layer {
    constructor(options: LayerOptions);
    private arrowsProgram;
    private cols;
    private rows;
    private positionsBuffer;
    private cornerBuffer;
    protected arrowMinSize: number;
    protected arrowHaloColor: {
        a: number;
        r: number;
        g: number;
        b: number;
    };
    initialize(map: mb.Map, gl: WebGLRenderingContext): void;
    setArrowColor(expr: ss.StylePropertyExpression): void;
    initializeGrid(): void;
    /**
     * This figures out the ideal number or rows and columns to show.
     *
     * NB: Returns [cols, rows] as that is [x,y] which makes more sense.
     */
    computeDimensions(gl: WebGLRenderingContext, map: mb.Map, minSize: number, cols: number, rows: number): number[];
    draw(gl: WebGLRenderingContext, matrix: number[], tile: Tile, offset: number[]): void;
}
declare const _default: (options: LayerOptions) => Arrows;
export default _default;
