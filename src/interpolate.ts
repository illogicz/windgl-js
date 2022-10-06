import { Source } from "./singleSource";
import { interpolate } from "./shaders/interpolate.glsl";
import { mat4 } from "gl-matrix";


export class Interpolator {

    constructor(private source: Source) { };

    initialize(gl: WebGLRenderingContext) {
        this.gl = gl;
        const [w, h] = this.source.textureSize;

        const p = this.program = interpolate(gl);
        gl.useProgram(p.program);

        gl.uniform1i(p.u_tex_0, 0);
        gl.uniform1i(p.u_tex_1, 1);

        this.createTexture(gl, 0);
        this.createTexture(gl, 1);
        this.createTexture(gl, 2);

        // create
        const quads = this.quads = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quads);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
        // bind

        const m = this.matrix = mat4.create();
        mat4.scale(m, m, [w, h, 1]);
        mat4.translate(m, m, [0, 0.5, 0]);
        gl.uniformMatrix4fv(p.u_matrix, false, this.matrix);


    }

    getBuffer(idx: number) {
        return this.buffers[idx];
    }

    setState(t0: number, t1: number, a: number) {
        this.tex_0 = t0;
        this.tex_1 = t1;
        this.tex_a = a;
    }

    render() {
        const p = this.program;
        const gl = this.gl;
        const [w, h] = this.source.textureSize;

        gl.useProgram(p.program);

        gl.enableVertexAttribArray(p.a_pos);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
        gl.vertexAttribPointer(p.a_pos, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0 + 0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_0]!);

        gl.activeTexture(gl.TEXTURE0 + 1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[this.tex_1]!);

        gl.uniform1f(p.u_tex_a, this.tex_a);

        gl.viewport(0, 0, w, h);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

    }


    private tex_0 = 0;
    private tex_1 = 1;
    private tex_a = 0;

    private gl!: WebGLRenderingContext;
    private program!: GlslProgram;
    //private fb!: WebGLFramebuffer;
    private matrix!: mat4;
    private textures: [WebGLTexture, WebGLTexture, WebGLTexture] = [0, 0, 0];
    private buffers: [WebGLFramebuffer, WebGLFramebuffer, WebGLFramebuffer] = [0, 0, 0];

    private quads!: WebGLBuffer;

    private createTexture(gl: WebGLRenderingContext, idx: number) {
        const [width, height] = this.source.textureSize;

        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const level = 0, border = 0;
        const format = gl.RGBA, internalFormat = gl.RGBA;
        const type = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            width, height, border, format, type, null);


        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        this.textures[idx] = texture;
        this.buffers[idx] = fb;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

}