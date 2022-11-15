import { LayerOptions } from "./baseLayer";
import { draw, DrawProgram } from "../shaders/drawHeatmap.glslx";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { UVTSource } from "../data/UVTSource";
//
import { mat4, vec3 } from "gl-matrix";
import { Heatmap, HeatmapConfig, HeatmapSettings } from "../sim/heatmap";


export type HeatmapLayerProps = never;
export type HeatmapLayerOptions = LayerOptions<HeatmapLayerProps> & {
  heatmap?: Partial<HeatmapOptions>;
}

export type HeatmapOptions = {
  config?: HeatmapConfig | null;
  settings?: HeatmapSettings;
  display: HeatmapDisplay;
}

export type HeatmapDisplay = {
  maxStepsPerFrame: number;
  outputMultiplier: number;
  outputFilter: boolean;
  outputAlphaMode: number;
}

export class HeatmapLayer extends TimeLayer<HeatmapLayerProps> {
  constructor({ heatmap, ...layerOptions }: HeatmapLayerOptions, source?: UVTSource) {
    super({}, layerOptions, source);
    if (heatmap) this.updateHeatmapOptions(heatmap);
  }
  private drawProgram?: DrawProgram;
  private quadBuffer?: WebGLBuffer;

  private renderedTime = -1;

  private _simulationTargetTime = - 1;
  public get simulationTargetTime() {
    return this._simulationTargetTime;
  };
  public set simulationTargetTime(t: number) {
    this._simulationTargetTime = t;
    this.triggerRepaint();
  };

  private _hm: HeatmapOptions = {
    display: {
      maxStepsPerFrame: 100,
      outputFilter: true,
      outputMultiplier: 1.0,
      outputAlphaMode: 0.0
    }
  };

  public get heatmapOptions() { return this._hm }
  public updateHeatmapOptions(options: Partial<HeatmapOptions>) {
    this._hm = { ...this._hm, ...options };
    if (options.config || !this._hm.config || !this._hm.settings) {
      this.uninitialize();
    }
    this.initialize();
    if (this.heatmap && this._hm.settings) {
      this.heatmap.settings = this._hm.settings;
    }
    if (options.display) {
      this.triggerRepaint();
    }
  }

  public heatmap?: Heatmap;

  public clear() {
    this.heatmap?.reset();
    this.triggerRepaint();
  }

  protected override initialize() {
    if (!this._hm.config || !this._hm.settings) return false;
    if (!super.initialize()) return false;
    if (!this.gl || !this.source) throw new Error("Cannot initialialize layer without source and gl context");

    this.heatmap = new Heatmap(this.source, this.gl, this._hm.config, this._hm.settings)
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
    if (!this.heatmap != null) {
      this.heatmap?.dispose();
      delete this.heatmap;
    }
    super.uninitialize();
  }

  private updating = false;
  private update() {
    if (!this.source || !this.heatmap || this.updating) return;
    this.updating = true;
    const dt = (this.simulationTargetTime - this.source.time) * 60 * 60;
    if (dt !== 0) {
      const step = this.heatmap.config.timeStep * Math.sign(dt);
      const steps = Math.min(
        Math.floor(Math.abs(dt / this.heatmap.config.timeStep)),
        this._hm.display.maxStepsPerFrame
      );
      if (steps > 0) {
        this.heatmap.update(step, steps);
      }
    }
    this.maybeRepaint();
    this.updating = false;
  }

  private maybeRepaint = () => {
    if (!this.source) return;
    if (this.heatmap?.simTime !== this.renderedTime) {
      this.triggerRepaint();
    }
  }

  protected onTimeChanged(): void {
    //this.triggerRepaint();
  }

  override prerender(gl: WebGLRenderingContext) {
    this.update();
  }

  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    const p = this.drawProgram; if (!p) return;
    const src = this.source; if (!src) return;
    const hm = this.heatmap; if (!hm) return;

    src.setContext(gl);
    gl.useProgram(p.program);

    util.bindAttribute(gl, this.quadBuffer!, p.a_pos, 2);

    gl.uniform1f(p.u_output_mult, this._hm.display.outputMultiplier);
    gl.uniform1f(p.u_output_alpha, this._hm.display.outputAlphaMode);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hm.outputTexture);
    gl.uniform1i(p.u_tex, 0);

    const filter = this._hm.display.outputFilter ? gl.LINEAR : gl.NEAREST;
    if (filter !== hm.textureFilter) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }

    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - hm.config.bounds[2]) / 360);
    const ri = Math.floor((r - hm.config.bounds[0]) / 360);

    for (let i = li; i <= ri; i++) {
      m_wrap[12] = i;
      mat4.mul(m_xform, m_wrap, hm.texToMerc);
      mat4.mul(m_xform, matrix, m_xform);
      gl.uniformMatrix4fv(p.u_transform, false, m_xform);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    if (filter !== hm.textureFilter) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, hm.textureFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, hm.textureFilter);
    }
    this.renderedTime = hm.simTime;

  }

}

const m_xform = mat4.create();
const m_wrap = mat4.create();
