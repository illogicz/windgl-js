import { updateHeatmap, UpdateHeatmapProgram } from "../shaders/updateHeatmap.glsl";
import { apply } from "../shaders/applyHeatmapData.glsl";
import * as util from ".";
import { UVTSource } from "../time/UVTSource";
import { mat4, vec3 } from "gl-matrix";
import { DEF_INPUT_TEX_UNIT, Simulation } from "./simulation";


export type HeatmapOptions = {
  turbulance: number,
  dropOff: number,

  readonly numSources: number,
  readonly bounds: [number, number, number, number],
  readonly numDataTypes: number,
  readonly gridResolution: number // = 10, // meters per pixel
  readonly getSourceData: (timestamp: number) => Iterable<{ coordinate: [number, number], data: number[] }>;

  readonly timeStep: number, // = 30,
  readonly maxSteps: number,
}


export class Heatmap extends Simulation<UpdateHeatmapProgram> {

  constructor(
    source: UVTSource,
    gl: WebGLRenderingContext,
    public readonly options: HeatmapOptions,
  ) {
    const { bounds, gridResolution, numSources, numDataTypes, turbulance, timeStep } = options;
    const f_ext = util.getExtension(gl)('OES_texture_float');
    const f_linear_ext = util.getExtension(gl)('OES_texture_float_linear');
    const f_blend = util.getExtension(gl)('EXT_float_blend');

    // Approximate m/p resolution at lat
    const mb = util.boundsToMerator(bounds);
    const midLat = (mb[1] + mb[3]) / 2;
    const resolution = Math.cosh(midLat / util.EPSG3857_R);
    const width = Math.ceil((mb[2] - mb[0]) / (resolution * gridResolution));
    const height = Math.ceil((mb[3] - mb[1]) / (resolution * gridResolution));

    console.log("size = ", width, height);

    super(updateHeatmap(gl), source, gl, [width, height]);

    this.quadBuffer = util.createBuffer(gl)!;
    this.sourcePositions = new Float32Array(numSources * 2);
    this.sourceData = new Float32Array(numSources * numDataTypes);
    this.sourcePositionBuffer = util.createBuffer(gl, this.sourcePositions)!;
    this.sourceDataBuffer = util.createBuffer(gl, this.sourceData)!;

    this.blurKernel = this.createBlurKernel(turbulance, timeStep, gridResolution);
    this.blurSize = Math.round(Math.sqrt(this.blurKernel.length));

    const { mercToTex } = this.source.reprojector;

    const mbn = util.normMerc(mb);
    const m = mat4.create();
    mat4.translate(m, m, [mbn[0], mbn[1], 0]);
    mat4.scale(m, m, [mbn[2] - mbn[0], mbn[3] - mbn[1], 1]);
    this.texToMerc = mat4.clone(m);
    this.mercToTex = mat4.clone(mat4.invert(m, m));
    this.hm_to_uv = mat4.mul(mat4.create(), mercToTex, this.texToMerc)

    const pixel_res = [
      resolution / (util.wmRange * (mbn[2] - mbn[0])),
      resolution / (util.wmRange * (mbn[3] - mbn[1]))
    ];
    console.log(...pixel_res);
    console.log(1 / width, 1 / height);

    gl.uniformMatrix4fv(this.program.u_hm_to_uv, false, this.hm_to_uv);
    gl.uniform2f(this.program.u_resolution_met, pixel_res[0], pixel_res[1]);
    gl.uniform2f(this.program.u_resolution_tex, 1 / width, 1 / height);
    gl.uniform1i(this.program.u_heatmap, DEF_INPUT_TEX_UNIT);
    gl.uniform1fv(gl.getUniformLocation(this.program.program, "u_blur_kernel[0]"), this.blurKernel);


    const p = this.applyProgram = apply(gl);
    gl.useProgram(p.program);
    //gl.uniform1f(p.u_size, 2);
    gl.uniformMatrix4fv(p.u_matrix, false, this.mercToTex);
  }

