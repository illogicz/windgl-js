import { updateHeatmap, UpdateHeatmapProgram, updateHeatmapVertex, updateHeatmapFragment } from "../shaders/updateHeatmap.glslx";
import { apply } from "../shaders/applyHeatmapData.glsl";
import * as util from "../util";
import { UVTSource } from "../data/UVTSource";
import { mat4, vec3 } from "gl-matrix";
import { DEF_INPUT_TEX_UNIT, Simulation } from "./simulation";


/**
 * Parameters that can be changed without resetting
 */
export type HeatmapSettings = {
  sourceRadius: number;
  sourceFade: number;
  dropOff: number;
  getSourceData: (timestamp: number) => Iterable<{ coordinate: [number, number], data: number[] }>;
}

/**
 * Fixed parameters that cannot de changed without resetting
 */
export type HeatmapConfig = {
  readonly dispersion: number;
  readonly maxSources: number;
  readonly bounds: [number, number, number, number];
  readonly numDataTypes: number;
  readonly gridResolution: number; // meters per grid unit
  readonly timeStep: number; // seconds
}


export class Heatmap extends Simulation<UpdateHeatmapProgram> {

  constructor(
    source: UVTSource,
    gl: WebGLRenderingContext,
    public readonly config: HeatmapConfig,
    public settings: HeatmapSettings,
  ) {
    const { bounds, gridResolution, maxSources, numDataTypes, dispersion, timeStep } = config;
    let f_buffer: WEBGL_color_buffer_float;
    try {
      const f_ext = util.getExtension(gl)('OES_texture_float');
      const f_linear_ext = util.getExtension(gl)('OES_texture_float_linear');
      const f_blend = util.getExtension(gl)('EXT_float_blend');
      f_buffer = util.getExtension(gl)('WEBGL_color_buffer_float')!;
    } catch (e) {

    }
    // Approximate m/p resolution at lat
    const mb = util.boundsToMerator(bounds);
    const midLat = (mb[1] + mb[3]) / 2;
    const resolution = Math.cosh(midLat / util.EPSG3857_R);
    const width = Math.ceil((mb[2] - mb[0]) / (resolution * gridResolution));
    const height = Math.ceil((mb[3] - mb[1]) / (resolution * gridResolution));


    console.log("size = ", width, height);

    const dispersionData = dispersionFunction1d(dispersion, timeStep, gridResolution);
    const vShader = updateHeatmapFragment.replace("void main()", `${dispersionData.code}\nvoid main()`);
    console.log(vShader);
    const program2 = util.createProgram(gl, updateHeatmapVertex, vShader) as UpdateHeatmapProgram;

    super(program2, source, gl, [width, height]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);

    //f_buffer.RGBA32F_EXT

    this.quadBuffer = util.createBuffer(gl)!;
    this.sourcePositions = new Float32Array(maxSources * 2);
    this.sourceData = new Float32Array(maxSources * numDataTypes);
    this.sourcePositionBuffer = util.createBuffer(gl, this.sourcePositions)!;
    this.sourceDataBuffer = util.createBuffer(gl, this.sourceData)!;

    this.blurKernel = dispersionData.kernel; //this.createBlurKernel(dispersion, timeStep, gridResolution);
    //this.blurSize = Math.round(Math.sqrt(this.blurKernel.length));

    const { mercToTex } = this.source.reprojector;

    const mbn = util.normMerc(mb);
    const m = mat4.create();
    mat4.translate(m, m, [mbn[0], mbn[1], 0]);
    mat4.scale(m, m, [mbn[2] - mbn[0], mbn[3] - mbn[1], 1]);
    this.texToMerc = mat4.clone(m);
    this.mercToTex = mat4.invert(mat4.create(), m);
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
  //public get numSources() { return this.options.numSources }
  private get numDataTypes() { return this.config.numDataTypes }

  // Resources
  private quadBuffer: WebGLBuffer;

  public readonly texToMerc: mat4;
  private hm_to_uv: mat4;
  private mercToTex: mat4;
  private applyProgram: GlslProgram;

  //private blurSize: number;
  private blurKernel: Float32Array;

  private sourcePositions: Float32Array;
  private sourceData: Float32Array;
  private sourcePositionBuffer: WebGLBuffer;
  private sourceDataBuffer: WebGLBuffer;

  // private createBlurKernel(
  //   dispersion: number,     // m/s at sigma 1
  //   timeStep: number,  // s
  //   resolution: number // m / grid_unit
  // ) {
  //   const s1_dist = dispersion * timeStep / resolution; // (m/s) * (s) / (m/g) = grid unit
  //   console.log("s1_dist", s1_dist);

  //   const rad = MAX_BLUR;
  //   const len = MAX_BLUR * 2 + 1;
  //   const kernel = new Array(len ** 2);
  //   let sum = 0, i = 0;
  //   for (let y = -rad; y <= rad; y++) {
  //     for (let x = -rad; x <= rad; x++) {
  //       const dist = Math.sqrt(x ** 2 + y ** 2);
  //       sum += kernel[i++] = Math.exp(-((dist / s1_dist) ** 2));
  //     }
  //   }
  //   console.log({ s1_dist, speed: dispersion, timeStep, resolution })
  //   const norm = kernel.map(v => v / sum)
  //   console.log(norm.map((v, i) => v.toFixed(10) + ((i + 1) % len ? ", " : "\n")).join(''));

  //   return new Float32Array(norm);
  // }

  protected override beforeUpdate(): void {
    //this.applySourceData();
  }

  private applySourceData(): void {

    let i = 0;
    for (const { coordinate, data } of this.settings.getSourceData(this.source.time * 60 * 60 * 1000)) {
      const coord = util.normMerc(util.toMercator(coordinate));
      this.sourcePositions[i * 2 + 0] = coord[0];
      this.sourcePositions[i * 2 + 1] = coord[1];
      this.sourceData[i * 4 + 0] = data[0];
      this.sourceData[i * 4 + 1] = data[1];
      this.sourceData[i * 4 + 2] = data[2];
      this.sourceData[i * 4 + 3] = data[3];
      i++;
    }

    if (i === 0) return;

    const p = this.applyProgram, gl = this.gl;
    gl.useProgram(p.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourcePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sourcePositions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(p.a_positions);
    gl.vertexAttribPointer(p.a_positions, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourceDataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sourceData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(p.a_data);
    gl.vertexAttribPointer(p.a_data, this.numDataTypes, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);

    //gl.viewport(0, 0, ...this.size);
    //gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stateTextures[0], 0);
    //gl.blendFunc(gl.ONE, gl.ONE);

    gl.uniform1f(p.u_diameter, this.settings.sourceRadius * 2 / this.config.gridResolution);
    gl.uniform1f(p.u_fade, this.settings.sourceFade);
    gl.uniform1f(p.u_blur_size, 3.0);

    gl.drawArrays(gl.POINTS, 0, i);

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
    gl.uniform1f(p.u_drop_off, Math.pow((1.0 - this.settings.dropOff), Math.abs(timeStep)));
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.applySourceData();
  }

  public override get textureFilter() { return this.gl.LINEAR }
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

/**
 * 1d kernel applied on each axis
 * should be same result as 2 kernel 
 */
function dispersionFunction1d(
  dispersion: number,     // m/s at sigma 1
  timeStep: number,  // s
  resolution: number // m / grid_unit
) {
  const s1_dist = dispersion * timeStep / resolution; // (m/s) * (s) / (m/g) = grid unit
  const rad = Math.ceil(s1_dist * 2);
  const len = rad * 2 + 1;
  const kernel = new Array(len);
  let sum = 0, i = 0;
  for (let x = -rad; x <= rad; x++) {
    sum += kernel[i++] = Math.exp(-((x / s1_dist) ** 2));
  }
  const kernel_norm = kernel.map(v => v / sum);
  console.log(kernel_norm);
  const code = `
const int rad = ${rad};
const int len = rad * 2 + 1;
uniform float u_blur_kernel[len];

vec4 dispersion(vec2 sample_pos, vec2 tex_res) {
   vec4 sum = vec4(0.0);
   for (int x = 0; x < len; x++) {
    for (int y = 0; y < len; y++) {
      vec2 tex_pos = sample_pos + vec2(x - rad, y - rad) * tex_res;
      vec4 tex_val = texture2D(u_heatmap, tex_pos);
      sum += u_blur_kernel[x] * u_blur_kernel[y] * tex_val;
    }
   }
   return sum;
 }`
  return { code, kernel: new Float32Array(kernel_norm) };
}

/**
 * 2d kernel
 * 
function dispersionFunction2d(
  dispersion: number,     // m/s at sigma 1
  timeStep: number,  // s
  resolution: number // m / grid_unit
) {
  const s1_dist = dispersion * timeStep / resolution; // (m/s) * (s) / (m/g) = grid unit
  const rad = Math.ceil(s1_dist * 2 + 1);
  const len = rad * 2 + 1;
  const kernel = new Array(len ** 2);
  let sum = 0, i = 0;
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      const dist = Math.sqrt(x ** 2 + y ** 2);
      sum += kernel[i++] = Math.exp(-((dist / s1_dist) ** 2));
    }
  }
  const kernel_norm = kernel.map(v => v / sum);
  console.log(kernel_norm.map((v, i) => v.toFixed(10) + ((i + 1) % len ? ", " : "\n")).join(''));

  sum = 0;
  i = 0;
  const kernel_1d = new Array(len);
  for (let x = -rad; x <= rad; x++) {
    sum += kernel_1d[i++] = Math.exp(-((x / s1_dist) ** 2));
  }
  kernel_1d.forEach((v, i) => kernel_1d[i] = v / sum);

  const kernel_2d = new Array(len ** 2);
  for (let i = 0; i < len * len; i++) {
    const x = (i % len);
    const y = Math.floor(i / len);
    kernel_2d[i] = kernel_1d[x] * kernel_1d[y];
  }
  //const kernel_norm2 = kernel_2d.map(v => v / sum);
  console.log(kernel_2d.map((v, i) => v.toFixed(10) + ((i + 1) % len ? ", " : "\n")).join(''));


  const code = `
const float radius = ${rad.toFixed(1)};
const float len = radius * 2.0 + 1.0;
const float size = len * len;
uniform float u_blur_kernel[${len ** 2}];

vec4 dispersion(vec2 sample_pos, vec2 tex_res) {
   vec4 sum = vec4(0.0);
   for (float i = 0.0; i < size; i++) {
     float x = mod(i, len) - radius;
     float y = floor(i / len) - radius;
     vec2 tex_pos = sample_pos + vec2(x, y) * tex_res;
     vec4 tex_val = texture2D(u_heatmap, tex_pos);
     float blur = u_blur_kernel[int(i)];
     sum += tex_val * blur;
   }
   return sum;
 }`
  return { code, kernel: new Float32Array(kernel_norm) };
}
 */



const MAX_BLUR = 3;