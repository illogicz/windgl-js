import * as util from "../util";
import { LayerOptions, PropertySpecs } from "../baseLayer";
import { TimeLayer } from "./timeLayer";
import { TimeSource } from "./timeSource";
import { update } from "../shaders/updateParticles.glsl";
import { draw } from "../shaders/drawParticles.glsl";
//
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";

export type ParticleProps = "particle-color";
export type ParticleOptions = LayerOptions<ParticleProps>


export class ParticleLayer extends TimeLayer<ParticleProps> {

  constructor(options: ParticleOptions, source?: TimeSource) {
    super(defaultPropertySpec, options, source);
  }

  public dropRate = 0.01;
  public dropRateBump = 0.01
  public speedFactor = 500.0;
  private readonly particles_res = 2 ** 10;
  private readonly numParticles = this.particles_res ** 2;

  private updateProgram?: GlslProgram;
  private drawProgram?: GlslProgram;
  private quadBuffer?: WebGLBuffer;
  private particleIndexBuffer?: WebGLBuffer;
  private particleBuffers?: [
    { texture: WebGLTexture, buffer: WebGLFramebuffer },
    { texture: WebGLTexture, buffer: WebGLFramebuffer }
  ];

  private randomParticleState?: Float32Array;


  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;

    util.getExtension(gl)('OES_texture_float');

    this.updateProgram = update(gl);
    this.drawProgram = draw(gl);
    this.quadBuffer = util.createBuffer(gl)!;

    this.initializeParticles(gl);
    this.particleBuffers = [
      this.createParticleBuffer(gl),
      this.createParticleBuffer(gl)
    ];
    return true;
  }

  protected override uninitialize() {
    if (this.updateProgram != null) {
      this.gl?.deleteProgram(this.updateProgram.program);
      delete this.updateProgram;
    }
    if (this.drawProgram != null) {
      this.gl?.deleteProgram(this.drawProgram.program);
      delete this.drawProgram;
    }
    if (this.quadBuffer != null) {
      this.gl?.deleteBuffer(this.quadBuffer);
      delete this.quadBuffer;
    }
    if (this.particleIndexBuffer != null) {
      this.gl?.deleteBuffer(this.particleIndexBuffer);
      delete this.particleIndexBuffer;
    }
    this.particleBuffers?.forEach(t => {
      this.gl?.deleteTexture(t.texture);
      this.gl?.deleteFramebuffer(t.buffer);
    });
    delete this.particleBuffers;
    super.uninitialize();
  }

  private initializeParticles(gl: WebGLRenderingContext) {
    const src = this.source; if (!src) throw "poop";

    this.randomParticleState = new Float32Array(this.numParticles * 3);
    const bounds = src.reprojector?.mercBoundsNorm;
    const x_range = bounds[2] - bounds[0];
    const y_range = bounds[3] - bounds[1];
    for (let i = 0, j = 0; i < this.numParticles; i++) {
      // randomizes the initial particle positions
      // TODO, we want to take control of this, 
      // make particles sources with associated qualities
      this.randomParticleState[j++] = Math.random();
      this.randomParticleState[j++] = Math.random();
      this.randomParticleState[j++] = 0;

    }
    const particleIndices = new Float32Array(this.numParticles);
    for (let i = 0; i < this.numParticles; i++) particleIndices[i] = i;
    this.particleIndexBuffer = util.createBuffer(gl, particleIndices)!;
  }

  override prerender(gl: WebGLRenderingContext) {

    const buffers = this.particleBuffers; if (!buffers) return;
    const p = this.updateProgram; if (!p) return;
    const m = this.source?.reprojector.mercToTex; if (!m) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[1].buffer);
    gl.viewport(0, 0, this.particles_res, this.particles_res);

    gl.useProgram(p.program);


    const blendingEnabled = gl.isEnabled(gl.BLEND);
    gl.disable(gl.BLEND);

    // update ------------
    // a_particles = 0-1 quad ?
    // u_particles = particle data texture
    // u_offset_inverse = mecrator to data text coord
    // u_speed_factor
    // u_tex_0, u_tex_1, u_tex_a = from interpolator


    util.bindTexture(gl, buffers[0].texture, POS_TEX);
    gl.uniform1i(p.u_particles, POS_TEX);

    this.source?.interpolator.bind(p, gl, UV_TEX_0, UV_TEX_1, p.u_tex_a);

    gl.uniform1i(p.u_tex_0, UV_TEX_0);
    gl.uniform1i(p.u_tex_1, UV_TEX_1);


    util.bindAttribute(gl, this.quadBuffer!, p.a_particles, 2);

    gl.uniformMatrix4fv(p.u_offset_inverse, false, m);
    gl.uniform1f(p.u_speed_factor, this.speedFactor);

    // rand ---------------------------------------------
    gl.uniform1f(p.u_rand_seed, Math.random());
    gl.uniform1f(p.u_drop_rate, this.dropRate);
    gl.uniform1f(p.u_drop_rate_bump, this.dropRateBump);
    // --------------------------------------------------


    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // swap buffer
    this.particleBuffers?.reverse();

    // set blend mode back
    if (blendingEnabled) gl.enable(gl.BLEND);

    // tell map it can repaint
    this.map!.triggerRepaint();


  }


  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    const p = this.drawProgram; if (!p) return;
    const src = this.source; if (!src) return;
    const p_tex = this.particleBuffers?.[0].texture; if (!p_tex) return;
    src.setContext(gl);

    gl.useProgram(p.program);

    // draw shader paramas  -------------
    // u_matrix = view matrix
    // u_particles = particle data texture
    // u_particles_res = particles_tex_size
    // a_index = particle indexes array bufferm [0:numParticles]
    // u_wrap = world repeat

    // view matrix
    gl.uniformMatrix4fv(p.u_matrix, false, matrix);

    // particle position texture
    //util.bindTexture(gl, p_textexture, POS_TEX);
    gl.activeTexture(gl.TEXTURE0 + POS_TEX);
    gl.bindTexture(gl.TEXTURE_2D, p_tex);
    gl.uniform1i(p.u_particles, POS_TEX);

    // texture dimensions
    gl.uniform1f(p.u_particles_res, this.particles_res);

    // particle indexes
    util.bindAttribute(gl, this.particleIndexBuffer!, p.a_index, 1);


    // draw particles
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - src.bounds[2]) / 360 + 0.5);
    const ri = Math.floor((r - src.bounds[0]) / 360 + 0.5);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.POINTS, 0, this.particles_res * this.particles_res);
    }

  }


  private createParticleBuffer(gl: WebGLRenderingContext): { texture: WebGLTexture; buffer: WebGLFramebuffer; } {
    // Create texture

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Create its data storage
    const level = 0, border = 0;
    const format = gl.RGB;
    const type = gl.FLOAT;
    gl.texImage2D(gl.TEXTURE_2D, level, format,
      this.particles_res, this.particles_res, border, format, type, this.randomParticleState!);

    // Make frame buffer for drawing to the texture
    const buffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, buffer };
  }
}

const defaultPropertySpec: PropertySpecs<ParticleProps> = {
  "particle-color": {
    type: "color",
    default: "white",
    transition: true,
    overridable: true,
    expression: {
      interpolated: true,
      parameters: ["zoom", "feature"],
    },
    "property-type": "data-driven",
  },
}


const POS_TEX = 0;
const UV_TEX_0 = 1;
const UV_TEX_1 = 2;
