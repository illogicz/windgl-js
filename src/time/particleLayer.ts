import { LayerOptions, PropertySpecs } from "../baseLayer";
import { draw } from "../shaders/drawParticles.glsl";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { TimeSource } from "./timeSource";
//
import { mat4, vec3 } from "gl-matrix";
import { Particles } from "./particles";

export type ParticleProps = "particle-color";
export type ParticleOptions = LayerOptions<ParticleProps>


export class ParticleLayer extends TimeLayer<ParticleProps> {

  constructor(options: ParticleOptions, source?: TimeSource) {
    super(defaultPropertySpec, options, source);
  }

  public particles?: Particles;
  public timeStep = 1;
  private drawProgram?: GlslProgram;
  private quadBuffer?: WebGLBuffer;


  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;

    util.getExtension(gl)('OES_texture_float');

    this.particles = new Particles(this.source!, gl)

    this.quadBuffer = util.createBuffer(gl)!;

    const p = this.drawProgram = draw(gl);
    gl.useProgram(p.program);
    gl.uniform1i(p.u_particles, POS_TEX);
    gl.uniform1f(p.u_particles_res, this.particles.particles_res);

    return true;
  }

  protected override uninitialize() {
    if (this.drawProgram != null) {
      this.gl?.deleteProgram(this.drawProgram.program);
      delete this.drawProgram;
    }
    if (this.quadBuffer != null) {
      this.gl?.deleteBuffer(this.quadBuffer);
      delete this.quadBuffer;
    }
    if (this.particles != null) {
      this.particles.dispose();
      delete this.particles;
    }

    super.uninitialize();
  }

  override prerender(gl: WebGLRenderingContext) {
    if (this.particles?.update(this.timeStep, 1)) {
      this.map!.triggerRepaint();
    }
  }

  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    const p = this.drawProgram; if (!p) return;
    const src = this.source; if (!src) return;
    const p_tex = this.particles?.positions; if (!p_tex) return;

    src.setContext(gl);
    gl.useProgram(p.program);

    // view matrix
    gl.uniformMatrix4fv(p.u_matrix, false, matrix);

    // particle position texture
    gl.activeTexture(gl.TEXTURE0 + POS_TEX);
    gl.bindTexture(gl.TEXTURE_2D, p_tex);

    const canvas = this.map?.getCanvas()!;
    const canvasSize = [canvas.width, canvas.height] as const;

    const m2 = mat4.mul(mat4.create(), this.source!.reprojector.texToMerc, matrix);
    const s3 = mat4.getScaling(vec3.create(), m2);
    const o = vec3.divide(vec3.create(), s3, [...canvasSize, 0])

    const size = Math.min(o[0], o[1]) / 2;
    const c = Math.min(1, size);

    gl.uniform1f(p.u_size, size);
    gl.uniform4f(p.u_color, c, c, c, c);

    // particle indexes
    util.bindAttribute(gl, this.particles!.indexes, p.a_index, 1);

    // draw particles
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - src.bounds[2]) / 360);
    const ri = Math.floor((r - src.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.POINTS, 0, this.particles!.numParticles);
    }

  }


  public randomize() {
    this.particles?.randomize();
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
