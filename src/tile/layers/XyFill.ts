import { TileLayer } from "../tileLayer";
import * as util from "../../util";
import { xyFill } from "../../shaders/tile/xyFill.glsl";
import { Tile } from "../tileID";
import { WindSource } from "../tileSource";
import { LayerOptions } from "../../baseLayer";
//
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";

export type XYFillProps = "sample-opacity" | "x-fill-color" | "y-fill-color"
export type XYFillOptions = LayerOptions<XYFillProps>


export class XyFill extends TileLayer<XYFillProps> {
  public onContextLost(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }
  public onContextRestored(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }
  constructor(options: XYFillOptions, source: WindSource) {
    super(
      {
        "x-fill-color": {
          type: "color",
          default: [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            -40.0,
            "#FF0000",
            0,
            "#880000",
            40,
            "#000000",
          ] as any,
          overridable: true,
          transition: true,
          expression: {
            interpolated: true,
            parameters: ["zoom", "feature"]
          },
          "property-type": "data-driven"
        },
        "y-fill-color": {
          type: "color",
          default: [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            -40.0,
            "#00FF00",
            0,
            "#008800",
            40,
            "#000000",
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
  private colorGridTexture?: WebGLTexture;
  private xExpr?: mb.StylePropertyExpression;
  private yExpr?: mb.StylePropertyExpression;

  protected override initialize() {
    if (!super.initialize()) return false;
    const gl = this.gl!;
    this.backgroundProgram = xyFill(gl);
    this.quadBuffer = util.createBuffer(gl);
    return true;
  }

  private setXFillColor(expr: mb.StylePropertyExpression) {
    this.xExpr = expr;
    if (this.yExpr) this.makeColorGrid();
  }
  private setYFillColor(expr: mb.StylePropertyExpression) {
    this.yExpr = expr;
    if (this.xExpr) this.makeColorGrid();
  }
  private makeColorGrid() {
    const { uMin, vMin, uMax, vMax } = this.windData;
    this.colorGridTexture = this.buildColorGrid(this.xExpr!, this.yExpr!, [uMin, vMin, uMax, vMax]);
  }
  // This is a callback from mapbox for rendering into a texture
  // prerender(gl: WebGLRenderingContext, matrix: mat4) {
  //   if (this.windData) {
  //   const tiles = this.computeVisibleTiles(
  //   this.pixelToGridRatio, // cannot find where this is defined
  //   Math.min(this.windData.width, this.windData.height),
  //   this.windData
  //   )
  //   tiles.forEach((tile) => {
  //   const texture = tile.getTexture?.(gl);
  //   if (texture) util.bindFramebuffer(gl, this.framebuffer, texture);
  //   });
  //   this.map!.triggerRepaint();
  //   }
  // }

  draw(gl: WebGLRenderingContext, matrix: mat4, tile: Tile, offset: Float32Array) {
    //console.log("draw", { matrix, tile, offset });

    const opacity = this.sampleOpacity
    const program = this.backgroundProgram;
    gl.useProgram(program.program);

    util.bindAttribute(gl, this.quadBuffer!, program.a_pos, 2);

    util.bindTexture(gl, tile.getTexture!(gl), 0);
    util.bindTexture(gl, this.colorGridTexture!, 2);

    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_color_grid, 2);

    gl.uniform1f(program.u_opacity, opacity);
    gl.uniformMatrix4fv(program.u_offset, false, offset);
    gl.uniformMatrix4fv(program.u_offset_inverse, false, util.matrixInverse(offset))

    const { uMin, vMin, uMax, vMax, width, height } = this.windData;

    gl.uniform2f(program.u_wind_res, width, height);
    gl.uniform2f(program.u_wind_min, uMin, vMin);
    gl.uniform2f(program.u_wind_max, uMax, vMax);
    gl.uniform1i(program.u_bli_enabled, +this.source.bliEnabled);

    gl.uniformMatrix4fv(program.u_matrix, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}