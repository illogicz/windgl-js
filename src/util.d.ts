export declare function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): Record<string, any>;
export declare function createTexture(gl: WebGLRenderingContext, filter: number, data: Uint8Array, width: number, height: number): WebGLTexture;
export declare function createTexture(gl: WebGLRenderingContext, filter: number, data: TexImageSource): WebGLTexture;
export declare function bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture, unit: number): void;
export declare function createBuffer(gl: WebGLRenderingContext, data: BufferSource): WebGLBuffer | null;
export declare function bindAttribute(gl: WebGLRenderingContext, buffer: WebGLBuffer, attribute: number, numComponents: number): void;
export declare function bindFramebuffer(gl: WebGLRenderingContext, framebuffer: WebGLFramebuffer | null, texture?: WebGLTexture): void;
export declare function matrixInverse(matrix: string | number[]): Float32Array;
