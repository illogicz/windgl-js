import { mat4 } from "gl-matrix";
import { LayerOptions } from "../baseLayer";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { arrow, ArrowProgram } from "../shaders/arrow.glsl";
//
import type * as mb from "maplibre-gl";
import { UVTSource } from "./UVTSource";

export type ArrowProps = never;
export type ArrowOptions = LayerOptions<ArrowProps>

export class ArrowLayer extends TimeLayer<ArrowProps> {
  protected onTimeChanged(): void {

  }

  constructor(options: ArrowOptions, source?: UVTSource) {
    super({}, options, source);
  }

  private readonly arrowSize = 50;
  private readonly maxScreenSize = [2560, 1440];
  private readonly maxArrows = (
    Math.ceil(this.maxScreenSize[0] / this.arrowSize) *
    Math.ceil(this.maxScreenSize[1] / this.arrowSize)
  );

  private program?: ArrowProgram;
  private indexBuffer: WebGLBuffer | null = null;
  private cornerBuffer: WebGLBuffer | null = null;

  protected override initialize() {
    if (!super.initialize()) return false;
    this.initializeGrid();
    const gl = this.gl!;
    const p = this.program = arrow(gl);
    gl.useProgram(p.program);
    gl.uniform1i(p.u_tex_0, TEX_UNIT_0);
    gl.uniform1i(p.u_tex_1, TEX_UNIT_1);

    // gl.useProgram(p.program);
    // gl.uniform1i(p.u_tex_0, TEX_UNIT_0);
    // gl.uniform1i(p.u_tex_1, TEX_UNIT_1);
    // gl.uniform1i(p.u_color_ramp, TEX_UNIT_RAMP);
    return true;
  }


  protected override uninitialize() {
    if (this.program != null) {
      this.gl?.deleteProgram(this.program.program);
      delete this.program;
    }
    if (this.indexBuffer != null) {
      this.gl?.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }
    if (this.cornerBuffer != null) {
      this.gl?.deleteBuffer(this.cornerBuffer);
      this.cornerBuffer = null;
    }
    super.uninitialize();
  }

  private initializeGrid() {
    const numTriangles = this.maxArrows * 2;
    const numVertices = numTriangles * 3;
    const indices = new Float32Array(numVertices);
    const corners = new Float32Array(2 * numVertices);
    for (let i = 0; i < this.maxArrows; i++) {
      indices.set([i, i, i, i, i, i], i * 6);
      corners.set([
        -1, 1, 1, 1, 1, -1,
        -1, 1, 1, -1, -1, -1
      ], i * 12);
    }
    this.indexBuffer = util.createBuffer(this.gl!, indices);
    this.cornerBuffer = util.createBuffer(this.gl!, corners);
  }

  private computeDimensions(gl: WebGLRenderingContext, map: mb.Map) {
    const width = Math.min(gl.canvas.width, this.maxScreenSize[0]);
    const height = Math.min(gl.canvas.height, this.maxScreenSize[1]);
    return [
      Math.ceil(width / this.arrowSize),
      Math.ceil(height / this.arrowSize)
    ];
  }

  public render(gl: WebGLRenderingContext, matrix: mat4) {
    const p = this.program; if (!p) return;
    const src = this.source; if (!src) return;

    gl.useProgram(p.program);

    util.bindAttribute(gl, this.indexBuffer!, p.a_index, 1);
    util.bindAttribute(gl, this.cornerBuffer!, p.a_vert, 2);

    //util.bindTexture(gl, tile.getTexture!(gl), 0);
    //util.bindTexture(gl, this.colorRampTexture!, 2);

    //gl.uniform1i(p.u_color_ramp, 2);

    const [cols, rows] = this.computeDimensions(gl, this.map!);

    gl.uniform2f(p.u_dimensions, cols, rows);
    gl.uniform1i(p.u_tex_0, TEX_UNIT_0);
    gl.uniform1i(p.u_tex_1, TEX_UNIT_1);

    gl.uniformMatrix4fv(p.u_coord_to_uv, false, this.source!.reprojector.mercToTex);
    gl.uniformMatrix4fv(p.u_uv_to_coord, false, this.source!.reprojector.texToMerc);
    gl.uniformMatrix4fv(p.u_screen_to_coord, false, mat4.invert(mat4.create(), matrix));

    src.interpolator.bindTextures(gl, TEX_UNIT_0, TEX_UNIT_1, p.u_tex_a);
    gl.drawArrays(gl.TRIANGLES, 0, rows * cols * 6);

    gl.disableVertexAttribArray(p.a_index);
    gl.disableVertexAttribArray(p.a_vert);
  }
}

const TEX_UNIT_0 = 0;
const TEX_UNIT_1 = 1;


// const defaultProperties = {
//   "arrow-min-size": {
//     type: "number",
//     //minimum: 1,
//     transition: true,
//     default: 10,
//     expression: {
//       interpolated: true,
//       parameters: ["zoom"]
//     },
//     "property-type": "data-constant"
//   },
//   "arrow-color": {
//     type: "color",
//     default: "white",
//     transition: true,
//     overridable: true,

//     expression: {
//       interpolated: true,
//       parameters: ["zoom", "feature"]
//     },
//     "property-type": "data-driven"
//   },
//   "arrow-halo-color": {
//     type: "color",
//     default: "rgba(255,255,255,1)",
//     transition: true,
//     overridable: true,
//     expression: {
//       interpolated: true,
//       parameters: ["zoom"]
//     },
//     "property-type": "data-constant"
//   }
// }