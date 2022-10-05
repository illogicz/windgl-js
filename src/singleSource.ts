import * as util from "./util";
import type { mat3, mat4 } from "gl-matrix";
import { Reprojector } from "./reproject";
import { TextureFilter } from "./tileSource";


export interface WindMetaData {
  date: Date;
  width: number;
  height: number;
  uvMax: number;
  bounds: [number, number, number, number],
  transform: mat3;
  image: string,
}
export interface WindTexture {
  (gl: WebGLRenderingContext): WebGLTexture
}

export class Source {
  constructor(
    public readonly host: string,
    public readonly scope: string,
    private readonly metaEndpoint = "getWindPredictionMeta",
    private readonly dataEndpoint = "getWindPrediction"
  ) { }

  public filter: TextureFilter = "LINEAR";

  public textures = new Map<string, WindTexture>()
  public initialized = false;
  public width!: number;
  public height!: number;
  public uvMax!: number;
  public speedMax!: number;
  public bounds!: [number, number, number, number];
  public transformLatLon!: mat4;

  //public transformLatLonInv!: mat4;
  //public transform!: mat4;
  //public transformInv!: mat4;
  private reprojector!: Reprojector;


  public initialize() {
    return this.load(new Date().valueOf(), false);
  }

  private test(data: Uint8ClampedArray, orig: HTMLImageElement) {
    const [w, h] = this.reprojector.outputSize;
    const test = new ImageData(data, w, h, { colorSpace: "srgb" });

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: "srgb" });

    ctx?.putImageData(test, 0, 0);
    console.log("2d", ctx?.getContextAttributes());
    canvas.style.left = w + "px";
    orig.style.left = w * 2 + "px";

    Array.from(document.getElementsByClassName("test"))?.forEach(d => d.remove());

    const container = document.createElement("div");
    container.className = "test";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.position = "absolute";
    container.style.zIndex = "99998";
    container.style.transformOrigin = "top left"
    container.style.transform = `scale(${window.innerHeight / (canvas.height * 2 + this.height)})`;
    container.style.top = "0";
    container.style.left = "0";

    document.body.appendChild(container);

    container.appendChild(orig);
    container.appendChild(this.reprojector.canvas);
    container.appendChild(canvas);
  }

  public async load(timestamp: number, loadImage = true) {

    const date = new Date(timestamp);
    const year = date.getUTCFullYear().toString();
    const month = (date.getUTCMonth() + 1).toString();
    const day = date.getUTCDate().toString();
    const hour = date.getUTCHours().toString();
    const key = `${year}/${month}/${day}-${hour.padStart(2, "0")}:00:00`;

    if (this.textures.has(key)) return this.textures.get(key);

    const params = new URLSearchParams({ scope: this.scope, year, month, day, hour }).toString();

    //try {

    // load meta data. (can probably skip/split, expecting params to be consistent)
    const url = `${this.host}/${this.metaEndpoint}?${params}`;
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(`Error loading wind meta data ${url}`);
    const data: WindMetaData = await resp.json();

    const { date: _, image, transform, ...rest } = data;

    Object.assign(this, rest);

    this.speedMax = Math.sqrt(2 * data.uvMax ** 2);
    if (!this.initialized) {
      this.transformLatLon = util.mat3toMat4(transform);
      this.reprojector = new Reprojector(this);
    }
    this.initialized = true;
    if (!loadImage) return;

    // load image
    const windImage = new Image();

    const imageUrl = new URL(`${this.host}/${this.dataEndpoint}?${params}`);
    if (imageUrl.origin !== window.location.origin) {
      windImage.crossOrigin = "anonymous";
    }
    windImage.src = imageUrl.toString();
    await windImage.decode();

    const imageDataMerc = this.reprojector.reproject(windImage);
    this.test(imageDataMerc, windImage);

    const texture = (gl: WebGLRenderingContext) => {
      return util.createTexture(gl, gl[this.filter], imageDataMerc, this.reprojector.outputSize[0], this.reprojector.outputSize[1]);
    }

    this.textures.set(key, texture);
    return texture;

  }
}
