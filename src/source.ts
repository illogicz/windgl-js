import type { Tile } from "./tileID";
import * as util from "./util";

function getJSON(url: URL, callback: any) {
  const xhr = new XMLHttpRequest();
  xhr.responseType = "json";
  xhr.open("get", url, true);
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      callback(xhr.response);
    } else {
      throw new Error(xhr.statusText);
    }
  };
  xhr.send();
}


type TileCallback = (tile: Tile) => void;
type MetaCallback = (data: WindSourceSpec) => void;

export interface WindSource {
  metadata(cb: MetaCallback): void;
  unlisten(cb: MetaCallback): void;
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

export default (relUrl: string): WindSource => {
  const url = new URL(relUrl, window.location as any);
  /**
   * A note on how this works:
   * 0. At any moment we can recieve a request for a tile.
   * 1. Before we can fulfil such a request, we need to load metadata. So we store tile requests that were issued before
   *    metadata was loaded and once it loads we issue requests for the tiles once that is done.
   * 2. If metadata is loaded, we check if there already has been a request for the same tile. If yes, we simply add
   *    the callback to the queue, otherwise we save the callback and load the image.
   * 3. When an image is loaded we store the data in a cache and empty the queue of all relevant callbacks by calling them.
   * 4. If there is already data in the cache, simply call the callback right away.
   */
  let tileRequests: Record<any, TileCallback[]> = {};
  let data: WindSourceSpec;
  let requestsBeforeMetadataLoaded: Set<any> | any[] = new Set();
  let cache: Record<string, (gl: WebGLRenderingContext) => WebGLTexture> = {};
  let dataCallbacks: MetaCallback[] = [];

  getJSON(url, (windData: WindSourceSpec) => {
    data = windData;
    dataCallbacks.forEach(cb => cb(data));
    requestsBeforeMetadataLoaded.forEach(tile => {
      if (cache[tile]) {
        let req;
        while ((req = tileRequests[tile].pop())) {
          dispatchCallback(tile, req);
        }
      } else {
        load(tile);
      }
    });
    requestsBeforeMetadataLoaded = [];
  });

  function dispatchCallback(tile: Tile, cb: TileCallback) {
    cb(Object.assign(tile, { getTexture: cache[tile.toString()] }));
  }

  function load(tile: Tile) {
    const windImage = new Image();
    const tileUrl = new URL(
      data.tiles[0]
        .replace(/{z}/g, tile.z.toString())
        .replace(/{x}/g, tile.x.toString())
        .replace(/{y}/g, tile.y.toString()),
      url
    );
    if (tileUrl.origin !== window.location.origin) {
      windImage.crossOrigin = "anonymous";
    }
    windImage.src = tileUrl.toString();
    windImage.onload = () => {
      let texture: WebGLTexture | null;
      cache[tile.toString()] = (gl: WebGLRenderingContext) => {
        if (texture) return texture;
        texture = util.createTexture(gl, gl.LINEAR, windImage);
        return texture;
      };
      let req;
      while ((req = tileRequests[tile.toString()].pop())) {
        dispatchCallback(tile, req);
      }
    };
  }

  return {
    unlisten(cb) {
      dataCallbacks = dataCallbacks.filter(c => c !== cb);
    },
    metadata(cb) {
      if (data) {
        cb(data);
      } else {
        dataCallbacks.push(cb);
      }
    },
    loadTile(tile, cb) {
      if (cache[tile.toString()]) {
        dispatchCallback(tile, cb);
      } else {
        if (data) {
          if (tileRequests[tile.toString()]) {
            tileRequests[tile.toString()].push(cb);
          } else {
            tileRequests[tile.toString()] = [cb];
            load(tile);
          }
        } else {
          tileRequests[tile.toString()] = (tileRequests[tile.toString()] || []).concat([cb]);
          (requestsBeforeMetadataLoaded as Set<Tile>).add(tile);
        }
      }
    }
  };
};
