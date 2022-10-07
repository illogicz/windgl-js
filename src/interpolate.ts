import { interpolate } from "./shaders/interpolate.glsl";
import { mat4 } from "gl-matrix";
import { getExtension } from "./util";


export class Interpolator {

  constructor(private size: [number, number], wrap: boolean) {
    if (wrap) this.wrap_s = WebGLRenderingContext.REPEAT;
  };

  setContext(gl?: WebGLRenderingContext) {
    if (this.gl === gl) return;
    if (this.gl) this.dropContext(this.gl);
    if (!(this.gl = gl)) return;

    const t_half = getExtension(gl)('OES_texture_half_float')!;
    const f_half = getExtension(gl)('EXT_color_buffer_half_float')!;
    const l_half = getExtension(gl)('OES_texture_half_float_linear')!;
    this.tex_type = t_half.HALF_FLOAT_OES;
    this.tex_format = gl.RGB; //.RGB16F_EXT; // No RG16F_EXT ?
    //this.buf_attach = f_half.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT;

    const p = this.program = interpolate(gl);
    gl.useProgram(p.program);

    gl.uniform1i(p.u_tex_0, 0);
    gl.uniform1i(p.u_tex_1, 1);

    const [t0, t1, t2] = [
      this.createTexture(gl),
      this.createTexture(gl),
      this.createTexture(gl)
    ];
    this.textures = [t0[0], t1[0], t2[0]];
    this.buffers = [t0[1], t1[1], t2[1]];

    const quads = this.quads = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quads);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(
      [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]
    ), gl.STATIC_DRAW);

    const m = this.matrix = mat4.create();
    mat4.translate(m, m, [0.5, 0.5, 1]);
    mat4.scale(m, m, [this.size[0] - 1, this.size[1] - 1, 1]);
    mat4.translate(m, m, [0, 0.5, 0]);
    gl.uniformMatrix4fv(p.u_matrix, false, this.matrix);

  }

  private dropContext(gl: WebGLRenderingContext) {
    this.program != null && gl.deleteProgram(this.program.program);
    this.quads != null && gl.deleteBuffer(this.quads);
    this.textures?.forEach(t => gl.deleteTexture(t));
    this.buffers?.forEach(b => gl.deleteFramebuffer(b));
    this.program = this.quads = this.textures = this.buffers = null;
  }

  // drawToBuffer(idx: number, fn:() => void){

  // }

  getBuffer(idx: number) {
    return this.buffers?.[idx];
  }

  setState(t0: number, t1: number, a: number) {
    this.tex_0 = t0;
    this.tex_1 = t1;
    this.tex_a = a;
  }

  bind(program: GlslProgram, gl: WebGLRenderingContext) {
    if (!this.textures) return;

    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_0]!);

    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_1]!);

    gl.uniform1f(program.u_tex_a, this.tex_a);
  }

  render() {
    const gl = this.gl, p = this.program;
    if (!gl || !p) return;

    gl.useProgram(p.program);

    gl.enableVertexAttribArray(p.a_pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    gl.vertexAttribPointer(p.a_pos, 2, gl.FLOAT, false, 0, 0);

    this.bind(p, gl)

    gl.viewport(0, 0, ...this.size);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private tex_0 = 0;
  private tex_1 = 1;
  private tex_a = 0;
  private matrix?: mat4;

  private gl?: WebGLRenderingContext | undefined;
  private program: GlslProgram | null = null;
  private textures: [WebGLTexture, WebGLTexture, WebGLTexture] | null = null;
  private buffers: [WebGLFramebuffer, WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private quads: WebGLBuffer | null = null;

  private tex_type = WebGLRenderingContext.UNSIGNED_BYTE;
  private tex_format = WebGLRenderingContext.RGBA;
  private buf_attach = WebGLRenderingContext.COLOR_ATTACHMENT0;
  private wrap_s = WebGLRenderingContext.CLAMP_TO_EDGE;
  public filter = WebGLRenderingContext.LINEAR;

  private createTexture(gl: WebGLRenderingContext) {

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // TODO wrap for full earth span. Hmm, linear filter wont repeat
    // Because float16? or always, couldnt find out
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.filter);

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

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return [texture, fb] as const;
  }

}
