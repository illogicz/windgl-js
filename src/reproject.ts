import { mat4 } from "gl-matrix";
import { reproject } from "./shaders/reproject.glsl";
import { Source } from "./singleSource";
import * as util from "./util";

export class Reprojector {

    constructor(private source: Source) {
        // Calc output size
        const b = this.source.bounds.concat();
        const mb = util.boundsToMerator(b);
        const w = mb[2] - mb[0];
        const h = mb[3] - mb[1];
        const [width] = source.dataSize;
        this.outputSize = [width, Math.round(width * h / w)];

        // Pixel to 0-1 lat/lon
        const m = mat4.create();
        mat4.translate(m, m, [0, 0.5, 0]);
        mat4.scale(m, m, [1 / 360, 1 / 180, 1]);
        mat4.mul(m, m, this.source.transformLatLon);
        mat4.scale(m, m, [...source.dataSize, 1]);

        this.transform = m;
        this.transformInv = mat4.invert(mat4.create(), m);
    }

    public initialize(gl: WebGLRenderingContext) {
        // TODO: move whatever possible here instead of reproject method

        this.gl = gl;
        this.program = reproject(gl);
        // Could use bounds coords in the vertices? and simplify transform
        this.quadBuffer = util.createBuffer(gl, new Float32Array([
            0, 0, 1, 0, 0, 1,
            0, 1, 1, 0, 1, 1
        ]))!;
    }

    public readonly outputSize: [number, number];

    private gl!: WebGLRenderingContext;
    private quadBuffer!: WebGLBuffer;
    private program!: GlslProgram;
    private readonly transform: mat4;
    private readonly transformInv: mat4;

    reproject(image: HTMLImageElement, target: WebGLFramebuffer | null = null, targetTexture: WebGLTexture | null = null) {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, target);

        // TODO: keep a single texture to load data into
        const inputTexture = util.createTexture(gl, gl.NEAREST, image);
        const [w, h] = this.outputSize;

        const program = this.program;
        gl.useProgram(program.program);

        gl.viewport(0, 0, w, h);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);
        util.bindTexture(gl, inputTexture, 0);

        gl.uniform1i(program.u_input, 0);
        gl.uniform2f(program.u_input_size, image.width, image.height);

        gl.uniformMatrix4fv(program.u_transform, false, this.transform);
        gl.uniformMatrix4fv(program.u_transform_inverse, false, this.transformInv);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        //gl.flush();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        //gl.flush();
        // TODO: Use FB to render straight to interpolator texture instead?
        // var data = new Uint8ClampedArray(w * h * 4);
        // gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
        // return data;
    }

}
