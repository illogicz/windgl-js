import { mat4, vec2, mat2, ReadonlyVec2, ReadonlyMat4 } from "gl-matrix";
import { reproject } from "../shaders/data/reproject.glsl";
import * as util from "../util";

/**
 * Reprojects WGS84 source image to mercator.
 */
export class Reprojector {

  constructor(
    [width, height]: ReadonlyVec2,
    public readonly boundsDeg: [number, number, number, number],
  ) {

    // Check if we are within a pixel of spanning the globe
    const edgeDist = 360 - boundsDeg[2] + boundsDeg[0];
    const edgeDistPx = edgeDist * width / 360;
    this.spanGlobe = Math.ceil(Math.abs(edgeDistPx)) <= 1;
    // If so, split the difference
    if (this.spanGlobe) {
      // mutating the ref
      boundsDeg[0] -= edgeDist / 2;
      boundsDeg[2] += edgeDist / 2;
    }

    // Calc output size
    const mb = this.mercBoundsNorm = util.normMerc(util.boundsToMerator(boundsDeg));
    const w = mb[2] - mb[0];
    const h = mb[1] - mb[3];
    this.inputSize = [width, height];
    this.outputSize = [width, Math.round(width * h / w)];

    // Merc transform
    const m = mat4.create();
    mat4.translate(m, m, [mb[0], mb[1], 0]);
    mat4.scale(m, m, [w, -h, 1]);
    this.texToMerc = mat4.clone(m);
    this.mercToTex = mat4.clone(mat4.invert(m, m));

    // Lat/lon transform.
    const h_deg = (boundsDeg[3] - boundsDeg[1]) / 180;
    mat4.identity(m);
    mat4.translate(m, m, [mb[0], boundsDeg[1] / 180 + 0.5, 0]);
    mat4.scale(m, m, [w, h_deg, 1]);
    this.texToDeg = mat4.clone(m);
    this.degToTex = mat4.clone(mat4.invert(m, m));
  }

  public setContext(gl?: WebGLRenderingContext) {
    if (this.gl === gl) return;
    if (this.gl) this.dropContext(this.gl);
    if (!(this.gl = gl)) return;

    // TODO: move whatever possible here instead of reproject method
    this.program = reproject(gl);
    // Could use bounds coords in the vertices? and simplify transform
    this.quadBuffer = util.createBuffer(gl);
    const [width, height] = this.outputSize;
    const texture = this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private dropContext(gl: WebGLRenderingContext) {
    this.program != null && gl.deleteProgram(this.program.program);
    this.quadBuffer != null && gl.deleteBuffer(this.quadBuffer);
    this.texture != null && gl.deleteTexture(this.texture);
    this.texture = this.program = this.quadBuffer = null;
  }

  public readonly inputSize: ReadonlyVec2;
  public readonly outputSize: ReadonlyVec2;
  public readonly spanGlobe: boolean;
  public readonly mercBoundsNorm: number[];

  public readonly mercToTex: mat4;
  public readonly texToMerc: mat4;

  public readonly degToTex: ReadonlyMat4;
  public readonly texToDeg: mat4;

  private gl?: WebGLRenderingContext | undefined;
  private quadBuffer: WebGLBuffer | null = null;
  private program: GlslProgram | null = null;
  private texture: WebGLTexture | null = null;

  reproject(image: ImageBitmap, target: WebGLFramebuffer) {
    const gl = this.gl, p = this.program;
    if (!gl || !p || !this.texture || !this.quadBuffer) {
      throw new Error("Reprojector not ready");
    }

    gl.useProgram(p.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    util.bindTexture(gl, this.texture, 0);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    util.bindAttribute(gl, this.quadBuffer, p.a_pos, 2);

    gl.uniform1i(p.u_input, 0);
    gl.uniform2f(p.u_input_size, image.width, image.height);

    gl.uniformMatrix4fv(p.u_transform, false, this.texToDeg);
    gl.uniformMatrix4fv(p.u_transform_inverse, false, this.degToTex as mat4);

    gl.viewport(0, 0, this.outputSize[0], this.outputSize[1]);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }


  private _readCanvas?: HTMLCanvasElement;
  private get readCanvas() {
    if (!this._readCanvas) {
      this._readCanvas = document.createElement("canvas");
      this._readCanvas.width = this.inputSize[0];
      this._readCanvas.height = this.inputSize[1];
    }
    return this._readCanvas;
  }
  readCoordinates(image: ImageBitmap, coords: vec2[]): vec2[] {
    const bm_ctx = this.readCanvas.getContext("bitmaprenderer")!;
    const ctx = this.readCanvas.getContext("2d")!;
    bm_ctx.transferFromImageBitmap(image);
    return coords.map(c => {
      const [x, y] = vec2.mul(vb0, vec2.transformMat4(vb0, c, this.degToTex), this.inputSize);
      const { data } = ctx.getImageData(x, y, 2, 2);
      const fx = util.fract(x);
      const uv0 = vec2.lerp(vb0, rgbToUint(data, 0), rgbToUint(data, 4), fx);
      const uv1 = vec2.lerp(vb1, rgbToUint(data, 8), rgbToUint(data, 12), fx);
      return uintToUV(vec2.lerp(vb0, uv0, uv1, util.fract(y)));
    });
  }

}


const rgbToUint = (data: Uint8ClampedArray, offset: number): vec2 => [
  // UUUUUUUU-UUUUVVVV-VVVVVVVV-aaaaaaaa
  data[offset + 0] << 4 | data[offset + 1] >> 4,
  (data[offset + 1] & 0b1111) << 8 | data[offset + 2]
];
const uintToUV = (uint: vec2): vec2 => [
  uint[0] / 0xFFF * 80 - 40,
  uint[1] / 0xFFF * 80 - 40
];

const vb0 = vec2.create();
const vb1 = vec2.create();
