import * as util from "./util";
import { reproject } from "./shaders/reproject.glsl";
import { Source } from "./singleSource";
import { ResultView, Spector } from "spectorjs";
import { mat4, vec3 } from "gl-matrix";

const g = window as any as {
    spector: Spector,
    results?: ResultView
};

if (!g.spector) {
    g.spector = new Spector();
    g.spector.displayUI();
    g.spector.getCaptureUI().hide();
}

export class Reprojector {

    constructor(private source: Source) {
        const [w, h] = this.outputSize = this.calcOutputSize();

        const canvas = this.canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;


        const gl = this.gl = canvas.getContext("webgl", {
            premultipliedAlpha: false,

        })!;
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        //gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

        gl.viewport(0, 0, w, h);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.program = reproject(gl);
        this.quadBuffer = util.createBuffer(gl, new Float32Array([
            0, 0, 1, 0, 0, 1,
            0, 1, 1, 0, 1, 1
        ]))!;
        //this.frameBuffer = gl.createFramebuffer()!;
        //this.outputTexture = util.createTexture(gl, gl.NEAREST, new Uint8Array(w * h * 4), w, h);

        const m = this.transform = mat4.create();
        mat4.translate(m, m, [0, 0.5, 0]);
        mat4.scale(m, m, [1 / 360, 1 / 180, 1]);
        mat4.mul(m, m, this.source.transformLatLon);
        mat4.scale(m, m, [source.width, source.height, 1]);
        this.transformInv = mat4.invert(mat4.create(), m);
    }

    private calcOutputSize() {
        const b = this.source.bounds.concat();
        const mb = util.boundsToMerator(b);
        const w = mb[2] - mb[0];
        const h = mb[3] - mb[1];
        return [
            this.source.width,
            Math.round(this.source.width * h / w)
        ] as [number, number];
    }

    public readonly outputSize: [number, number];
    public readonly canvas: HTMLCanvasElement;
    private readonly transform: mat4;
    private readonly transformInv: mat4;
    private gl: WebGLRenderingContext;
    private quadBuffer: WebGLBuffer;
    private program: GlslProgram;


    reproject(image: HTMLImageElement) {
        const gl = this.gl;

        g.results?.hide();
        g.spector.startCapture(gl, 1000);

        const i_unit = 0;
        const texture = util.createTexture(gl, gl.NEAREST, image);
        const [w, h] = this.outputSize;

        const program = this.program;
        gl.useProgram(program.program);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);


        util.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

        util.bindTexture(gl, texture, i_unit);

        gl.uniform1i(program.u_input, i_unit);
        gl.uniform2f(program.u_input_size, image.width, image.height);


        gl.uniformMatrix4fv(program.u_transform, false, this.transform);
        gl.uniformMatrix4fv(program.u_transform_inverse, false, this.transformInv);

        gl.uniform2f(program.u_wind_max, this.source.uvMax, this.source.uvMax);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.flush();

        const capture = g.spector.stopCapture();

        var data = new Uint8ClampedArray(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);

        console.log("t = ", capture.endTime - capture.startTime);
        g.results = g.spector.getResultUI();

        return data;
    }
}
