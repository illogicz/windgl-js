import { mat3 } from "gl-matrix";
import { Interpolator } from "../util/interpolate";
import { Reprojector } from "../util/reproject";


// TODO: 
// - Automate based on a current time value:
//   - Server providing info on new available data
//   - Then swap prediction for historic

export class TimeSource extends EventTarget {
  constructor(
    data: WindMetaData,
    public readonly scope: string,
    private readonly metaUrl: string,
    private readonly dataUrl: string
  ) {
    super()
    const { date, width, height, uvMax, bounds, ..._ } = data;
    this.bounds = bounds;
    this.uvMax = uvMax;
    this.speedMax = Math.sqrt(2 * data.uvMax ** 2);
    this.dataSize = [width, height];
    this.reprojector = new Reprojector([width, height], this.bounds);
    this.interpolator = new Interpolator(this.reprojector.outputSize, this.reprojector.spanGlobe);
  }

  public gl?: WebGLRenderingContext | undefined;
  public reprojector: Reprojector;
  public interpolator: Interpolator;
  public images = new Map<number, Promise<Blob | Error>>();
  public buffers: [BufferState, BufferState, BufferState] = [null, null, null];

  public dataSize: [number, number] = [0, 0];
  public get textureSize() { return this.reprojector?.outputSize }
  public uvMax: number;
  public speedMax: number;
  public bounds: [number, number, number, number];

  public setContext(gl?: WebGLRenderingContext): void {
    if (this.gl === gl) return;
    this.gl = gl;
    this.updateContext();
  }

  public async loadImage(key: number): Promise<Blob | Error> {
    let image = this.images.get(key);
    if (image) return image;
    const url = new URL(`${this.dataUrl}?${getParams(key, this.scope)}`);
    image = (await fetch(url)).blob();
    image = fetch(url)
      .then(res => {
        const dataPromise = res.blob();
        this.images.set(key, dataPromise);
        return dataPromise
      }).then(image => {
        this.images.set(key, Promise.resolve(image));
        return image;
      }).catch(e => {
        this.images.set(key, e);
        return e;
      });
    this.images.set(key, image);
    return image;
  }

  private time: number = -1;
  private t_index = -1;

  public ready: boolean = false;
  public getTime() {
    return this.time
  }


  //private waiting = false;
  public setTime(time: number): Promise<RenderResponse> {
    if (!this.gl) throw new Error("source not ready");
    //if (this.waiting) return false;

    this.ready = false;
    //this.waiting = true;

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
      if (!this.interpolator) return false;
      this.interpolator.setState(b0.key % 3, b1.key % 3, this.time - b0.key);

      this.ready = true;
      //console.log("ready", this.time - b0.key);
      this.dispatchEvent(new Event("timeChanged"));

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
        // wait for image decode (and/or load)
        const image = await (this.images.get(key) ?? this.loadImage(key));
        if (image instanceof Error) throw image;

        // mMke sure we still want this image in the buffer
        // could have changed during async opperation
        if (this.buffers[idx]?.key !== key) throw new Error("Invalid image");

        // Decode PNG to bitmap data
        const bitmap = await createImageBitmap(image, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
          imageOrientation: 'flipY'
        });

        // Validate again
        if (this.buffers[idx]?.key !== key) throw new Error("Invalid bitmap");

        // Get the target buffer, reproject image data into it
        const target = this.interpolator!.getBuffer(idx);
        if (!target) throw new Error("no target buffer");

        this.reprojector.reproject(bitmap, target);

      } catch (cause) {
        console.log(cause);
        // fill with empty data ?
        state.error = new Error("Reproject Error", { cause });
      } finally {
        state.busy = false;
      }
    })();
  }

  private updateContext() {
    this.reprojector.setContext(this.gl);
    this.interpolator.setContext(this.gl);
  }

  // Test only
  public render() { this.interpolator.render() }

}


export async function loadSource(
  host: string,
  scope: string,
  metaEndpoint = "getWindPredictionMeta",
  dataEndpoint = "getWindPrediction"
) {
  const dataUrl = `${host}/${dataEndpoint}`;
  const metaUrl = `${host}/${metaEndpoint}`;
  const initTime = Math.floor(new Date().valueOf() / (60 * 60 * 1000));
  const metaData = await loadMetaData(initTime, scope, metaUrl);
  return new TimeSource(metaData, scope, metaUrl, dataUrl);
}

async function loadMetaData(key: number, scope: string, path: string): Promise<WindMetaData> {
  const params = getParams(key, scope);
  const url = `${path}?${params}`;
  const resp = await fetch(url);
  if (resp.status !== 200) throw new Error(`Error loading wind meta data ${url}`);
  return await resp.json();
}


function getParams(key: number, scope: string) {
  const date = new Date(key * HOUR);
  return new URLSearchParams({
    scope: scope,
    year: date.getUTCFullYear().toString(),
    month: (date.getUTCMonth() + 1).toString(),
    day: date.getUTCDate().toString(),
    hour: date.getUTCHours().toString()
  }).toString();
}


type BufferState = {
  key: number,
  busy: Promise<void> | false,
  error: Error | null
} | null


interface WindMetaData {
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
