import * as util from ".";
import type { UVTSource } from "../time/UVTSource";


export type SimProgram = GlslProgram<
  "u_tex_0" |
  "u_tex_1" |
  "u_tex_a" |
  "u_time_step"
>;

/**
 * Base class for simulations
 */
export abstract class Simulation<Program extends SimProgram = SimProgram> {

  constructor(
    protected readonly program: Program,
    protected readonly source: UVTSource,
    protected readonly gl: WebGLRenderingContext,
    size: [number, number],
    programParams?: Partial<ProgramParams>
  ) {
    this.size = [size[0], size[1]];
    this.frameBuffer = gl.createFramebuffer()!;
    this.stateTextures = [
      this.createStateTexture(),
      this.createStateTexture()
    ];

    this.params = {
      uv_tex_0_unit: DEF_UV_TEX_0_UNIT,
      uv_tex_1_unit: DEF_UV_TEX_1_UNIT,
      input_tex_unit: DEF_INPUT_TEX_UNIT,
      u_tex_0: program.u_tex_0,
      u_tex_1: program.u_tex_1,
      u_tex_mix: program.u_tex_a,
      u_time_step: program.u_time_step,
      ...(programParams ?? {})
    };

    gl.useProgram(program.program);
    gl.uniform1i(this.params.u_tex_0, this.params.uv_tex_0_unit);
    gl.uniform1i(this.params.u_tex_1, this.params.uv_tex_1_unit);
  };

  public readonly size: readonly [number, number]

  // Resources
  protected readonly frameBuffer: WebGLFramebuffer;
  protected readonly stateTextures: [WebGLTexture, WebGLTexture];
  protected readonly params: Required<Readonly<ProgramParams>>;

  protected beforeUpdate(): void { };
  protected afterUpdate(): void { };
  protected abstract prepareUpdate(program: Program, timeStep: number): void;
  protected abstract executeUpdate(program: Program, timeStep: number): void;
  protected abstract initializeStateTexture(): void;
  protected abstract get textureFilter(): number;

  /**
   * Update sim state. 
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
    const p = this.program;
    const { uv_tex_0_unit, uv_tex_1_unit, u_tex_mix, u_time_step, input_tex_unit } = this.params;
    const textures = this.stateTextures;
    const blendingEnabled = gl.isEnabled(gl.BLEND);
    this.source.supressEvent = true;

    let stepsComplete = 0;
    while (true) {
      // check with source if the resources needed are ready
      // (the 2 reprojected textures)
      if (!this.source.ready) break;

      this.beforeUpdate();

      // Reapply program state if is was changed
      if (gl.getParameter(gl.CURRENT_PROGRAM) !== p.program) {
        gl.useProgram(p.program);
        gl.viewport(0, 0, ...this.size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        gl.uniform1f(u_time_step, timeStep);
        gl.disable(gl.BLEND);
        this.prepareUpdate(p, timeStep);
        this.source.interpolator.releaseTextures();
      }

      // Our input texture with positions 
      util.bindTexture(gl, textures[0], input_tex_unit);

      // Frame buffer for output texture
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[1], 0);

      // bind interpolator textures and mix value
      this.source.interpolator.bindTextures(gl, uv_tex_0_unit, uv_tex_1_unit, u_tex_mix);

      // execute program
      this.executeUpdate(p, timeStep);

      // restore blend mode (for possible reprojection operation)
      if (blendingEnabled) gl.enable(gl.BLEND);

      // swap textures
      textures.reverse();

      // Incr steps
      stepsComplete++;

      // Not actually stepping in time, so do not advance time
      if (!steps) break;

      // Update source time
      this.source.setTime(this.source.time + timeStep / (60 * 60));

      this.afterUpdate();

      // stop if number of steps has completed
      if (stepsComplete === steps) break;
    }

    // let interpolator know we are done
    this.source.interpolator.releaseTextures();

    this.source.supressEvent = false;
    return stepsComplete * timeStep;
  }

  public reset() {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.stateTextures[0]);
    this.initializeStateTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.stateTextures[1]);
    this.initializeStateTexture();
  }

  // Create particle position texture
  protected createStateTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.textureFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.textureFilter);
    this.initializeStateTexture();
    return texture;
  }

  // Free gl resources
  public dispose() {
    this.gl.deleteProgram(this.program.program);
    this.stateTextures.forEach(t => this.gl.deleteTexture(t));
    this.gl.deleteFramebuffer(this.frameBuffer);
  }

}


type ProgramParams = {
  u_tex_0: number,
  u_tex_1: number,
  u_tex_mix: number,
  u_time_step: number,
  uv_tex_0_unit?: number,
  uv_tex_1_unit?: number,
  input_tex_unit?: number
}

export const DEF_UV_TEX_0_UNIT = 0;
export const DEF_UV_TEX_1_UNIT = 1;
export const DEF_INPUT_TEX_UNIT = 2;
