import { mat3, mat4 } from "gl-matrix";
import { MercatorCoordinate } from "maplibre-gl";


function createShader(gl: WebGLRenderingContext, type: number, source: string) {

  const shader = gl.createShader(type);
  if (shader == null) throw new Error("Failed to create shader");

  gl.shaderSource(shader!, source);

  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "");
  }

  return shader;
}

export function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {

  const program = gl.createProgram();

  if (program == null) throw new Error("Failed to create program");

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "");
  }

  const wrapper: Record<string, number | WebGLUniformLocation | null> = { program: program };

  const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < numAttributes; i++) {
    const attribute = gl.getActiveAttrib(program, i)!; //+!
    wrapper[attribute.name] = gl.getAttribLocation(program, attribute.name);
  }
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < numUniforms; i++) {
    const uniform = gl.getActiveUniform(program, i)!; // +!
    wrapper[uniform.name] = gl.getUniformLocation(program, uniform.name);
  }

  return wrapper;
}

export function createTexture(gl: WebGLRenderingContext, filter: number, data: Uint8Array | Uint8ClampedArray, width: number, height: number): WebGLTexture;
export function createTexture(gl: WebGLRenderingContext, filter: number, data: TexImageSource): WebGLTexture;
export function createTexture(gl: WebGLRenderingContext, filter: number, data: Uint8Array | Uint8ClampedArray | TexImageSource, width?: number, height?: number) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width!,
      height!,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function createBuffer(gl: WebGLRenderingContext, data?: BufferSource) {
  // default: 2 triangles 0-1 
  // TODO: can we reuse the entire buffer, per context at least?
  if (!data) data = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

export function bindAttribute(gl: WebGLRenderingContext, buffer: WebGLBuffer, attribute: number, numComponents: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
}

export function bindFramebuffer(gl: WebGLRenderingContext, framebuffer: WebGLFramebuffer | null, texture?: WebGLTexture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  if (texture) {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
  }
}

export const getExtension = (gl: WebGLRenderingContext) => ((extension: string) => {
  const ext = gl.getExtension(extension);
  if (ext) return ext;
  const error = new Error(`${extension} not supported by your browser/hardware\n a requirement for now, apologies.`);
  alert(error.message);
  throw error;
}) as WebGLRenderingContext["getExtension"];


export function matrixInverse(matrix: number[] | Float32Array) {
  return (new window.DOMMatrixReadOnly(Array.from(matrix)).inverse()).toFloat32Array();
}

export function mat3toMat4(m: mat3): mat4 {
  return new DOMMatrixReadOnly([
    m[0], m[3],
    m[1], m[4],
    m[2], m[5]
  ]).toFloat32Array();
}

export function toMercator([lon, lat]: [number, number]): [number, number] {
  return [
    lon * EPSG3857_DEG,
    Math.log(Math.tan(DEGtoTAU * (lat + 90))) * EPSG3857_R
  ] as [number, number];
}

export function boundsToMerator(extent: Bounds): Bounds {
  return [
    extent[0] * EPSG3857_DEG, latToMerc(extent[1]),
    extent[2] * EPSG3857_DEG, latToMerc(extent[3])
  ];
};

export function normMerc(extent: Bounds): Bounds {
  return [
    extent[0] / (wmRange * 2) + 0.5,
    -extent[1] / (wmRange * 2) + 0.5,
    extent[2] / (wmRange * 2) + 0.5,
    -extent[3] / (wmRange * 2) + 0.5,
  ]
  //return extent.map((c, i) => c / (wmRange * 2 * (1 - (i % 2) * 2)) + 0.5);
};


const latToMerc = (lat: number) => Math.log(Math.tan(DEGtoTAU * (lat + 90))) * EPSG3857_R;
export type Bounds = number[]; //[number, number, number, number];
//export type Coordinate = number[]; //[number, number, number, number];

const DEGtoRAD = Math.PI / 180;
const DEGtoTAU = Math.PI / 360;
const RADtoDEG = 180 / Math.PI;
const TAUtoDEG = 360 / Math.PI;

const EPSG3857_R = 6378137;
const EPSG3857_HS = EPSG3857_R * Math.PI;
const EPSG3857_DEG = EPSG3857_HS / 180;
const EPSG3857_DEG_inv = 180 / EPSG3857_HS;
const earthRadius = 6371e3 / 1852;
const wmRange = 20037508.342789244;
const wmExtent = Object.freeze([-wmRange, -wmRange, wmRange, wmRange]);
