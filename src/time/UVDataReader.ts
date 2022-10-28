import { fract, HOUR } from "../util";
import { mat3, vec2, ReadonlyMat3 } from "gl-matrix";
import { UVTSource } from "./UVTSource";

export class UVDataReader {
  constructor(private source: UVTSource) {
    const proj = source.reprojector;
    const [w, h] = proj.inputSize;
    const b = proj.boundsDeg;
    const m = this.degToPixel = mat3.create();
    mat3.scale(m, m, [
      w / (b[2] - b[0]),
      h / (b[3] - b[1])
    ]);
    mat3.translate(m, m, [-b[0], -b[1]]);
  }
  private readonly degToPixel: ReadonlyMat3;


  public async readSamples<T extends { time: number, coordinate: vec2, uv?: vec2 }>(samples: T[]) {
    samples = samples.sort((a, b) => a.time - b.time);
    const contexts: UVTContext[] = [];
    const px: vec2 = [0, 0];
    let data0: UVTContext | undefined = undefined;
    let data1: UVTContext | undefined = undefined;
    for (const sample of samples) {
      const h = sample.time / HOUR;
      const f = fract(h);
      const pixel = vec2.transformMat3(px, sample.coordinate, this.degToPixel);
      if (data0?.key !== Math.floor(h) || data1?.key !== Math.ceil(h)) {
        ([data0, data1] = await Promise.all([
          this.getContext(contexts, Math.floor(h)).busy,
          this.getContext(contexts, Math.ceil(h)).busy
        ]));
        this.getContext(contexts, Math.ceil(h) + 1).busy?.then(() => undefined);
      }
      const uv0 = this.sample(pixel, data0!.data!);
      const uv1 = this.sample(pixel, data1!.data!);
      sample.uv = vec2.lerp([0, 0], uv0, uv1, f);
    }
    contexts.forEach(this.returnContext);
    return samples;
  }

  private getContext(contexts: UVTContext[], key: number): UVTContext {
    let ctx = contexts[key % 3];
    if (!ctx) ctx = contexts[key % 3] = this.rentContext(key);
    if (ctx.key !== key) {
      ctx.key = key;
      delete ctx.data;
      ctx.busy = this.getImageBitmap(key).then(image => {
        ctx.ctx.drawImage(image, 0, 0);
        ctx.data = ctx.ctx.getImageData(0, 0, ctx.ctx.canvas.width, ctx.ctx.canvas.width);
        return ctx;
      });
    }
    return ctx;
  }


  private sample([x, y]: vec2, data: ImageData) {
    //const v = this.samplePrev([x, y], ctx);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // x/y interpolate
    const uv0 = vec2.lerp(vb0, rgbToUint(data, ix, iy), rgbToUint(data, ix + 1, iy), fx);
    const uv1 = vec2.lerp(vb1, rgbToUint(data, ix, iy + 1), rgbToUint(data, ix + 1, iy + 1), fx);
    return uintToUV(vec2.lerp(vb0, uv0, uv1, fy));
  }
  private async getImageBitmap(key: number) {
    const image = await this.source.loadImage(key);
    if (image instanceof Error) throw image;
    return await createImageBitmap(image, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
      imageOrientation: 'flipY'
    });
  }

  private contextPool: UVTContext[] = [];
  private rentContext(key: number) {
    const idx = this.contextPool.findIndex(b => b.key === key);
    if (idx >= 0) this.contextPool.splice(idx, 1)[0];

    const b = this.contextPool.pop();
    if (b) return b;

    const [w, h] = this.source.reprojector.inputSize;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true
    })!
    return { ctx };
  }

  private returnContext = (context: UVTContext) => {
    this.contextPool.push(context);
  }
}

type UVTContext = {
  key?: number,
  busy?: Promise<UVTContext>
  data?: ImageData,
  ctx: CanvasRenderingContext2D;
}

const vb0 = vec2.create();
const vb1 = vec2.create();

const rgbToUint = ({ width, height, data }: ImageData, x: number, y: number): vec2 => {
  x = Math.max(0, Math.min(width, x));
  y = Math.max(0, Math.min(height, y));
  const offset = (y * width + x) * 4;
  return [
    // UUUUUUUU-UUUUVVVV-VVVVVVVV-aaaaaaaa
    data[offset + 0] << 4 | data[offset + 1] >> 4,
    (data[offset + 1] & 0b1111) << 8 | data[offset + 2]
  ]
};
const uintToUV = (uint: vec2): vec2 => [
  uint[0] / 0xFFF * 80 - 40,
  uint[1] / 0xFFF * 80 - 40
];
