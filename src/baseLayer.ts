import * as styleSpec from "@maplibre/maplibre-gl-style-spec";
import type { mat4 } from "gl-matrix";
import type * as mb from "maplibre-gl";

/**q
 * This is an abstract base class that handles most of the mapbox specific
 * stuff as well as a lot of the bookkeeping.
 */
export abstract class BaseLayer<Props extends string> implements mb.CustomLayerInterface {

  constructor(propertySpec: PropertySpecs<Props>, options: LayerOptions<Props>) {
    this.id = options.id;
    this.propertySpec = propertySpec;
    this.options = options;

    this.onZoom = this.onZoom.bind(this);
    this.onMove = this.onMove.bind(this);

    // This will initialize the default values

  }

  protected gl?: WebGLRenderingContext | undefined;
  protected map?: mb.Map;
  protected propertySpec: PropertySpecs<Props>;
  protected _propsOnInit: Partial<Record<Props, mb.StylePropertyExpression>> = {};
  protected initialized = false;
  private options: LayerOptions<Props>;
  private _zoomUpdatable: Partial<Record<Props, mb.CameraExpression | mb.CompositeExpression>> = {};

  // ------------------------------------------------------------------------------------------
  // CustomLayerInterface impl

  public readonly id: string;
  public readonly type: "custom" = "custom";
  public readonly renderingMode: "2d" | "3d" = "2d";

  public abstract render(gl: WebGLRenderingContext, matrix: mat4): void;
  protected abstract onContextLost(evt: mb.MapContextEvent): void;
  protected abstract onContextRestored(evt: mb.MapContextEvent): void;

  public prerender(gl: WebGLRenderingContext, matrix: mat4): void { };

  public onAdd(map: mb.Map, gl: WebGLRenderingContext) {
    this.gl = gl;
    this.map = map;
    this.initialize();
  }

  public onRemove(map: mb.Map) {
    this.uninitialize();
  }

  // ------------------------------------------------------------------------------------------
  readonly triggerRepaint = () => this.map?.triggerRepaint();


  protected onMove(e?: MbEvent) { }
  protected onZoom(e?: MbEvent) {
    Object.entries(this._zoomUpdatable).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });
  }

  private _contextLost = (evt: mb.MapContextEvent) => {
    this.onContextLost(evt);
    this.uninitialize();
    delete this.gl;
  }

  private _contextRestored = (evt: mb.MapContextEvent) => {
    // not sure we should get from here, wait until a render call, I guess?
    // Would have expected the event to provide the context..
    this.gl = this.map?.painter.context.gl;
    this.onContextRestored(evt);
  }

  // responsibility of the implementer to call when ready
  protected initialize() {
    if (this.initialized) return false;
    if (!this.map || !this.gl) return false;

    Object.keys(this.propertySpec).forEach(spec => {
      this.setProperty(spec, this.options[spec] || this.propertySpec[spec].default);
    });

    Object.entries(this._propsOnInit).forEach(([k, v]) => {
      this._setPropertyValue(k, v);
    });

    this._propsOnInit = {};
    this.map.on("zoom", this.onZoom);
    this.map.on("move", this.onMove);
    this.map.on("webglcontextlost", this._contextLost);
    this.map.on("webglcontextrestored", this._contextRestored);
    this.onZoom();
    this.onMove();

    return this.initialized = true;
  }

  protected uninitialize() {
    this.map?.off("zoom", this.onZoom);
    this.map?.off("move", this.onMove);
    this.map?.on("webglcontextlost", this._contextLost);
    this.map?.on("webglcontextrestored", this._contextRestored);
    delete this.gl;
    delete this.map;
    this.initialized = false;
  }


  /**
   * Update a property using a mapbox style epxression.
   */
  setProperty(prop: Props, expression: unknown) {
    const spec = this.propertySpec[prop];
    if (!spec) return;
    const expr = styleSpec.expression.createPropertyExpression(expression, spec);
    //console.log(prop, expr)
    if (expr.result === "success") {
      //@ts-ignore
      this.options[prop] = expression as any;
      let value = undefined;
      switch (expr.value.kind) {
        case "camera":
        case "composite":
          value = (this._zoomUpdatable[prop] = expr.value);
        default:
          if (this.map) {
            value = this._setPropertyValue(prop, expr.value);
          } else {
            return (this._propsOnInit[prop] = expr.value);
          }
      }
      this.map?.triggerRepaint();
      return value;
    } else {
      throw new Error(expr.value.join(","));
    }
  }

  // Child classes can interact with style properties in 2 ways:
  // Either as a camelCased instance variable or by declaring a
  // a setter function which will recieve the *expression* and
  // it is their responsibility to evaluate it.
  private _setPropertyValue(prop: Props, value: mb.ConstantExpression | mb.SourceExpression | mb.CameraExpression | mb.CompositeExpression) {
    const name = prop
      .split("-")
      .map(a => a[0].toUpperCase() + a.slice(1))
      .join("");
    const setterName = "set" + name;
    //@ts-ignore
    if (this[setterName]) {
      //@ts-ignore
      this[setterName](value);
    } else {
      const setterName = name[0].toLowerCase() + name.slice(1);
      const zoom = (this.map && this.map.getZoom());
      //@ts-ignore
      this[setterName] = value.evaluate({
        zoom: zoom ?? 1 // EDIT "?? 1"
      });
    }
  }

}


type MbEvent = mb.MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
export type PropertySpecs<Props extends string> = {
  [P in Props]: mb.StylePropertySpecification;
};
export type LayerOptions<Props extends string> = mb.LayerSpecification & {
  [K in Props]: mb.StylePropertySpecification;
}
