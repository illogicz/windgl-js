import * as util from "../util";
import { update, UpdateProgram } from "../shaders/updateParticles.glslx";
import { UVTSource } from "../data/UVTSource";
import { DEF_INPUT_TEX_UNIT, Simulation } from "./simulation";

export type ParticleOptions = {
  /** Chance a particle is dropped per second */
  dropRate: number,
  /** Increased chance per m/s */
  dropRateBump: number,

  numParticles: number;

  //readonly bounds: number[];

  readonly padding: number,
  readonly maxParticles: number,

  readonly timeStep: number,
  readonly maxSteps: number,
}


export class Particles extends Simulation<UpdateProgram> {

  constructor(
    source: UVTSource,
    gl: WebGLRenderingContext,
    public readonly options: ParticleOptions
  ) {

    util.getExtension(gl)('OES_texture_float');
    console.log(options);;
    const p = update(gl);
    const nump = options.maxParticles ?? 2 ** 20;
    const dim = Math.ceil(Math.sqrt(nump));
    if (dim * dim < nump) throw new Error("Particle texture dimension insufficient for num particles");

    super(p, source, gl, [dim, dim]);

    const buffer = util.createBuffer(gl);
    if (!buffer) throw "no buffer";
    this.quadBuffer = buffer;
    // Create particle index buffer
    const particleIndices = new Float32Array(dim * dim);
    for (let i = 0; i < dim * dim; i++) particleIndices[i] = i;
    this.particleIndexBuffer = util.createBuffer(gl, particleIndices)!;

    this.reset();

    const { mercToTex, texToMerc, spanGlobe } = this.source.reprojector;

    gl.useProgram(p.program);
    gl.uniform1i(p.u_particles, DEF_INPUT_TEX_UNIT);
    gl.uniform1f(p.u_span_globe, spanGlobe ? 1.0 : 0.0);
    gl.uniform2f(p.u_padding, spanGlobe ? 0 : options.padding, options.padding);
    gl.uniform1f(p.u_drop_rate, options.dropRate);
    gl.uniform1f(p.u_drop_rate_bump, options.dropRateBump);
    gl.uniformMatrix4fv(p.u_offset, false, texToMerc);
    gl.uniformMatrix4fv(p.u_offset_inverse, false, mercToTex);

  };


  // Resources
  private quadBuffer: WebGLBuffer;
  private particleIndexBuffer: WebGLBuffer;
  private randomParticleState?: Float32Array;


  // Dimension used for particle position texture
  public get positions() { return this.stateTextures[0] }
  public get indexes() { return this.particleIndexBuffer }

  public get numParticles() {
    const [w, h] = this.size;
    // Clamp and round off row count
    const rows = Math.max(0, Math.min(h, Math.ceil(this.options.numParticles / h)));
    return rows * w;
  }
  // public set numParticles(num: number) {
  //   const [w, h] = this.size; 
  //   // Clamp and round off row count
  //   const rows = Math.max(0, Math.min(h, Math.ceil(num / h)));
  //   this._numParticles = rows * w;
  // }
  // private _numParticles!: number;


  protected prepareUpdate(p: UpdateProgram, timeStep: number): void {
    const renderPerc = this.numParticles / (this.size[0] * this.size[1]);
    this.gl.uniform1f(p.u_render_perc, renderPerc);
    util.bindAttribute(this.gl, this.quadBuffer, p.a_particles, 2);
  }

  protected executeUpdate(p: UpdateProgram, timeStep: number): void {
    //util.bindAttribute(this.gl, this.quadBuffer, p.a_particles, 2);
    this.gl.uniform1f(p.u_rand_seed, Math.random());
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    //this.gl.disableVertexAttribArray(p.a_particles);
  }

  public override get textureFilter() { return this.gl.NEAREST }
  protected initializeStateTexture() {
    const level = 0, border = 0;
    const format = this.gl.RGBA;
    const type = this.gl.FLOAT;
    this.gl.texImage2D(this.gl.TEXTURE_2D, level, format,
      this.size[0], this.size[1], border, format, type, this.getRandomParticleState());
  }

  private getRandomParticleState() {
    if (!this.randomParticleState) {
      if (!this.options) return null;
      // Generate random positions for each particles
      const bounds = this.source.reprojector.mercBoundsNorm
      const maxParticles = this.size[0] * this.size[1];
      this.randomParticleState = new Float32Array(maxParticles * 4);
      const x_range = bounds[2] - bounds[0];
      const y_range = bounds[3] - bounds[1];
      const padding = this.options.padding;

      const rand = (pad: number) => Math.random() * (1 + pad * 2) - pad;
      for (let i = 0, j = 0; i < maxParticles; i++) {
        let x = bounds[0] + rand(this.source.reprojector.spanGlobe ? 0 : padding) * x_range;
        let y = bounds[1] + rand(padding) * y_range;
        x *= 0xFFFF, y *= 0xFFFF;

        this.randomParticleState[j++] = x - Math.floor(x);
        this.randomParticleState[j++] = y - Math.floor(y);
        this.randomParticleState[j++] = Math.floor(x);
        this.randomParticleState[j++] = Math.floor(y);
      }
    }
    return this.randomParticleState;
  }

  public override dispose() {
    super.dispose();
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteBuffer(this.particleIndexBuffer);
  }

}
