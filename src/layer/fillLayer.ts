import { mat4 } from "gl-matrix";
import { LayerOptions, PropertySpecs } from "./baseLayer";
import { fillLayer } from "../shaders/fillLayer.glslx";
import { buildColorRampData, createColorRampTexture } from "../util/colorRamp";
import { UVTSource } from "../data/UVTSource";
import * as util from "../util";
//
import type * as mb from "maplibre-gl";
import { TimeLayer } from "./timeLayer";

export type FillLayerProps = "fill-color" | "color-range";
export type FillLayerOptions = LayerOptions<FillLayerProps>


export class FillLayer extends TimeLayer<FillLayerProps> {

  constructor(options: FillLayerOptions, source?: UVTSource) {
    super(defaultPropertySpec, options, source);
  }

  private quadBuffer?: WebGLBuffer;
  private program?: GlslProgram;
  private colorRampTex?: WebGLTexture;
  private readonly colorRampBuffer = new Uint8Array(256 * 4);


  public set opacity(opacity: number) {
    this._opacity = opacity;
    if (this.initialized) this.triggerRepaint();
  }
  private colorRange: [number, number] = [0, 30];
  private _opacity = 1;
  private renderedTime = -1;

  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;
    this.quadBuffer = util.createBuffer(gl)!;
    const p = this.program = fillLayer(gl);
    gl.useProgram(p.program);
    gl.uniform1i(p.u_tex_0, TEX_UNIT_0);
    gl.uniform1i(p.u_tex_1, TEX_UNIT_1);
    gl.uniform1i(p.u_color_ramp, TEX_UNIT_RAMP);
    return true;
  }

  protected override uninitialize() {
    if (this.program != null) {
      this.gl?.deleteProgram(this.program.program);
      delete this.program;
    }
    if (this.colorRampTex != null) {
      this.gl?.deleteTexture(this.colorRampTex);
      delete this.colorRampTex;
    }
    if (this.quadBuffer != null) {
      this.gl?.deleteBuffer(this.quadBuffer);
      delete this.quadBuffer;
    }
    this.renderedTime = -1;
    super.uninitialize();
  }

  private setFillColor(expr: mb.StylePropertyExpression): void {
    const { gl, map } = this;
    if (!gl || !map) return;
    if (!this.colorRampTex) {
      this.colorRampTex = createColorRampTexture(gl, map, expr, [0, 1], this.colorRampBuffer);
    } else {
      const data = buildColorRampData(map, expr, [0, 1], this.colorRampBuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.colorRampTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    map.triggerRepaint();
  }

  // Trigger repaint if the rendered time does not match current source time
  public override prerender(gl: WebGLRenderingContext, matrix: mat4): void {

  }

  protected onTimeChanged(): void {
    this.triggerRepaint();
  }

  public render(gl: WebGLRenderingContext, matrix: mat4): void {
    const p = this.program; if (!p) return;
    const src = this.source; if (!src) return;
    if (!src.interpolator || !src.reprojector) return;
    src.setContext(gl);

    gl.useProgram(p.program);

    util.bindTexture(gl, this.colorRampTex!, TEX_UNIT_RAMP);

    util.bindAttribute(gl, this.quadBuffer!, p.a_pos, 2);
    gl.uniform1f(p.u_color_range, this.colorRange[1] - this.colorRange[0]);
    gl.uniform1f(p.u_color_min, this.colorRange[0]);
    gl.uniform1f(p.u_opacity, this._opacity);

    gl.uniformMatrix4fv(p.u_offset, false, src.reprojector.texToMerc); // can keep fixed?
    gl.uniformMatrix4fv(p.u_matrix, false, matrix);

    src.interpolator.bindTextures(gl, TEX_UNIT_0, TEX_UNIT_1, p.u_tex_a);

    // wrap x
    // TODO: Would it be better to do this in one call, with extra triangles?
    const [[l], [r]] = this.map!.getBounds().toArray();
    const li = Math.ceil((l - src.bounds[2]) / 360);
    const ri = Math.floor((r - src.bounds[0]) / 360);
    for (let i = li; i <= ri; i++) {
      gl.uniform2f(p.u_wrap, i, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    src.interpolator.releaseTextures();
    this.renderedTime = src.time;

  }
}

const defaultPropertySpec: PropertySpecs<FillLayerProps> = {
  "fill-color": {
    type: "color",
    default: [
      "interpolate",
      ["linear"],
      ["get", "speed"],
      0.0, "#000000",
      1.0, "#FFFFFF"
    ] as any,
    overridable: true,
    transition: true,
    expression: {
      interpolated: true,
      parameters: ["feature"]
    },
    "property-type": "data-driven"
  },
  "color-range": {
    type: "array",
    value: "number",
    transition: true,
    default: ["literal", [0, 40]] as any,
    "property-type": "data-constant",
  }
}

const TEX_UNIT_0 = 0;
const TEX_UNIT_1 = 1;
const TEX_UNIT_RAMP = 2;
