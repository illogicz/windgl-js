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
  public readonly numParticles = this.particles_res ** 2;
  public get positions() { return this.particleTextures[0] }
  public get indexes() { return this.particleIndexBuffer }

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

    this.randomParticleState = new Float32Array(this.numParticles * 3);
    const bounds = src.reprojector?.mercBoundsNorm;
    const x_range = bounds[2] - bounds[0];
    const y_range = bounds[3] - bounds[1];
    const rand = (pad: number) => Math.random() * (1 + pad) - this.padding;
    for (let i = 0, j = 0; i < this.numParticles; i++) {
      this.randomParticleState[j++] = bounds[0] + rand(this.source.reprojector.spanGlobe ? 0 : this.padding) * x_range;
      this.randomParticleState[j++] = (1 - (bounds[1] + rand(this.padding) * y_range));
      this.randomParticleState[j++] = 0;
    }
    const particleIndices = new Float32Array(this.numParticles);
    for (let i = 0; i < this.numParticles; i++) particleIndices[i] = i;
    this.particleIndexBuffer = util.createBuffer(gl, particleIndices)!;
  }

  public update(timeStep: number, steps: number = 1) {

    // Not progressing in time, nothing to do
    if (timeStep === 0) return true;

    const gl = this.gl;
    const p = this.updateProgram;
    const textures = this.particleTextures;

    gl.viewport(0, 0, this.particles_res, this.particles_res);
    gl.useProgram(p.program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer!);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[1], 0);

    const blendingEnabled = gl.isEnabled(gl.BLEND);
    gl.disable(gl.BLEND);

    util.bindTexture(gl, textures[0], POS_TEX);
    util.bindAttribute(gl, this.quadBuffer!, p.a_particles, 2);

    gl.uniform1f(p.u_rand_seed, Math.random());
    gl.uniform1f(p.u_time_step, timeStep);

    //-----------------------------------
    // loop here for multiple sim steps per render cycle
    // or just loop in shader even.

    // only u_tex_a should be getting updated 99 of the time
    this.source.interpolator.bind(p, gl, UV_TEX_0, UV_TEX_1, p.u_tex_a);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // swap textures or should we use two buffers and swap those?
    // https://stackoverflow.com/a/40626660 
    this.particleTextures.reverse();

    //---------------


    // set blend mode back
    if (blendingEnabled) gl.enable(gl.BLEND);

    return true;

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
