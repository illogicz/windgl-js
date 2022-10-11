import { mat3 } from "gl-matrix";
import { Interpolator } from "../util/interpolate";
import { Reprojector } from "../util/reproject";


// TODO: 
// - Automate based on a current time value:
//   - Compressed image data cache. 
//   - Swapping of the 3 reprojection buffers
//   - Server providing info on new available data
//   - Then swap prediction for historic
// - Make factory:
//   - Preloads metadata to initialize with
//   - Make props private/readonly as needed
//   - And remove '!' hacks

export class TimeSource extends EventTarget {
  constructor(
    public readonly host: string,
    public readonly scope: string,
    private readonly metaEndpoint = "getWindPredictionMeta",
    private readonly dataEndpoint = "getWindPrediction"
  ) {
    super()
  }

  public gl?: WebGLRenderingContext | undefined;
  public reprojector!: Reprojector;
  public interpolator!: Interpolator;
  public images = new Map<number, Promise<Blob>>();
  public buffers: [BufferState, BufferState, BufferState] = [null, null, null];

  public dataSize: [number, number] = [0, 0];
  public get textureSize() { return this.reprojector?.outputSize }
  public uvMax!: number;
  public speedMax!: number;
  public bounds!: [number, number, number, number];

  public async loadMeta(time: number = new Date().valueOf() - 6 * HOUR): Promise<WindMetaData | undefined> {
    if (this.reprojector && this.interpolator) return;

    const data = await this.loadMetaData((time / HOUR));
    const { date, width, height, uvMax, bounds, ..._ } = data;
    this.bounds = bounds;
    this.uvMax = uvMax;
    this.speedMax = Math.sqrt(2 * data.uvMax ** 2);
    this.dataSize = [width, height];
    this.reprojector = new Reprojector([width, height], this.bounds);
    this.interpolator = new Interpolator(this.reprojector.outputSize, this.reprojector.spanGlobe);

    this.updateContext();
    return data;
  }

  public setContext(gl?: WebGLRenderingContext): void {
    if (this.gl === gl) return;
    this.gl = gl;
    this.updateContext();
  }

  public async loadMetaData(key: number): Promise<WindMetaData> {
    const params = this.getParams(key);

    const url = `${this.host}/${this.metaEndpoint}?${params}`;
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(`Error loading wind meta data ${url}`);

    return await resp.json();
  }

  public async loadImage(key: number): Promise<Blob> {
    let image = this.images.get(key);
    if (image) return image;
    const url = new URL(`${this.host}/${this.dataEndpoint}?${this.getParams(key)}`);
    image = (await fetch(url)).blob();
    this.images.set(key, image);
    return await image;
  }



  private time: number = -1;
  private t_index = -1;

  public getTime() {
    return this.time
  }
  public async setTime(time: number): Promise<RenderResponse> {
    const dt = time - this.t_index;
    this.time = time;

    // check if we are within 1/3 of the edge
    if (Math.abs(dt) > 2 / 3) {
      const t = this.t_index = Math.round(time);
      this.reproject(t - 1);
      this.reproject(t + 0);
      this.reproject(t + 1);
    }
    return this.canRender();
  }

  private async canRender(): Promise<RenderResponse> {
    // If either buffer is busy, wait it to be ready, and try again
    // (one buffer could have been invalidated while waiting for the other) 
    let response: RenderResponse = "sync";
    while (true) {
      const b0 = this.validBuffers[0];
      if (!b0 || b0.error) return false;
      if (b0.busy) { await b0.busy; response = "async"; continue }

      const b1 = this.validBuffers[1];
      if (!b1 || b1.error) return false;
      if (b1.busy) { await b1.busy; response = "async"; continue }

      // Nothing waiting, buffers valid, allowed to render
      this.interpolator?.setState(b0.key % 3, b1.key % 3, this.time - b0.key);

      this.dispatchEvent(new Event("ready"));
      return response;
    }
  }

  private get validBuffers(): [BufferState, BufferState] {
    // Get the time indexes and buffers for the current time
    const t0 = Math.floor(this.time), b0 = this.buffers[t0 % 3];
    const t1 = Math.ceil(this.time), b1 = this.buffers[t1 % 3];
    // Return the buffers if they are correct (should be always in theory)
    return b0?.key === t0 && b1?.key === t1 ? [b0, b1] : [null, null];
  }

  private async reproject(key: number): Promise<void> {
    // get current buffer state
    const idx = key % 3;
    const buffer = this.buffers[idx];

    // check if the correct one is already in there
    if (buffer && buffer.key === key) {
      return buffer.busy || Promise.resolve();
    }

    // Set new buffer state
    const state: BufferState = this.buffers[idx] = {
      key,
      busy: false,
      error: null
    };
    // initialize buffer state
    return state.busy = (async () => {
      try {
        // Get image promise
        const image = this.images.get(key) ?? this.loadImage(key);

        // wait for image decode (and/or load)
        const bitmap = await createImageBitmap(await image, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
          imageOrientation: 'flipY'
        });

        // make sure we still want this image in the buffer
        // could have changed during async opperation
        if (this.buffers[idx]?.key !== key) return;

        // get the target buffer, reproject image data into it
        const target = this.interpolator?.getBuffer(idx);
        this.reprojector?.reproject(bitmap, target);

      } catch (cause) {
        // fill with empty data ?
        state.error = new Error("Reproject Error", { cause });
      } finally {
        state.busy = false;
      }
    })();
  }

  private updateContext() {
    this.reprojector?.setContext(this.gl);
    this.interpolator?.setContext(this.gl);
  }

  private getParams(key: number) {
    const date = new Date(key * HOUR);
    return new URLSearchParams({
      scope: this.scope,
      year: date.getUTCFullYear().toString(),
      month: (date.getUTCMonth() + 1).toString(),
      day: date.getUTCDate().toString(),
      hour: date.getUTCHours().toString()
    }).toString();
  }

  // Test only
  public render() { this.interpolator?.render() }

}

type BufferState = {
  key: number,
  busy: Promise<void> | false,
  error: Error | null
} | null


export interface WindMetaData {
  date: Date;
  width: number;
  height: number;
  uvMax: number;
  bounds: [number, number, number, number],
  transform: mat3;
  image: string,
}

type RenderResponse = false | "sync" | "async";


const HOUR = 1000 * 60 * 60;
