import { interpolate } from "../shaders/interpolate.glsl";
import { mat4 } from "gl-matrix";
import { createBuffer, getExtension } from ".";

/**
 * Provides 2 textures and a mix value for interpolation to a program. 
 */
export class Interpolator {

  constructor(private size: readonly [number, number], wrap: boolean) {
    // seems broken
    //if (wrap) this.wrap_s = WebGLRenderingContext.REPEAT;
  };

  // paramters
  private tex_0 = 0;
  private tex_1 = 1;
  private tex_a = 0;
  private matrix?: mat4;

  // resources
  private gl?: WebGLRenderingContext | undefined;
  private program: GlslProgram | null = null;
  private textures: [WebGLTexture, WebGLTexture, WebGLTexture] | null = null;
  // TODO: only a single buffer, and swap textures?
  private buffers: [WebGLFramebuffer, WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private quads: WebGLBuffer | null = null;

  // Texture parameters
  private tex_type = WebGLRenderingContext.UNSIGNED_BYTE;
  private tex_format = WebGLRenderingContext.RGBA;
  private buf_attach = WebGLRenderingContext.COLOR_ATTACHMENT0;
  private wrap_s = WebGLRenderingContext.CLAMP_TO_EDGE;
  public filter = WebGLRenderingContext.LINEAR;

  public setContext(gl?: WebGLRenderingContext) {
    if (this.gl === gl) return;
    if (this.gl) this.dropContext(this.gl);
    if (!(this.gl = gl)) return;

    // Use half float extension
    // TODO, backup format and shader in case not available? 
    const t_half = getExtension(gl)('OES_texture_half_float')!;
    const f_half = getExtension(gl)('EXT_color_buffer_half_float')!;
    const l_half = getExtension(gl)('OES_texture_half_float_linear')!;
    this.tex_type = t_half.HALF_FLOAT_OES;
    this.tex_format = gl.RGBA; // No RGB16F_EXT/RGB16F_EXT ?
    //this.buf_attach = f_half.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT;

    // move this

    const [t0, t1, t2] = [
      this.createTexture(gl),
      this.createTexture(gl),
      this.createTexture(gl)
    ];
    this.textures = [t0[0], t1[0], t2[0]];
    this.buffers = [t0[1], t1[1], t2[1]];

    const m = this.matrix = mat4.create();
    mat4.translate(m, m, [0.5, 0.5, 1]);
    mat4.scale(m, m, [this.size[0] - 1, this.size[1] - 1, 1]);
    mat4.translate(m, m, [0, 0.5, 0]);

  }

  private dropContext(gl: WebGLRenderingContext) {
    this.program != null && gl.deleteProgram(this.program.program);
    this.quads != null && gl.deleteBuffer(this.quads);
    this.textures?.forEach(t => gl.deleteTexture(t));
    this.buffers?.forEach(b => gl.deleteFramebuffer(b));
    this.program = this.quads = this.textures = this.buffers = null;
  }

  getBuffer(idx: number): WebGLFramebuffer | undefined {
    return this.buffers?.[idx];
  }

  setState(tex_0: number, tex_1: number, mix: number): void {
    this.tex_0 = tex_0;
    this.tex_1 = tex_1;
    this.tex_a = mix;
  }

  /**
   * Bind the textures and mix uniform for the current state
   * unbind *must* be called once operations are completed.
   * 
   * @param gl 
   * @param texture_unit_0 
   * @param texture_unit_1 
   * @param mix_uniform_loc 
   */
  bindTextures(
    gl: WebGLRenderingContext,
    texture_unit_0: number,
    texture_unit_1: number,
    mix_uniform_loc: number
  ): void {
    if (!this.textures) throw new Error("interpolator not ready");
    if (gl !== this.gl) throw new Error("invalid gl context");

    if (this.bound_tex_0 !== this.tex_0) {
      gl.activeTexture(gl.TEXTURE0 + texture_unit_0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_0]!);
      this.bound_tex_0 = this.tex_0;
    }
    if (this.bound_tex_1 !== this.tex_1) {
      gl.activeTexture(gl.TEXTURE0 + texture_unit_1);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_1]!);
      this.bound_tex_1 = this.tex_1;
    }
    gl.uniform1f(mix_uniform_loc, this.tex_a);
  }
  // Store currently bound texture indexes
  private bound_tex_0 = -1;
  private bound_tex_1 = -1;
  releaseTextures() {
    this.bound_tex_0 = -1;
    this.bound_tex_1 = -1;
  }



  // standalone render, test mostly
  render(): void {
    const gl = this.gl; if (!gl) return;
    let p = this.program;
    if (!p) {
      this.quads = createBuffer(gl);

      p = this.program = interpolate(gl); if (!p) return;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u_matrix, false, this.matrix!);
      gl.uniform1i(p.u_tex_0, 0);
      gl.uniform1i(p.u_tex_1, 1);

    } else {
      gl.useProgram(p.program);
    }

    gl.enableVertexAttribArray(p.a_pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    gl.vertexAttribPointer(p.a_pos, 2, gl.FLOAT, false, 0, 0);

    this.bindTextures(gl, 0, 1, p.u_tex_a);

    gl.viewport(0, 0, ...this.size);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }



  private createTexture(gl: WebGLRenderingContext): [WebGLTexture, WebGLFramebuffer] {
    // Create texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // TODO wrap for full earth span. 
    // - Hmm, linear filter wont repeat
    //   Because float16? or always, couldnt find out
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrap_s); // gl.REPEAT
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.filter);

    // Create its data storage
    const level = 0, border = 0;
    const format = this.tex_format;
    const type = this.tex_type;
    gl.texImage2D(gl.TEXTURE_2D, level, format,
      this.size[0], this.size[1], border, format, type, null);

    // Make frame buffer for drawing to the texture
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, this.buf_attach, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return [texture, fb];
  }

}
