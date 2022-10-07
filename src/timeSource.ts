import { mat3, mat4 } from "gl-matrix";
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
export class TimeSource {
  constructor(
    public readonly host: string,
    public readonly scope: string,
    private readonly metaEndpoint = "getWindPredictionMeta",
    private readonly dataEndpoint = "getWindPrediction"
  ) { }

  // make private/readonly some of this
  public gl?: WebGLRenderingContext | undefined;
  public reprojector?: Reprojector;
  public interpolator?: Interpolator;
  public images = new Map<number, Blob>();

  public initialized = false;
  public dataSize: [number, number] = [0, 0];
  public get textureSize() { return this.reprojector?.outputSize }
  public uvMax!: number;
  public speedMax!: number;
  public bounds!: [number, number, number, number];

  public async load() {
    if (this.reprojector && this.interpolator) return;

    const data = await this.loadMetaData((new Date().valueOf() / HOUR) - 6);
    const { date, width, height, uvMax, bounds, ..._ } = data;
    this.bounds = bounds;
    this.uvMax = uvMax;
    this.speedMax = Math.sqrt(2 * data.uvMax ** 2);
    this.dataSize = [width, height];
    this.reprojector = new Reprojector([width, height], this.bounds);
    this.interpolator = new Interpolator(this.reprojector.outputSize, this.reprojector.spanGlobe);

    this.updateContext();
  }

  public setContext(gl?: WebGLRenderingContext) {
    if (this.gl === gl) return;
    this.gl = gl;
    this.updateContext();
  }

  private updateContext() {
    this.reprojector?.setContext(this.gl);
    this.interpolator?.setContext(this.gl);
  }

  public async loadMetaData(key: number): Promise<WindMetaData> {
    const params = this.getParams(key);

    const url = `${this.host}/${this.metaEndpoint}?${params}`;
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(`Error loading wind meta data ${url}`);

    return await resp.json();
  }

  public async loadImage(key: number) {
    let image = this.images.get(key);
    if (image) return image;
    const url = new URL(`${this.host}/${this.dataEndpoint}?${this.getParams(key)}`);
    const res = await fetch(url);
    image = await res.blob();
    this.images.set(key, image);
    return image;
  }

  public setState(t0: number, t1: number, a: number) {
    this.interpolator?.setState(t0, t1, a);
  }

  // Test only
  public render() { this.interpolator?.render() }

  public async reproject(idx: number, key: number) {
    let image = this.images.get(key);
    if (!image) image = await this.loadImage(key);
    const bitmap = await createImageBitmap(image, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
      imageOrientation: 'flipY'
    });
    const target = this.interpolator?.getBuffer(idx);
    this.reprojector?.reproject(bitmap, target);
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