import { mat4 } from "gl-matrix";
export function logMat4(m: mat4) {
  //console.log(m.map((v, i) => v.toFixed(10) + ((i + 1) % 4 ? ", " : "\n")).join(''));
  console.log([...m].map((v, i) => v.toString().substring(0, 8).padStart(8, " ") + ((i + 1) % 4 ? ", " : "\n")).join(''));
}