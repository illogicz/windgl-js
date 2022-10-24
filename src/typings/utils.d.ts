declare interface ObjectConstructor {
  keys<T>(o: T): T extends object ? (keyof T)[] : never;
  entries<T>(o: T): T extends object ? Entry<T>[] : never;
}

type Entry<T> = [P, NonNullable<T[P]>];

declare module "*/data/interpolate.glsl" {
  type Props = "a_pos" | "u_tex_0" | "u_tex_1" | "u_tex_a";
  export type InterpolateProgram = GlslProgram<Props>;
  export const interpolate: (gl: WebGLRenderingContext) => InterpolateProgram;
}
