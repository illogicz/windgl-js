import { LayerOptions, PropertySpecs } from "./baseLayer";
import { draw } from "../shaders/drawParticles.glslx";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { UVTSource } from "../data/UVTSource";
//
import { mat4, vec3, vec2, vec4 } from "gl-matrix";
import { ParticleOptions, Particles } from "../sim/particles";

export type ParticleLayerProps = "particle-color";
export type ParticleLayerOptions = LayerOptions<ParticleLayerProps> & {
  particleOptions: ParticleOptions
}


export class ParticleLayer extends TimeLayer<ParticleLayerProps> {
  constructor({ particleOptions, ...layerOptions }: ParticleLayerOptions, source?: UVTSource) {
    super(defaultPropertySpec, layerOptions, source);
    this.particleOptions = particleOptions;
  }
  private drawProgram?: GlslProgram;
  private quadBuffer?: WebGLBuffer;

  public simulationMode = false;
  public simulationMaxStepTime = 60;
  public simulationMaxSteps = 100;
  public visualisationTimeStep = 60;

  private _simulationTargetTime = - 1;
  public get simulationTargetTime() {
    return this._simulationTargetTime;
  }
  public set simulationTargetTime(t: number) {
    this._simulationTargetTime = t;
    this.triggerRepaint();
  };


  private renderedTime = -1;
  private particles?: Particles;

  private _particleOptions!: ParticleOptions;
  public get particleOptions() { return this._particleOptions }
  public set particleOptions(options: ParticleOptions) {
    this._particleOptions = options;
    if (options) {
      this.simulationMaxStepTime = options.timeStep;
      this.simulationMaxSteps = options.maxSteps;
      this.initialize();
    } else {
      this.uninitialize();
    }
  }

  protected override initialize() {
    if (!super.initialize()) return false;
    if (!this.gl || !this.source) throw new Error("Cannot initialialize layer without source and gl context");

    this.particles = new Particles(this.source, this.gl, this.particleOptions)
    //this.particles.numParticles = this._numParticles;
    this.quadBuffer = util.createBuffer(this.gl)!;

    const p = this.drawProgram = draw(this.gl);
    this.gl.useProgram(p.program);
    this.gl.uniform1i(p.u_particles, POS_TEX);
    this.gl.uniform1f(p.u_particles_res, this.particles.size[0]);

    return true;
  }

  protected override uninitialize() {
    if (!this.initialized) return;

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
      //console.log({ dt });
      if (dt !== 0) {
        let steps = Math.ceil(Math.abs(dt / this.simulationMaxStepTime));
        let timeStep = this.simulationMaxStepTime * Math.sign(dt);
        if (steps <= this.simulationMaxSteps) {
          timeStep = dt / steps;
        } else {
          steps = this.simulationMaxSteps;
        }
        this.particles.update(timeStep, steps);
      }
    } else if (this.visualisationTimeStep !== 0) {
      const dt = (this.source.time - this.particles.simTime) * 60 * 60;
      this.particles.update(this.visualisationTimeStep, 0);
    }
    this.maybeRepaint();

    this.updating = false;
  }

  private maybeRepaint = () => {
    if (!this.source) return;
    if (!this.simulationMode || this.particles?.simTime !== this.renderedTime) {
      this.triggerRepaint();
    }
  }

  protected onTimeChanged(): void {
  }

  override prerender(gl: WebGLRenderingContext) {
    this.update();
  }

  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    if (!this.initialized) return;
    const p = this.drawProgram; if (!p) return;
    const src = this.source; if (!src) return;
    const p_tex = this.particles?.positions; if (!p_tex) return;
    const p_idx = this.particles?.indexes; if (!p_idx) return;
    //console.log("render");
    src.setContext(gl);
    gl.useProgram(p.program);

    const [lb, rt] = this.map!.getBounds().toArray();
    const lbm = util.toMercator(lb);
    const rtm = util.toMercator(rt);
    const l = lbm[0] / (util.wmRange * 2) + 0.5;
    const r = rtm[0] / (util.wmRange * 2) + 0.5;
    const t = 0.5 - rtm[1] / (util.wmRange * 2);
    const b = 0.5 - lbm[1] / (util.wmRange * 2);
    const scale = [1 / (r - l), 1 / (b - t)] as const;
    const offset = [-l * 0xFFFF, -t * 0xFFFF] as const;

    const offset_i = [
      Math.floor(offset[0]),
      Math.floor(offset[1])
    ] as const;
    const offset_f = [
      (offset[0] - offset_i[0]),
      (offset[1] - offset_i[1])
    ] as const;

    //gl.uniformMatrix4fv(p.u_matrix, false, m);
    gl.uniform2f(p.u_scale, ...scale);
    gl.uniform4f(p.u_offset, ...offset_f, ...offset_i);

    gl.uniform1i(p.u_particles, POS_TEX);
    gl.uniform1f(p.u_particles_res, this.particles!.size[0]);

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
    util.bindAttribute(gl, p_idx, p.a_index, 1);

    //gl.blendFunc(gl.ONE, gl.ONE)

    // draw particles
    //const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((lb[0] - src.bounds[2]) / 360);
    const ri = Math.floor((rt[0] - src.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.POINTS, 0, this.particles!.numParticles);
    }

    //gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    //gl.disableVertexAttribArray(p.a_index);

    this.renderedTime = this.particles!.simTime;
  }

  public randomize() {
    this.particles?.reset();
    this.renderedTime = -1;
  }

}

const defaultPropertySpec: PropertySpecs<ParticleLayerProps> = {
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
