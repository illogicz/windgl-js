import type * as mb from "maplibre-gl";
import { createTexture } from ".";


export function buildColorRamp(
  map: mb.Map,
  expr: mb.StylePropertyExpression,
  range: number[],
  size = 256
) {
  const colors: mb.Color[] = Array(size);
  const globals = expr.kind === "constant" || expr.kind === "source"
    ? {} as mb.GlobalProperties
    : { zoom: map.getZoom() };

  for (let i = 0; i < size; i++) {
    const color = expr.evaluate(globals, {
      properties: { speed: fromFraction(i / (size - 1), range) }
    } as unknown as mb.Feature);
    colors[i] = color
  }
  return colors;
}


export function buildColorRampData(
  map: mb.Map,
  expr: mb.StylePropertyExpression,
  range: [number, number] = [0, 1],
  sizeOrData: number | Uint8Array = 256,
): Uint8Array {
  const isSize = typeof sizeOrData === "number";
  const size = isSize ? sizeOrData : sizeOrData.length / 4;
  const data = isSize ? new Uint8Array(sizeOrData * 4) : sizeOrData;

  console.log({ sizeOrData, size, data })
  // let _range = [0, 1];
  // if (expr.kind === "source" || expr.kind === "composite") {
  //   _range = range;
  // }
  const colors = buildColorRamp(map, expr, range, size);
  let i = 0;
  for (const color of colors) {
    data[i++] = color.r * 255;
    data[i++] = color.g * 255;
    data[i++] = color.b * 255;
    data[i++] = color.a * 255;
  }
  return data
}

export function createColorRampTexture(
  gl: WebGLRenderingContext,
  map: mb.Map,
  expr: mb.StylePropertyExpression,
  range: [number, number] = [0, 1],
  sizeOrData: number | Uint8Array = 256,
  filter = WebGLRenderingContext.LINEAR
) {
  const data = buildColorRampData(map, expr, range, sizeOrData);
  return createTexture(gl, filter, data, data.length / 4, 1);
}

export function buildColorGrid(
  gl: WebGLRenderingContext,
  map: mb.Map,
  x: mb.StylePropertyExpression,
  y: mb.StylePropertyExpression,
  range: [number, number, number, number] = [-40, -40, 40, 40],
  size = 256,
  filter = WebGLRenderingContext.LINEAR
) {

  const colorData = new Uint8Array(size * size * 4);
  let x_range = [0, 1];
  let y_range = [0, 1];
  if (x.kind === "source" || x.kind === "composite") {
    x_range = [range[0], range[2]];
  }
  if (y.kind === "source" || y.kind === "composite") {
    y_range = [range[1], range[3]];
  }

  const x_colors = buildColorRamp(map, x, x_range, size);
  const y_colors = buildColorRamp(map, y, y_range, size);
  let i = 0;
  for (const x of x_colors) {
    for (const y of y_colors) {
      colorData[i++] = Math.min(255, (x.r + y.r) * 255);
      colorData[i++] = Math.min(255, (x.g + y.g) * 255);
      colorData[i++] = Math.min(255, (x.b + y.b) * 255);
      colorData[i++] = Math.min(255, (x.a + y.a) * 255);
    }
  }
  // TODO: see @buildColorRamp
  return createTexture(
    gl,
    filter,
    colorData,
    size,
    size
  );
}
function fromFraction(fraction: number, interval: number[]) {
  return fraction * (interval[1] - interval[0]) + interval[0];
}
