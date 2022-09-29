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
  getFilter(): TextureFilter;
  setFilter(f: TextureFilter, gl?: WebGLRenderingContext): void;
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
  speedMax: number;
  minzoom: number;
  maxzoom: number;
  tiles: string[];
}

export type TextureFilter = "LINEAR" | "NEAREST";

export const createSource = (relUrl: string): WindSource => {
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
  let data: WindSourceSpec;
  let tileRequests: Record<string, TileCallback[]> = {};
  let requestsBeforeMetadataLoaded = new Set<Tile>();
  let dataCallbacks: MetaCallback[] = [];
  let cache: Record<string, (gl: WebGLRenderingContext) => WebGLTexture> = {};
  let filter: TextureFilter = "LINEAR";

  getJSON(url, (windData: WindSourceSpec) => {
    data = windData;

    const { uMin, vMin, uMax, vMax } = data;

    // Precompute actual theoretical max (not just based on the positive values)
    data.speedMax = Math.sqrt(
      Math.max(uMax ** 2, uMin ** 2) +
      Math.max(vMax ** 2, vMin ** 2)
    );

    dataCallbacks.forEach(cb => cb(data));
    requestsBeforeMetadataLoaded.forEach(tile => {
      if (cache[tile.key]) {
        let req;
        while ((req = tileRequests[tile.key].pop())) {
          dispatchCallback(tile, req);
        }
      } else {
        load(tile);
      }
    });
    requestsBeforeMetadataLoaded.clear();
  });

  function dispatchCallback(tile: Tile, cb: TileCallback) {
    cb(Object.assign(tile, { getTexture: cache[tile.key] }));
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
      cache[tile.key] = (gl: WebGLRenderingContext) => {
        if (texture) return texture;
        texture = util.createTexture(gl, gl[filter], windImage);
        return texture;
      };
      let req;
      while ((req = tileRequests[tile.key].pop())) {
        dispatchCallback(tile, req);
      }
    };
  }

  return {
    getFilter() { return filter },
    setFilter(f: TextureFilter, gl?: WebGLRenderingContext) {
      filter = f;
      if (!gl) return;
      const pname = gl[filter];
      Object.values(cache).forEach(tile => {
        const texture = tile(gl);
        if (!texture) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pname);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pname);
      })
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
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
      if (cache[tile.key]) {
        dispatchCallback(tile, cb);
      } else {
        if (data) {
          if (tileRequests[tile.key]) {
            tileRequests[tile.key].push(cb);
          } else {
            tileRequests[tile.key] = [cb];
            load(tile);
          }
        } else {
          tileRequests[tile.key] = (tileRequests[tile.key] || []).concat([cb]);
          (requestsBeforeMetadataLoaded as Set<Tile>).add(tile);
        }
      }
    }
  };
};
