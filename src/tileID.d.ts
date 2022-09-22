export declare type Tile = {
    z: number;
    x: number;
    y: number;
    wrap: number;
    toString(): string;
    parent(): Tile;
    children(): Tile[];
    siblings(): Tile[];
    isEqual(other: Tile): boolean;
    wgs84UnitBounds(): number[];
    viewMatrix(scale?: number): Float32Array;
    isRoot(): boolean;
    neighbor(hor: number, ver: number): Tile;
    quadrant(): number[];
    getTexture?: (gl: WebGLRenderingContext) => WebGLTexture;
};
declare const tile: (z: number, x: number, y: number, wrap?: number) => Tile;
export default tile;
