import type { mat3, mat4 } from "gl-matrix";
import { Interpolator } from "./interpolate";
import { Reprojector } from "./reproject";
import * as util from "./util";


export interface WindMetaData {
  date: Date;
  width: number;
  height: number;
  uvMax: number;
  bounds: [number, number, number, number],
  transform: mat3;
  image: string,
}

export interface WindTexturePair {
  tex1: WindTexture;
  tex2: WindTexture;
  a: number;
}

export interface WindTexture {
  (gl: WebGLRenderingContext): WebGLTexture
}

// TODO: Make factory function that preloads metadata so we can initialize with it
export class Source {
  constructor(
    public readonly host: string,
    public readonly scope: string,
    private readonly metaEndpoint = "getWindPredictionMeta",
    private readonly dataEndpoint = "getWindPrediction"
  ) { }

  // make private/readonly some of this
  public gl!: WebGLRenderingContext;
  public canvas!: HTMLCanvasElement;
  public reprojector!: Reprojector;
  public interpolator!: Interpolator;
  public images = new Map<number, HTMLImageElement>();

  public initialized = false;
  public dataSize: [number, number] = [0, 0];
  public get textureSize() { return this.reprojector.outputSize }
  public uvMax!: number;
  public speedMax!: number;
  public bounds!: [number, number, number, number];
  public transformLatLon!: mat4;
  public transformMerc!: mat4;

  public initialize() {
    return this.loadMetaData((new Date().valueOf() / HOUR) - 6);
  }

  public async loadMetaData(key: number) {
    const params = this.getParams(key);

    const url = `${this.host}/${this.metaEndpoint}?${params}`;
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(`Error loading wind meta data ${url}`);

    const data: WindMetaData = await resp.json();
    this._initialize(data);
  }

  public render(t0: number, t1: number, a: number) {
    this.interpolator.setState(t0, t1, a);
    this.interpolator.render();
  }

  public reproject(idx: number, key: number) {
    const image = this.images.get(key);
    if (!image) throw new Error("image not loaded, " + key);

    const target = this.interpolator.getBuffer(idx);
    this.reprojector.reproject(image, target);
  }

  private _initialize(data: WindMetaData) {
    // maybe check if meta params match, in case
    if (this.initialized) return;

    const { date: _, image, width, height, ...rest } = data;
    Object.assign(this, rest);

    this.speedMax = Math.sqrt(2 * data.uvMax ** 2);
    this.dataSize = [width, height];

    this.transformLatLon = util.mat3toMat4(data.transform);
    this.reprojector = new Reprojector(this);
    this.interpolator = new Interpolator(this);

    const [w, h] = this.reprojector.outputSize

    // TODO: get canvas/context from somewhere else
    const canvas = this.canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const gl = this.gl = canvas.getContext("webgl", { premultipliedAlpha: false })!;
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    this.reprojector.initialize(gl);
    this.interpolator.initialize(gl);

    this.initialized = true;
  }

  public async loadImage(key: number) {

    if (this.images.has(key)) return this.images.get(key);

    const img = new Image();
    const url = new URL(`${this.host}/${this.dataEndpoint}?${this.getParams(key)}`);
    if (url.origin !== window.location.origin) img.crossOrigin = "anonymous";

    img.src = url.toString();
    await img.decode();
    this.images.set(key, img);

    return img;

    // const imageDataMerc = this.reprojector.reproject(windImage);
    // const size = this.reprojector.outputSize;
    // this.test(imageDataMerc, windImage);

    // const texture = (gl: WebGLRenderingContext) => {
    //   return util.createTexture(gl, gl[this.filter], imageDataMerc, size[0], size[1]);
    // }

    // this.textures.set(key, texture);
    // return texture;
  }


  private getParams(key: number) {
    const date = new Date(key * HOUR);
    const year = date.getUTCFullYear().toString();
    const month = (date.getUTCMonth() + 1).toString();
    const day = date.getUTCDate().toString();
    const hour = date.getUTCHours().toString();
    return new URLSearchParams({ scope: this.scope, year, month, day, hour }).toString();
  }

}


const HOUR = 1000 * 60 * 60;