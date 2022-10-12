import { update } from "../shaders/updateParticles.glsl";
import * as util from "../util";
import { TimeSource } from "./timeSource";


export class Particles {

  constructor(
    private source: TimeSource,
    private gl: WebGLRenderingContext) {
    this.initialize(gl);
  };


  public dropRate = 0.00005;
  public dropRateBump = 0.0001;
  public readonly particles_res = 2 ** 10;
  public get positions() { return this.particleTextures[0] }
  public get indexes() { return this.particleIndexBuffer }

  // Round off to resolution
  public set numParticles(num: number) {
    this._numParticles = Math.ceil(num / this.particles_res) * this.particles_res;
  }
  public get numParticles() {
    return this._numParticles;
  }
  private _numParticles = this.particles_res ** 2;

  private readonly padding = 0.05;
  private updateProgram!: GlslProgram;
  private quadBuffer!: WebGLBuffer;
  private particleIndexBuffer!: WebGLBuffer;
  private particleTextures!: [WebGLTexture, WebGLTexture];
  private frameBuffer!: WebGLFramebuffer;
  private randomParticleState!: Float32Array;

  protected initialize(gl: WebGLRenderingContext) {

    util.getExtension(gl)('OES_texture_float');

    this.quadBuffer = util.createBuffer(gl)!;
    this.frameBuffer = gl.createFramebuffer()!;

    this.initializeParticles(gl);
    this.particleTextures = [
      this.createParticleTexture(gl),
      this.createParticleTexture(gl)
    ];
    const { mercToTex, texToMerc, spanGlobe } = this.source.reprojector;

    let p = this.updateProgram = update(gl);
    gl.useProgram(p.program);
    gl.uniform1i(p.u_particles, POS_TEX);
    gl.uniform1i(p.u_tex_0, UV_TEX_0);
    gl.uniform1i(p.u_tex_1, UV_TEX_1);
    gl.uniform1f(p.u_span_globe, spanGlobe ? 1.0 : 0.0);
    gl.uniform2f(p.u_padding, spanGlobe ? 0 : this.padding, this.padding);
    gl.uniform1f(p.u_drop_rate, this.dropRate);
    gl.uniform1f(p.u_drop_rate_bump, this.dropRateBump);
    gl.uniformMatrix4fv(p.u_offset, false, texToMerc);
    gl.uniformMatrix4fv(p.u_offset_inverse, false, mercToTex);
  }

  public dispose() {
    this.gl.deleteProgram(this.updateProgram.program);
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteBuffer(this.particleIndexBuffer);
    this.particleTextures?.forEach(t => this.gl?.deleteTexture(t));
    this.gl?.deleteFramebuffer(this.frameBuffer);
  }

  private initializeParticles(gl: WebGLRenderingContext) {
    const src = this.source;

    const numParticles = this.particles_res ** 2
    this.randomParticleState = new Float32Array(numParticles * 3);
    const bounds = src.reprojector?.mercBoundsNorm;
    const x_range = bounds[2] - bounds[0];
    const y_range = bounds[3] - bounds[1];
    const rand = (pad: number) => Math.random() * (1 + pad) - this.padding;
    for (let i = 0, j = 0; i < numParticles; i++) {
      this.randomParticleState[j++] = bounds[0] + rand(this.source.reprojector.spanGlobe ? 0 : this.padding) * x_range;
      this.randomParticleState[j++] = (1 - (bounds[1] + rand(this.padding) * y_range));
      this.randomParticleState[j++] = 0;
    }
    const particleIndices = new Float32Array(numParticles);
    for (let i = 0; i < numParticles; i++) particleIndices[i] = i;
    this.particleIndexBuffer = util.createBuffer(gl, particleIndices)!;
  }

  /**
   * Update particles. 
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

    const gl = this.gl;
    const p = this.updateProgram;
    const textures = this.particleTextures;

    gl.viewport(0, 0, this.particles_res, this.particles_res);
    gl.useProgram(p.program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer!);

    const blendingEnabled = gl.isEnabled(gl.BLEND);

    util.bindAttribute(gl, this.quadBuffer!, p.a_particles, 2);

    gl.uniform1f(p.u_rand_seed, Math.random());
    gl.uniform1f(p.u_time_step, timeStep);
    gl.uniform1f(p.u_render_perc, this.numParticles / (this.particles_res ** 2));

    let stepsComplete = 0;
    while (true) {
      if (!this.source.ready) break;

      // input texture 
      util.bindTexture(gl, textures[0], POS_TEX);
      // render to output texture
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[1], 0);

      // bind interpolator textures and mix value
      this.source.interpolator.bind(gl, UV_TEX_0, UV_TEX_1, p.u_tex_a);

      // run update
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (blendingEnabled) gl.enable(gl.BLEND);

      // swap textures
      this.particleTextures.reverse();


      stepsComplete++;
      if (!steps) break;
      const tBefore = this.source.getTime();
      this.source.setTime(this.source.getTime() + timeStep / (60 * 60));
      const tAfter = this.source.getTime();
      if (tBefore === tAfter) break;
      if (stepsComplete === steps) break;

    }
    this.source.interpolator.unbind();


    return stepsComplete * timeStep;
  }

  public randomize() {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.particleTextures[0]);
    this.applyParticleState(this.gl, this.randomParticleState!);
  }

  private applyParticleState(gl: WebGLRenderingContext, data: Float32Array) {
    const level = 0, border = 0;
    const format = gl.RGB;
    const type = gl.FLOAT;
    gl.texImage2D(gl.TEXTURE_2D, level, format,
      this.particles_res, this.particles_res, border, format, type, data);
  }

  private createParticleTexture(gl: WebGLRenderingContext): WebGLTexture {
    // Create texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.applyParticleState(gl, this.randomParticleState!)
    return texture;
  }

}

const POS_TEX = 0;
const UV_TEX_0 = 1;
const UV_TEX_1 = 2;
