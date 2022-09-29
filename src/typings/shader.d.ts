
declare type GlslProgram = { program: WebGLProgram } & Record<string, any>
type MakeGlslProgram = (gl: WebGLRenderingContext) => GlslProgram;

declare module "*/particles.glsl" {
    export const particleUpdate: MakeGlslProgram;
    export const particleDraw: MakeGlslProgram;
    export const screenDraw: MakeGlslProgram;
}

declare module "*/arrow.glsl" {
    export const arrow: MakeGlslProgram;
}

declare module "*/sampleFill.glsl" {
    export const sampleFill: MakeGlslProgram;
}

