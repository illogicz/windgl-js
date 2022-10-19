import { LayerOptions, PropertySpecs } from "../baseLayer";
import { draw } from "../shaders/drawParticles.glsl";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { TimeSource } from "./timeSource";
//
import { mat4, vec3 } from "gl-matrix";
import { Particles } from "../util/particles";

export type ParticleProps = "particle-color";
export type ParticleOptions = LayerOptions<ParticleProps>


export class ParticleLayer extends TimeLayer<ParticleProps> {
  constructor(options: ParticleOptions, source?: TimeSource) {
    super(defaultPropertySpec, options, source);
  }
  private drawProgram?: GlslProgram;
  private quadBuffer?: WebGLBuffer;

  public simulationMode = false;
  public simulationMaxStepTime = 60;
  public simulationMaxSteps = 100;

  private _simulationTargetTime = - 1;
  public get simulationTargetTime() {
    return this._simulationTargetTime;
  };
  public set simulationTargetTime(t: number) {
    this._simulationTargetTime = t;
    this.triggerRepaint();
  };

  public visualisationTimeStep = 60;

  private renderedTime = -1;
  private particles?: Particles;
  private _numParticles = 2 ** 20;
  public set numParticles(num: number) {
    this._numParticles = num;
    if (this.particles) {
      this.particles.numParticles = num;
      this.triggerRepaint();
    }
  }
  public get numParticles() {
    return this._numParticles;
  }

  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;

    util.getExtension(gl)('OES_texture_float');

    this.particles = new Particles(this.source!, gl)
    this.particles.numParticles = this._numParticles;

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

    this.renderedTime = -1;
    super.uninitialize();
  }

  private updating = false;
  private update() {
    if (!this.source || !this.particles || this.updating) return;
    this.updating = true;

    if (this.simulationMode) {
      const dt = (this.simulationTargetTime - this.source.time) * 60 * 60;
      if (dt !== 0) {
        let steps = Math.ceil(Math.abs(dt / this.simulationMaxStepTime));
        let timeStep = this.simulationMaxStepTime * Math.sign(dt);
        if (steps <= this.simulationMaxSteps) {
          timeStep = dt / steps;
        } else {
          steps = this.simulationMaxSteps;
        }
        //console.log({ dt, timeStep, steps });
        this.particles.update(timeStep, steps).then(this.maybeRepaint);
      }
    } else if (this.visualisationTimeStep !== 0) {
      this.particles.update(this.visualisationTimeStep, 0).then(this.maybeRepaint);
    }

    this.updating = false;
  }

  private maybeRepaint = () => {
    if (!this.source) return;
    if (!this.simulationMode || this.source?.time !== this.renderedTime) {
      this.triggerRepaint();
    }
  }

  protected onTimeChanged(): void {
    this.triggerRepaint();
  }

  override prerender(gl: WebGLRenderingContext) {
    this.update();
    this.maybeRepaint();
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


    // Ugh, this can be much simpler
    // and only done when zooming
    const canvas = this.map?.getCanvas()!;
    const canvasSize = [canvas.width, canvas.height] as const;
    const m2 = mat4.mul(mat4.create(), this.source!.reprojector.texToMerc, matrix);
    const s3 = mat4.getScaling(vec3.create(), m2);
    const o = vec3.divide(vec3.create(), s3, [...canvasSize, 0])
    const size = Math.min(8, o[0], o[1]) / 2;
    const c = Math.min(180 / 255, Math.max(1 / 256, Math.min(1, size) ** 2));
    gl.uniform1f(p.u_size, Math.max(1, size));
    gl.uniform4f(p.u_color, c, c, c, c);


    // particle indexes
    util.bindAttribute(gl, this.particles!.indexes, p.a_index, 1);

    //gl.blendFunc(gl.ONE, gl.ONE)

    // draw particles
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - src.bounds[2]) / 360);
    const ri = Math.floor((r - src.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.POINTS, 0, this.particles!.numParticles);
    }

    //gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.renderedTime = src.time;
  }


  public randomize() {
    this.particles?.randomize();
    this.renderedTime = -1;
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
