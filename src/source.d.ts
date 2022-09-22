import type { Tile } from "./tileID";
declare type TileCallback = (tile: Tile) => void;
export interface WindSource {
    metadata(cb: (data: WindSourceSpec) => void): void;
    loadTile(tile: Tile, cb: TileCallback): void;
}
export interface WindSourceSpec {
    source: string;
    date: Date;
    width: number;
    height: number;
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
    minzoom: number;
    maxzoom: number;
    tiles: string[];
}
declare const _default: (relUrl: string) => WindSource;
export default _default;
