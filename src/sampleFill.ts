import { WindGlLayer, LayerOptions } from "./layer";
import * as util from "./util";

import type * as mb from "maplibre-gl";
import { sampleFill } from "./shaders/sampleFill.glsl";
import { Tile } from "./tileID";


export type SampleFillProps = "sample-fill-color" | "sample-opacity";
export type SampleFillOptions = LayerOptions<SampleFillProps>

export class SampleFill extends WindGlLayer<SampleFillProps> {
  constructor(options: SampleFillOptions) {
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
          //doc: "The color of each pixel of this layer",
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
        // type: "number",
        // default: 1,
        // //minimum: 0,
        // //maximum: 1,
        // transition: true,
        // expression: {
        //   interpolated: true,
        //   parameters: ["zoom"]
        // },
        // "property-type": "data-constant"
        //}
      },
      options
    );
  }
  pixelToGridRatio = 1;
  backgroundProgram!: any;
  quadBuffer: WebGLBuffer | null = null;
  sampleOpacity!: number;
  framebuffer: WebGLFramebuffer | null = null;

  initialize(map: mb.Map, gl: WebGLRenderingContext) {
    this.backgroundProgram = sampleFill(gl);

    const n = 1;
    this.quadBuffer = util.createBuffer(
      gl,
      new Float32Array([0, 0, n, 0, 0, n, 0, n, n, 0, n, n])
    );
  }

  setSampleFillColor(expr: mb.StylePropertyExpression) {
    this.buildColorRamp(expr, 256);
  }

  // This is a callback from mapbox for rendering into a texture
  // prerender(gl: WebGLRenderingContext, matrix: mat4) {
  //   if (this.windData) {
  //     const tiles = this.computeVisibleTiles(
  //       this.pixelToGridRatio, // cannot find where this is defined
  //       Math.min(this.windData.width, this.windData.height),
  //       this.windData
  //     )
  //     tiles.forEach((tile) => {
  //       const texture = tile.getTexture?.(gl);
  //       if (texture) util.bindFramebuffer(gl, this.framebuffer, texture);
  //     });
  //     this.map!.triggerRepaint();
  //   }
  // }

  draw(gl: WebGLRenderingContext, matrix: Float32Array, tile: Tile, offset: Float32Array) {
    //console.log("draw", { matrix, tile, offset });

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
      util.matrixInverseTyped(offset)
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
