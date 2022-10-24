import { BaseLayer, LayerOptions, PropertySpecs } from "../baseLayer";
import { UVTSource } from "./UVTSource";
//
import type * as mb from "maplibre-gl";

export abstract class TimeLayer<Props extends string> extends BaseLayer<Props> {

  constructor(propertySpec: PropertySpecs<Props>, options: LayerOptions<Props>, source?: UVTSource) {
    super(propertySpec, options);
    this.setSource(source);
    this.onTimeChanged = this.onTimeChanged.bind(this);
  }

  protected source?: UVTSource | undefined;
  protected abstract onTimeChanged(): void;

  public setSource(source?: UVTSource): void {
    if (this.source === source) return;
    this.uninitialize();
    this.source = source;

    if (this.source) this.initialize();
  }

  protected override initialize() {
    if (!this.source) return false;
    if (!super.initialize()) return false;

    this.source.setContext(this.gl);
    this.source.addEventListener("timeChanged", this.onTimeChanged);
    this.triggerRepaint();
    return true;
  }

  protected override uninitialize() {
    this.source?.removeEventListener("timeChanged", this.onTimeChanged);
    super.uninitialize();
  }

  protected onContextLost(evt: mb.MapContextEvent): void {
    //this.source?.setContext(undefined);
    // this.gl.deleteTexture ? can do that is context is lost?
  }
  protected onContextRestored(evt: mb.MapContextEvent): void {
    throw new Error("Method not implemented.");
  }

}

const TEX_UNIT_0 = 0;
const TEX_UNIT_1 = 1;
const TEX_UNIT_RAMP = 2;