  public get outputTexture() { return this.stateTextures[0] }
  public get numSources() { return this.options.numSources }
  private get numDataTypes() { return this.options.numDataTypes }

  // Resources
  private quadBuffer: WebGLBuffer;

  public readonly texToMerc: mat4;
  private hm_to_uv: mat4;
  private mercToTex: mat4;
  private applyProgram: GlslProgram;

  private blurSize: number;
  private blurKernel: Float32Array;

  private sourcePositions: Float32Array;
  private sourceData: Float32Array;
  private sourcePositionBuffer: WebGLBuffer;
  private sourceDataBuffer: WebGLBuffer;

  private createBlurKernel(
    speed: number,     // m/s at sigma 1
    timeStep: number,  // s
    resolution: number // m / grid_unit
  ) {
    const s1_dist = speed * timeStep / resolution; // (m/s) * (s) / (m/g) = grid unit
    const rad = MAX_BLUR;
    const len = MAX_BLUR * 2 + 1;
    const kernel = new Array(len ** 2);
    let sum = 0, i = 0;
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const dist = Math.sqrt(x ** 2 + y ** 2);
        sum += kernel[i++] = Math.exp(-((dist / s1_dist) ** 2));
      }
    }
    console.log({ s1_dist, speed, timeStep, resolution })
    const norm = kernel.map(v => v / sum)
    console.log(norm.map((v, i) => v.toFixed(10) + ((i + 1) % len ? ", " : "\n")).join(''));

    return new Float32Array(norm);
  }

  protected override beforeUpdate(): void {

    const p = this.applyProgram, gl = this.gl;
    gl.useProgram(p.program);

    let i = 0;
    for (const { coordinate, data } of this.options.getSourceData(this.source.time * 60 * 60 * 1000)) {
      const coord = util.normMerc(util.toMercator(coordinate));
      this.sourcePositions[i * 2 + 0] = coord[0];
      this.sourcePositions[i * 2 + 1] = coord[1];
      this.sourceData[i * 4 + 0] = data[0];
      this.sourceData[i * 4 + 1] = data[1];
      this.sourceData[i * 4 + 2] = data[2];
      this.sourceData[i * 4 + 3] = data[3];
      i++;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourcePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sourcePositions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(p.a_positions);
    gl.vertexAttribPointer(p.a_positions, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourceDataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sourceData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(p.a_data);
    gl.vertexAttribPointer(p.a_data, this.numDataTypes, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, ...this.size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stateTextures[0], 0);
    //gl.blendFunc(gl.ONE, gl.ONE);

    gl.drawArrays(gl.POINTS, 0, this.numSources);

    gl.disableVertexAttribArray(p.a_positions);
    gl.disableVertexAttribArray(p.a_data);

    //gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  }

  protected prepareUpdate(p: UpdateHeatmapProgram, timeStep: number): void {
    util.bindAttribute(this.gl, this.quadBuffer, p.a_pos, 2);
  }
  protected executeUpdate(p: UpdateHeatmapProgram, timeStep: number): void {
    const gl = this.gl;
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(p.u_drop_off, Math.pow((1.0 - this.options.dropOff), Math.abs(timeStep)));

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  protected override get textureFilter() { return this.gl.LINEAR }
  protected initializeStateTexture() {
    const level = 0, border = 0;
    const format = this.gl.RGBA;
    const type = this.gl.FLOAT;
    const data = null;
    this.gl.texImage2D(this.gl.TEXTURE_2D, level, format,
      this.size[0], this.size[1], border, format, type, data);
  }

  public override dispose() {
    super.dispose();
    this.gl.deleteProgram(this.applyProgram.program);
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteBuffer(this.sourcePositionBuffer);
    this.gl.deleteBuffer(this.sourceDataBuffer);
  }

}

const MAX_BLUR = 3;