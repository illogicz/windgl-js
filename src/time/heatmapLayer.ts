import { LayerOptions, PropertySpecs } from "../baseLayer";
import { draw } from "../shaders/drawHeatmap.glsl";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { UVTSource } from "./UVTSource";
//
import { mat4, vec3 } from "gl-matrix";
import { Heatmap, HeatmapOptions } from "../util/heatmap";
export { HeatmapOptions } from "../util/heatmap";

export type HeatmapLayerProps = never;
export type HeatmapLayerOptions = LayerOptions<HeatmapLayerProps> & {
  heatmapOptions?: HeatmapOptions
}


export class HeatmapLayer extends TimeLayer<HeatmapLayerProps> {
  constructor({ heatmapOptions, ...layerOptions }: HeatmapLayerOptions, source?: UVTSource) {
    super({}, layerOptions, source);
    if (heatmapOptions) this.heatmapOptions = heatmapOptions;
  }
  private drawProgram?: GlslProgram;
  private quadBuffer?: WebGLBuffer;

  public simulationMaxStepTime = 10;
  public simulationMaxSteps = 1;
  private renderedTime = -1;

  private _simulationTargetTime = - 1;
  public get simulationTargetTime() {
    return this._simulationTargetTime;
  };
  public set simulationTargetTime(t: number) {
    this._simulationTargetTime = t;
    this.triggerRepaint();
  };


  private _heatmapOptions: HeatmapOptions | null = null;
  public get heatmapOptions() { return this._heatmapOptions }
  public set heatmapOptions(options: HeatmapOptions | null) {
    this._heatmapOptions = options;
    if (options) {
      this.simulationMaxStepTime = options.timeStep;
      this.simulationMaxSteps = options.maxSteps;
      this.initialize();
    } else {
      this.uninitialize();
    }
  }

  public outputMultiplier = 0.01;
  public heatmap?: Heatmap;

  public clear() {
    this.heatmap?.reset();
    this.triggerRepaint();
  }

  protected override initialize() {
    if (!this._heatmapOptions) return false;
    if (!super.initialize()) return false;
    if (!this.gl || !this.source) throw new Error("Cannot initialialize layer without source and gl context");

    this.heatmap = new Heatmap(this.source, this.gl, this._heatmapOptions)
    this.quadBuffer = util.createBuffer(this.gl)!;
    const p = this.drawProgram = draw(this.gl);
    this.gl.useProgram(p.program);

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
    this.heatmap?.dispose();
    super.uninitialize();
  }

  private updating = false;
  private update() {
    if (!this.source || !this.heatmap || this.updating) return;
    this.updating = true;

    const dt = (this.simulationTargetTime - this.source.time) * 60 * 60;
    if (dt !== 0) {
      let steps = Math.floor(Math.abs(dt / this.simulationMaxStepTime));
      let timeStep = this.simulationMaxStepTime * Math.sign(dt);
      if (steps > this.simulationMaxSteps) {
        steps = this.simulationMaxSteps;
      }
      if (steps > 0) {
        this.heatmap.update(timeStep, steps).then(this.maybeRepaint);
      }
    }

    this.updating = false;
  }

  private maybeRepaint = () => {
    if (!this.source) return;
    if (this.source?.time !== this.renderedTime) {
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
    const hm = this.heatmap; if (!hm) return;

    src.setContext(gl);
    gl.useProgram(p.program);

    // view matrix
    gl.uniformMatrix4fv(p.u_matrix, false, matrix);
    gl.uniformMatrix4fv(p.u_offset, false, hm.texToMerc);

    util.bindAttribute(gl, this.quadBuffer!, p.a_pos, 2);

    gl.uniform1f(p.u_output_mult, this.outputMultiplier)

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hm.outputTexture);
    gl.uniform1i(p.u_tex, 0);


    // draw particles
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - hm.options.bounds[2]) / 360);
    const ri = Math.floor((r - hm.options.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    this.renderedTime = src.time;
  }

}
