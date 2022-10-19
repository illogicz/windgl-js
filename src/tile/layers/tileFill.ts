import { TileLayer } from "../tileLayer";
import * as util from "../../util";
import { sampleFill } from "../../shaders/tile/sampleFill.glsl";
import { Tile } from "../tileID";
import { LayerOptions } from "../../baseLayer";
//
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";
import { WindSource } from "../tileSource";

export type SampleFillProps = "sample-opacity" | "sample-fill-color";
export type SampleFillOptions = LayerOptions<SampleFillProps>

export class SampleFill extends TileLayer<SampleFillProps> {
  constructor(options: SampleFillOptions, source: WindSource) {
    super(
      {
        "sample-fill-color": {
          type: "color",
          default: [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            0.0,
            "#3288bd",
            10,
            "#66c2a5",
            20,
            "#abdda4",
            30,
            "#e6f598",
            40,
            "#fee08b",
            50,
            "#fdae61",
            60,
            "#f46d43",
            100.0,
            "#d53e4f"
          ] as any,
          overridable: true,
          transition: true,
          expression: {
            interpolated: true,
            parameters: ["zoom", "feature"]
          },
          "property-type": "data-driven"
        },
        "sample-opacity": {
          type: "number",
          default: 1,
          minimum: 0,
          maximum: 1,
          transition: true,
          expression: {
            interpolated: true,
            parameters: ["zoom"]
          },
          "property-type": "data-constant"
        } as any
      },
      options,
      source
    );
  }
  private backgroundProgram!: any;
  private quadBuffer: WebGLBuffer | null = null;
  private sampleOpacity!: number;
  private framebuffer: WebGLFramebuffer | null = null;

  public onContextLost(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }
  public onContextRestored(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }

  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;
    this.backgroundProgram = sampleFill(gl);
    this.quadBuffer = util.createBuffer(gl);
    return true;
  }

  private setSampleFillColor(expr: mb.StylePropertyExpression) {
    this.buildColorRamp(expr);
  }

  protected draw(gl: WebGLRenderingContext, matrix: mat4, tile: Tile, offset: Float32Array) {

    const opacity = this.sampleOpacity
    const program = this.backgroundProgram;
    gl.useProgram(program.program);

    util.bindAttribute(gl, this.quadBuffer!, program.a_pos, 2);

    util.bindTexture(gl, tile.getTexture!(gl), 0);
    util.bindTexture(gl, this.colorRampTexture!, 2);

    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_color_ramp, 2);

    gl.uniform1f(program.u_opacity, opacity);
    gl.uniformMatrix4fv(program.u_offset, false, offset);
    gl.uniformMatrix4fv(
      program.u_offset_inverse,
      false,
      util.matrixInverse(offset)
    )

    const { uMin, vMin, uMax, vMax, width, height, speedMax } = this.windData;

    gl.uniform2f(program.u_wind_res, width, height);
    gl.uniform2f(program.u_wind_min, uMin, vMin);
    gl.uniform2f(program.u_wind_max, uMax, vMax);
    gl.uniform1f(program.u_speed_max, speedMax); //
    gl.uniform1i(program.u_bli_enabled, +this.source.bliEnabled);

    gl.uniformMatrix4fv(program.u_matrix, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
