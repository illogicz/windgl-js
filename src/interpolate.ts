import { interpolate } from "./shaders/interpolate.glsl";
import { mat4 } from "gl-matrix";
import { getExtension } from "./util";


export class Interpolator {

  constructor(private size: [number, number]) { };

  initialize(gl: WebGLRenderingContext) {
    this.gl = gl;

    const t_half = getExtension(gl)('OES_texture_half_float')!;
    const f_half = getExtension(gl)('EXT_color_buffer_half_float')!;
    getExtension(gl)('OES_texture_half_float_linear')!;
    this.tex_type = t_half.HALF_FLOAT_OES;
    this.tex_format = gl.RGB; // f_half.RGB16F_EXT; // No RG16F_EXT ?
    //this.buf_attach = f_half.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT;

    const p = this.program = interpolate(gl);
    gl.useProgram(p.program);

    gl.uniform1i(p.u_tex_0, 0);
    gl.uniform1i(p.u_tex_1, 1);

    this.createTexture(gl, 0);
    this.createTexture(gl, 1);
    this.createTexture(gl, 2);

    // create
    const quads = this.quads = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quads);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    // bind

    const m = this.matrix = mat4.create();
    mat4.scale(m, m, [...this.size, 1]);
    mat4.translate(m, m, [0, 0.5, 0]);
    gl.uniformMatrix4fv(p.u_matrix, false, this.matrix);

  }

  // drawToBuffer(idx: number, fn:() => void){

  // }

  getBuffer(idx: number) {
    return this.buffers[idx];
  }

  setState(t0: number, t1: number, a: number) {
    this.tex_0 = t0;
    this.tex_1 = t1;
    this.tex_a = a;
  }

  render() {
    const p = this.program;
    const gl = this.gl;

    gl.useProgram(p.program);

    gl.enableVertexAttribArray(p.a_pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    gl.vertexAttribPointer(p.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_0]!);

    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_1]!);

    gl.uniform1f(p.u_tex_a, this.tex_a);

    gl.viewport(0, 0, ...this.size);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

  }


  private tex_0 = 0;
  private tex_1 = 1;
  private tex_a = 0;

  private gl!: WebGLRenderingContext;
  private program!: GlslProgram;
  private matrix!: mat4;
  private textures: [WebGLTexture, WebGLTexture, WebGLTexture] = [0, 0, 0];
  private buffers: [WebGLFramebuffer, WebGLFramebuffer, WebGLFramebuffer] = [0, 0, 0];

  private tex_type = WebGLRenderingContext.UNSIGNED_BYTE;
  private tex_format = WebGLRenderingContext.RGBA;
  private buf_attach = WebGLRenderingContext.COLOR_ATTACHMENT0;

  private quads!: WebGLBuffer;

  private createTexture(gl: WebGLRenderingContext, idx: number) {

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const level = 0, border = 0;
    const format = this.tex_format;
    const type = this.tex_type;
    const internalFormat = format;

    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
      ...this.size, border, format, type, null);


    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, this.buf_attach, gl.TEXTURE_2D, texture, 0);

    this.textures[idx] = texture;
    this.buffers[idx] = fb;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

}