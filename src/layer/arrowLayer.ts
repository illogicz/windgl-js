import { mat4 } from "gl-matrix";
import { LayerOptions, PropertySpecs } from "./baseLayer";
import * as util from "../util";
import { TimeLayer } from "./timeLayer";
import { arrow, ArrowProgram } from "../shaders/arrowLayer.glslx";
// 
import type * as mb from "maplibre-gl";
import { UVTSource } from "../data/UVTSource";
import { buildColorRampData, createColorRampTexture } from "../util/colorRamp";

export type ArrowProps = "fill-color" | "color-range";
export type ArrowOptions = LayerOptions<ArrowProps>

export class ArrowLayer extends TimeLayer<ArrowProps> {

  constructor(options: ArrowOptions, source?: UVTSource) {
    super(defaultPropertySpec, options, source);
  }

  private readonly arrowSize = 50;
  private readonly maxScreenSize = [2560, 1440];
  private readonly maxArrows = (
    Math.ceil(this.maxScreenSize[0] / this.arrowSize) *
    Math.ceil(this.maxScreenSize[1] / this.arrowSize)
  );

  private colorRange: [number, number] = [0, 30];
  private program?: ArrowProgram;
  private indexBuffer: WebGLBuffer | null = null;
  private cornerBuffer: WebGLBuffer | null = null;
  private colorRampTex?: WebGLTexture;

  private readonly colorRampBuffer = new Uint8Array(256 * 4);

  protected override initialize() {
    if (!super.initialize()) return false;
    this.initializeGrid();
    const gl = this.gl!;
    const p = this.program = arrow(gl);
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

  protected onTimeChanged(): void {
    this.triggerRepaint();
  }

  public render(gl: WebGLRenderingContext, matrix: mat4) {
    const p = this.program; if (!p) return;
    const src = this.source; if (!src) return;
    src.setContext(gl);

    gl.useProgram(p.program);

    util.bindAttribute(gl, this.indexBuffer!, p.a_index, 1);
    util.bindAttribute(gl, this.cornerBuffer!, p.a_vert, 2);
    util.bindTexture(gl, this.colorRampTex!, TEX_UNIT_RAMP);

    gl.uniform1f(p.u_color_range, this.colorRange[1] - this.colorRange[0]);
    gl.uniform1f(p.u_color_min, this.colorRange[0]);

    const [cols, rows] = this.computeDimensions(gl, this.map!);

    gl.uniform2f(p.u_dimensions, cols, rows);

    gl.uniformMatrix4fv(p.u_coord_to_uv, false, this.source!.reprojector.mercToTex);
    gl.uniformMatrix4fv(p.u_uv_to_coord, false, this.source!.reprojector.texToMerc);
    gl.uniformMatrix4fv(p.u_screen_to_coord, false, mat4.invert(mat4.create(), matrix));

    src.interpolator.bindTextures(gl, TEX_UNIT_0, TEX_UNIT_1, p.u_tex_a);
    gl.drawArrays(gl.TRIANGLES, 0, rows * cols * 6);

    gl.disableVertexAttribArray(p.a_index);
    gl.disableVertexAttribArray(p.a_vert);
    src.interpolator.releaseTextures();
  }
}

const TEX_UNIT_0 = 0;
const TEX_UNIT_1 = 1;
const TEX_UNIT_RAMP = 2;


const defaultPropertySpec: PropertySpecs<ArrowProps> = {
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
