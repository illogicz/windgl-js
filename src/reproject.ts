import { mat4 } from "gl-matrix";
import { reproject } from "./shaders/reproject.glsl";
import { Source } from "./timeSource";
import * as util from "./util";

/**
 * Reprojects WGS84 source image to mercator.
 */
export class Reprojector {

  constructor(private source: Source) {
    // Calc output size
    const b = this.source.bounds.concat();
    const mb = util.boundsToMerator(b);
    const w = mb[2] - mb[0];
    const h = mb[3] - mb[1];
    const [width] = source.dataSize;

    this.inputSize = source.dataSize;
    this.outputSize = [width, Math.round(width * h / w)];


    // Pixel to 0-1 lat/lon
    const m = mat4.create();
    mat4.translate(m, m, [0, 0.5, 0]);
    mat4.scale(m, m, [1 / 360, 1 / 180, 1]);
    mat4.mul(m, m, this.source.transformLatLon);
    mat4.scale(m, m, [...source.dataSize, 1]);

    this.transform = m;
    this.transformInv = mat4.invert(mat4.create(), m);

  }

  public initialize(gl: WebGLRenderingContext) {
    // TODO: move whatever possible here instead of reproject method

    this.gl = gl;
    this.program = reproject(gl);
    // Could use bounds coords in the vertices? and simplify transform
    this.quadBuffer = util.createBuffer(gl, new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 1
    ]))!;
    const [width, height] = this.source.dataSize;
    const texture = this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  public readonly inputSize: [number, number];
  public readonly outputSize: [number, number];

  private gl!: WebGLRenderingContext;
  private quadBuffer!: WebGLBuffer;
  private program!: GlslProgram;
  private texture!: WebGLTexture;
  private readonly transform: mat4;
  private readonly transformInv: mat4;

  reproject(image: ImageBitmap, target: WebGLFramebuffer | null = null) {
    const gl = this.gl;
    const program = this.program;

    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);

    util.bindTexture(gl, this.texture, 0);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

    gl.uniform1i(program.u_input, 0);
    gl.uniform2f(program.u_input_size, image.width, image.height);

    gl.uniformMatrix4fv(program.u_transform, false, this.transform);
    gl.uniformMatrix4fv(program.u_transform_inverse, false, this.transformInv);

    gl.viewport(0, 0, ...this.outputSize);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }

}
