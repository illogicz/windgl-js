import { update } from "../shaders/updateParticles.glsl";
import * as util from ".";
import { TimeSource } from "../time/timeSource";
import { mat4, vec3 } from "gl-matrix";


export class Heatmap {

  constructor(
    private source: TimeSource,
    private gl: WebGLRenderingContext
  ) {

    this.width = source.textureSize[0];
    this.height = source.textureSize[1];

    util.getExtension(gl)('OES_texture_float');

    this.quadBuffer = util.createBuffer(gl)!;
    this.frameBuffer = gl.createFramebuffer()!;

    this.heatmapTextures = [
      this.createTexture(gl),
      this.createTexture(gl)
    ];

    // Use a texture, vertices?
    // how to provide input data?
    this.sourceTexture = this.createTexture(gl);

    const { texToMerc, spanGlobe } = this.source.reprojector;
    const ratio = this.gridPixelRatio;
    const offset = mat4.scale(mat4.create(), texToMerc, [ratio, ratio, 1]);

    let p = this.updateProgram = update(gl);
    gl.useProgram(p.program);
    gl.uniform1i(p.u_tex_0, UV_TEX_UNIT_0);
    gl.uniform1i(p.u_tex_1, UV_TEX_UNIT_1);
    gl.uniform1f(p.u_span_globe, spanGlobe ? 1.0 : 0.0);
    gl.uniform1f(p.u_turbulance, this.turbulance);
    gl.uniform1f(p.u_dispersion, this.dispersion);
    gl.uniformMatrix4fv(p.u_offset, false, offset);
    gl.uniformMatrix4fv(p.u_offset_inverse, false, mat4.invert(mat4.create(), offset));

  }


  // Number of pixels per wind source pixel
  private readonly gridPixelRatio = 10;
  private readonly width: number;
  private readonly height: number;

  public turbulance = 0.01; // m/s
  public dispersion = 0.0001; // f/s

  // Resources
  private updateProgram: GlslProgram;
  private quadBuffer: WebGLBuffer;
  private heatmapTextures: [WebGLTexture, WebGLTexture];
  private frameBuffer: WebGLFramebuffer;
  private sourceTexture: WebGLTexture;


  /**
   * Update heatmap 
   * 
   * If steps is greater than 0, an attempt is made to run up to that
   * many simulation steps, updating the source time for each iteration.
   * If the source cannot provide the required data synchronously, it will 
   * exit early, and return the amount of time the simulation completed.
   * 
   * If no steps are provides, it will run once, without updating source time.
   * Intended for visualization purposes.
   * 
   * @param timeStep amount of time to advance per step
   * @param steps number of steps to take.
   * @returns amount of time the source was advanced
   */
  public async update(timeStep: number, steps = 0) {
    // Not progressing in time, nothing to do
    if (timeStep === 0) return 0;

    const gl = this.gl; const p = this.updateProgram;
    const textures = this.heatmapTextures;

    // gl.viewport(0, 0, this.width, this.height);
    // gl.useProgram(p.program);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer!);
    // gl.uniform1f(p.u_time_step, timeStep);

    const blendingEnabled = gl.isEnabled(gl.BLEND);

    let stepsComplete = 0;
    while (true) {
      // check with source if the resources needed are ready
      // (the 2 reprojected textures)
      if (!this.source.ready) break;

      if (gl.getParameter(gl.CURRENT_PROGRAM) !== p.program) {
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(p.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer!);
        gl.uniform1f(p.u_time_step, timeStep);
      }

      // Our input texture with positions 
      util.bindTexture(gl, textures[0], POS_TEX_UNIT);
      // Frame buffer for output texture
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[1], 0);

      // bind interpolator textures and mix value
      this.source.interpolator.bindTextures(gl, UV_TEX_UNIT_0, UV_TEX_UNIT_1, p.u_tex_a);

      // Disable blend mode
      gl.disable(gl.BLEND);

      // Run update
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // restore blend mode (for possible reprojections)
      // TODO: could be skipped if we know that no projections will happen
      if (blendingEnabled) gl.enable(gl.BLEND);

      // let interpolator know we are done
      this.source.interpolator.releaseTextures();

      // swap textures
      this.heatmapTextures.reverse();

      // Incr steps
      stepsComplete++;

      // Not actually stepping in time, so do not advance time
      if (!steps) break;

      // Update source time
      this.source.setTime(this.source.getTime() + timeStep / (60 * 60));

      // break if number of steps has completed
      if (stepsComplete === steps) break;
    }

    return stepsComplete * timeStep;
  }


  // Upload random position buffer
  private applyHeatmapState(gl: WebGLRenderingContext, data: Float32Array) {
    const level = 0, border = 0;
    const format = gl.RGBA;
    const type = gl.FLOAT;
    gl.texImage2D(gl.TEXTURE_2D, level, format,
      this.width, this.height, border, format, type, data);
  }

  private createTexture(gl: WebGLRenderingContext): WebGLTexture {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }


  // Free gl resources
  public dispose() {
    this.gl.deleteProgram(this.updateProgram.program);
    this.gl.deleteBuffer(this.quadBuffer);
    this.heatmapTextures?.forEach(t => this.gl?.deleteTexture(t));
    this.gl?.deleteFramebuffer(this.frameBuffer);
  }

}

const POS_TEX_UNIT = 0;
const UV_TEX_UNIT_0 = 1;
const UV_TEX_UNIT_1 = 2;
