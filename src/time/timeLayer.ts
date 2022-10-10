import { BaseLayer, LayerOptions, PropertySpecs } from "../baseLayer";
import { TimeSource } from "./timeSource";
//
import type * as mb from "maplibre-gl";

export abstract class TimeLayer<Props extends string> extends BaseLayer<Props> {

  constructor(propertySpec: PropertySpecs<Props>, options: LayerOptions<Props>, source?: TimeSource) {
    super(propertySpec, options);
    this.setSource(source);
  }

  protected source?: TimeSource | undefined;
  //private quadBuffer: WebGLBuffer | null = null;
  //private program?: GlslProgram;

  // public async setTime(time: number): Promise<void> {
  //   if (await this.source?.setTime(time)) {
  //     this.triggerRepaint();
  //   }
  // }

  // public getTime(): number {
  //   return this.source?.getTime() ?? -1;
  // }

  public setSource(source?: TimeSource): void {
    if (this.source === source) return;
    this.source = source;
    if (this.source) {
      this.initialize();
    } else {
      this.uninitialize();
    }
  }

  protected override initialize() {
    if (!this.source) return false;
    if (!super.initialize()) return false;
    this.source.setContext(this.gl);
    this.source.addEventListener("ready", this.triggerRepaint);
    this.triggerRepaint();
    return true;
  }

  protected override uninitialize() {
    this.source?.removeEventListener("ready", this.triggerRepaint);
    super.uninitialize();
  }



  protected onContextLost(evt: mb.MapContextEvent): void {
    //this.source?.setContext(undefined);
    // this.gl.deleteTexture ? can do that is context is lost?
  }
  protected onContextRestored(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }

  // protected override initialize(map: mb.Map, gl: WebGLRenderingContext): void {
  //if (!this.source) return;
  //super.initialize(map, gl);
  //const p = this.program;

  //this.quadBuffer = util.createBuffer(gl);
  //gl.useProgram(p.program);
  //gl.uniform1i(p.u_tex_0, TEX_UNIT_0);
  //gl.uniform1i(p.u_tex_1, TEX_UNIT_1);
  //}

}

const TEX_UNIT_0 = 0;
const TEX_UNIT_1 = 1;
const TEX_UNIT_RAMP = 2;

