import * as util from "./util";

import { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";
import { BaseLayer, LayerOptions } from "./baseLayer";
import { fillLayer } from "./shaders/fillLayer.glsl";
import { buildColorRamp } from "./util/colorRamp";
import { TimeSource } from "./timeSource";


export type FillLayerProps = "fill-color";
export type FillLayerOptions = LayerOptions<FillLayerProps>

export class FillLayer extends BaseLayer<FillLayerProps> {

  constructor(options: FillLayerOptions, source?: TimeSource) {
    super(
      {
        "fill-color": {
          type: "color",
          default: [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            0.0, "#000000",
            40.0, "#FFFFFF"
          ] as any,
          overridable: true,
          transition: true,
          expression: {
            interpolated: true,
            parameters: ["zoom", "feature"]
          },
          "property-type": "data-driven"
        }
      },
      options
    );
    this.setSource(source);
  }

  private source?: TimeSource | undefined;
  private quadBuffer: WebGLBuffer | null = null;
  private program?: GlslProgram;
  private colorRamp?: WebGLTexture;

  public onContextLost(evt: mb.MapContextEvent): void {
    throw this.source?.setContext(undefined);
  }
  public onContextRestored(evt: mb.MapContextEvent): void {
    //throw new Error("Method not implemented.");
  }

  public setSource(source?: TimeSource) {
    if (this.source === source) return;
    if (!source) this.source?.setContext(undefined);
    this.source = source;
    if (this.map && this.gl && this.source) {
      this.initialize(this.map, this.gl);
    }
  }

  public override onAdd(map: mb.Map, gl: WebGLRenderingContext): void {
    super.onAdd(map, gl);
    this.initialize(map, gl);
  }
  public override onRemove(map: mb.Map) {
    this.setSource(undefined);
    super.onRemove(map);
  }

  protected override initialize(map: mb.Map, gl: WebGLRenderingContext) {
    if (!this.source) return;
    super.initialize(map, gl);

    const p = this.program = fillLayer(gl);
    this.quadBuffer = util.createBuffer(gl, new Float32Array(
      [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]
    ));

    gl.useProgram(p.program);
    gl.uniform1i(p.u_tex_0, 0);
    gl.uniform1i(p.u_tex_1, 1);
    gl.uniform1i(p.u_color_ramp, 2);
    gl.uniform1f(p.u_max_value, this.source.speedMax);
  }

  private setFillColor(expr: mb.StylePropertyExpression) {
    if (!this.gl || !this.map || !this.source) {
      this._propsOnInit["fill-color"] = expr;
      return;
    }
    this.colorRamp = buildColorRamp(this.gl, this.map, expr, [0, this.source.speedMax], 256);
  }

  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    const p = this.program; if (!p) return;
    const src = this.source; if (!src) return;
    if (!src.interpolator || !src.reprojector) return;

    src.setContext(gl);

    gl.useProgram(p.program);

    src.interpolator.bind(p, gl);

    util.bindAttribute(gl, this.quadBuffer!, p.a_pos, 2);
    util.bindTexture(gl, this.colorRamp!, 2);

    gl.uniform1i(p.u_color_ramp, 2);

    gl.uniformMatrix4fv(p.u_offset, false, src.reprojector.texToMerc);
    gl.uniformMatrix4fv(p.u_matrix, false, matrix);

    // wrap x
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - src.bounds[2]) / 360);
    const ri = Math.floor((r - src.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }



}
