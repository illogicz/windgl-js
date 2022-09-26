import * as util from "./util";
import Layer, { LayerConfig, LayerOptions } from "./layer";
import type * as mb from "maplibre-gl";
import type { mat4 } from "gl-matrix";

import {
  particleUpdate,
  particleDraw,
  screenDraw
} from "./shaders/particles.glsl";
import { Tile } from "./tileID";



type ParticleTile = {
  particleStateTexture0: WebGLTexture,
  particleStateTexture1: WebGLTexture,
  updated: boolean
}

type DataTile = {
  matrix: Float32Array;
  tileTopLeft: Tile;
  tileTopCenter: Tile;
  tileTopRight: Tile;
  tileMiddleLeft: Tile;
  tileMiddleCenter: Tile;
  tileMiddleRight: Tile;
  tileBottomLeft: Tile;
  tileBottomCenter: Tile;
  tileBottomRight: Tile;
}

/**
 * This layer simulates a particles system where the particles move according
 * to the forces of the wind. This is achieved in a two step rendering process:
 *
 * 1. First the particle positions are updated. These are stored in a texure
 *    where the BR channels encode x and AG encode the y position. The `update`
 *    function invokes a shader that updates the positions and renders them back
 *    into a texure. This whole simulation happens in global WSG84 coordinates.
 *
 * 2. In the `draw` phase, actual points are drawn on screen. Their positions
 *    are read from the texture and are projected into pseudo-mercator coordinates
 *    and their final position is computed based on the map viewport.
 */
class Particles extends Layer {
  constructor(options: LayerOptions) {
    super(
      {
        "particle-color": {
          type: "color",
          default: "white",
          expression: {
            interpolated: true,
            parameters: ["zoom", "feature"],
          },
          "property-type": "data-driven",
        },
        "particle-speed": {
          type: "number",
          minimum: 0,
          default: 0.75,
          transition: true,
          expression: {
            interpolated: true,
            parameters: ["zoom"],
          },
          "property-type": "data-constant",
        },
      } as any,
      options
    );
  }

  updateProgram!: GlslProgram;
  drawProgram!: GlslProgram;
  screenProgram!: GlslProgram;

  framebuffer: WebGLFramebuffer | null = null;
  quadBuffer: WebGLBuffer | null = null;
  nullTexture!: WebGLTexture;
  nullTile?: { getTexture(): WebGLTexture };

  private _randomParticleState!: Uint8Array;
  particleIndexBuffer: WebGLBuffer | null = null;
  backgroundTexture?: WebGLTexture;
  screenTexture?: WebGLTexture;
  particleStateResolution!: number;

  particleSpeed!: number;

  pixelToGridRatio = 2; // not sure how to interpret this [possibly the ratio of canvas height (pixels) to tile height (grid)]
  tileSize = 512; // this seems to scale the zoom levels at which tiles get rendered -- may be useful

  dropRate = 0.003; // how often the particles move to a random place
  dropRateBump = 0.01; // drop rate increase relative to individual particle speed
  private _numParticles = 128 * 128//65536;
  fadeOpacity = 0.97; // how fast the particle trails fade on each frame
  // This layer manages 2 kinds of tiles: data tiles (the same as other layers) and particle state tiles
  private _particleTiles: Record<string, ParticleTile> = {};

  initializeScreenTextures() {
    // textures to hold the screen state for the current and the last frame
    const emptyPixels = new Uint8Array(
      this.gl.canvas.width * this.gl.canvas.height * 4
    );
    this.backgroundTexture = util.createTexture(
      this.gl,
      this.gl.NEAREST,
      emptyPixels,
      this.gl.canvas.width,
      this.gl.canvas.height
    );
    this.screenTexture = util.createTexture(
      this.gl,
      this.gl.NEAREST,
      emptyPixels,
      this.gl.canvas.width,
      this.gl.canvas.height
    );
    // return { backgroundTexture, screenTexture };
  }

  visibleParticleTiles() {
    return this.computeVisibleTiles(2, this.tileSize, {
      minzoom: 2, // TODO: changed from 0 for testing
      maxzoom: this.windData.maxzoom + 5 // (3) how much overzoom to allow?
    });
  }

  setParticleColor(expr: mb.StylePropertyExpression) {
    this.buildColorRamp(expr);
  }

  initializeParticleTile() {
    // textures to hold the particle state for the current and the next frame
    const particleStateTexture0 = util.createTexture(
      this.gl,
      this.gl.NEAREST,
      this._randomParticleState,
      this.particleStateResolution,
      this.particleStateResolution
    );
    const particleStateTexture1 = util.createTexture(
      this.gl,
      this.gl.NEAREST,
      this._randomParticleState,
      this.particleStateResolution,
      this.particleStateResolution
    );
    return { particleStateTexture0, particleStateTexture1, updated: false };
  }

  move() {
    super.move();
    this.initializeScreenTextures(); // try scoping only to canvas rather than all loaded tiles. Maybe need cleanup like for particle state below?
    const tiles = this.visibleParticleTiles();
    // RC: //possibly looking at x's offset by -1
    // let tx = []
    // let ty = []
    // let tz = []
    // tiles.forEach(tile => {
    //   // tx.push(tile.x)
    //   // ty.push(tile.y)
    //   // tz.push(tile.z)
    //   tx.push(tile.z.toFixed(0) + tile.x.toFixed(0) + tile.y.toFixed(0))
    //   //tile.x = tile.x + 1
    // })
    // console.log('z x y', tx)
    // console.log(tiles.length)
    Object.entries(this._particleTiles).forEach(([key, tile]) => {
      if (tiles.filter(t => t.toString() === key).length === 0) {
        // cleanup
        this.gl.deleteTexture(tile.particleStateTexture0);  // EDIT ????
        this.gl.deleteTexture(tile.particleStateTexture1);
        delete this._particleTiles[key];
      }
    });
    tiles.forEach((tile) => {
      if (!this._particleTiles[tile.toString()]) {
        this._particleTiles[tile.toString()] = this.initializeParticleTile();
      }
    });
  }

  initializeParticles(gl: WebGLRenderingContext, count: number) {
    const particleRes = (this.particleStateResolution = Math.ceil(
      Math.sqrt(count)
    ));
    this._numParticles = particleRes * particleRes;

    this._randomParticleState = new Uint8Array(this._numParticles * 4);
    for (let i = 0; i < this._randomParticleState.length; i++) {
      this._randomParticleState[i] = Math.floor(Math.random() * 256); // randomize the initial particle positions
    }

    const particleIndices = new Float32Array(this._numParticles);
    for (let i = 0; i < this._numParticles; i++) particleIndices[i] = i;
    this.particleIndexBuffer = util.createBuffer(gl, particleIndices);
  }

  initialize(map: mb.Map, gl: WebGLRenderingContext) {
    this.updateProgram = particleUpdate(gl);
    this.drawProgram = particleDraw(gl);
    // NEW
    this.screenProgram = screenDraw(gl);

    this.framebuffer = gl.createFramebuffer();

    // quad, as in quadrilateral? I.e. drawing "points" via drawing 2 triangles (6 coordinate pairs)?
    this.quadBuffer = util.createBuffer(
      gl,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
    );

    this.initializeParticles(gl, this._numParticles);

    this.nullTexture = util.createTexture(
      gl,
      gl.NEAREST,
      new Uint8Array([0, 0, 0, 0]),
      1,
      1
    );

    this.nullTile = {
      getTexture: () => this.nullTexture,
    };
  }

  // This is a callback from mapbox for rendering into a texture
  prerender(gl: WebGLRenderingContext) {
    if (this.windData) {
      const blendingEnabled = gl.isEnabled(gl.BLEND);
      gl.disable(gl.BLEND);
      const tiles = this.visibleParticleTiles();
      tiles.forEach((tile) => {
        const found = this.findAssociatedDataTiles(tile);
        if (found) {
          this.update(gl, this._particleTiles[tile.toString()], found);
          this._particleTiles[tile.toString()].updated = true;
        }
      });
      if (blendingEnabled) gl.enable(gl.BLEND);
      this.map!.triggerRepaint();
    }
  }

  /**
   * This method computes the ideal data tiles to support our particle tiles
   */
  computeLoadableTiles() {
    const result: Record<string, Tile> = {};
    const add = (tile: Tile) => (result[tile.toString()] = tile);
    this.visibleParticleTiles().forEach((tileID) => {
      let t = tileID;
      let matrix = new window.DOMMatrix();
      while (!t.isRoot()) {
        if (t.z <= this.windData.maxzoom) break;
        const [x, y] = t.quadrant();
        matrix.translateSelf(0.5 * x, 0.5 * y);
        matrix.scaleSelf(0.5);
        t = t.parent();
      }

      matrix.translateSelf(-0.5, -0.5);
      matrix.scaleSelf(2, 2);

      const tl = matrix.transformPoint(new window.DOMPoint(0, 0));
      const br = matrix.transformPoint(new window.DOMPoint(1, 1));

      add(t);

      if (tl.x < 0 && tl.y < 0) add(t.neighbor(-1, -1));
      if (tl.x < 0) add(t.neighbor(-1, 0));
      if (tl.x < 0 && br.y > 1) add(t.neighbor(-1, 1));

      if (br.x > 1 && tl.y < 0) add(t.neighbor(1, -1));
      if (br.x > 1) add(t.neighbor(1, 0));
      if (br.x > 1 && br.y > 1) add(t.neighbor(1, 1));

      if (tl.y < 0) add(t.neighbor(0, -1));
      if (br.y > 1) add(t.neighbor(0, 1));
    });
    return Object.values(result);
  }

  findAssociatedDataTiles(tileID: Tile): DataTile | undefined {
    let t = tileID;
    let found;
    let matrix = new window.DOMMatrix();
    while (!t.isRoot()) {
      if ((found = this._tiles[t.toString()])) break;
      const [x, y] = t.quadrant();
      matrix.translateSelf(0.5 * x, 0.5 * y);
      matrix.scaleSelf(0.5);
      t = t.parent();
    }
    if (!found) return;
    const tileTopLeft = this._tiles[found.neighbor(-1, -1).toString()];
    const tileTopCenter = this._tiles[found.neighbor(0, -1).toString()];
    const tileTopRight = this._tiles[found.neighbor(1, -1).toString()];
    const tileMiddleLeft = this._tiles[found.neighbor(-1, 0).toString()];
    const tileMiddleCenter = found;
    const tileMiddleRight = this._tiles[found.neighbor(1, 0).toString()];
    const tileBottomLeft = this._tiles[found.neighbor(-1, 1).toString()];
    const tileBottomCenter = this._tiles[found.neighbor(0, 1).toString()];
    const tileBottomRight = this._tiles[found.neighbor(1, 1).toString()];
    matrix.translateSelf(-0.5, -0.5);
    matrix.scaleSelf(2, 2);

    const tl = matrix.transformPoint(new window.DOMPoint(0, 0));
    const br = matrix.transformPoint(new window.DOMPoint(1, 1));

    if (!tileMiddleCenter) return;

    if (tl.x < 0 && tl.y < 0 && !tileTopLeft) return;
    if (tl.x < 0 && !tileMiddleLeft) return;
    if (tl.x < 0 && br.y > 1 && !tileBottomLeft) return;

    if (br.x > 1 && tl.y < 0 && !tileTopRight) return;
    if (br.x > 1 && !tileMiddleRight) return;
    if (br.x > 1 && br.y > 1 && !tileBottomRight) return;

    if (tl.y < 0 && !tileTopCenter) return;
    if (br.y > 1 && !tileBottomCenter) return;

    return {
      matrix: matrix.toFloat32Array(),
      tileTopLeft: tileTopLeft || this.nullTile,
      tileTopCenter: tileTopCenter || this.nullTile,
      tileTopRight: tileTopRight || this.nullTile,
      tileMiddleLeft: tileMiddleLeft || this.nullTile,
      tileMiddleCenter: tileMiddleCenter,
      tileMiddleRight: tileMiddleRight || this.nullTile,
      tileBottomLeft: tileBottomLeft || this.nullTile,
      tileBottomCenter: tileBottomCenter || this.nullTile,
      tileBottomRight: tileBottomRight || this.nullTile,
    };
  }

  update(gl: WebGLRenderingContext, tile: ParticleTile, data: DataTile) {
    util.bindFramebuffer(gl, this.framebuffer, tile.particleStateTexture1);
    gl.viewport(
      0,
      0,
      this.particleStateResolution,
      this.particleStateResolution
    );

    const program = this.updateProgram;
    gl.useProgram(program.program);

    util.bindTexture(gl, tile.particleStateTexture0, 0);

    util.bindTexture(gl, data.tileTopLeft.getTexture!(gl), 1);
    util.bindTexture(gl, data.tileTopCenter.getTexture!(gl), 2);
    util.bindTexture(gl, data.tileTopRight.getTexture!(gl), 3);
    util.bindTexture(gl, data.tileMiddleLeft.getTexture!(gl), 4);
    util.bindTexture(gl, data.tileMiddleCenter.getTexture!(gl), 5);
    util.bindTexture(gl, data.tileMiddleRight.getTexture!(gl), 6);
    util.bindTexture(gl, data.tileBottomLeft.getTexture!(gl), 7);
    util.bindTexture(gl, data.tileBottomCenter.getTexture!(gl), 8);
    util.bindTexture(gl, data.tileBottomRight.getTexture!(gl), 9);

    // positions
    gl.uniform1i(program.u_particles, 0);

    // speeds
    gl.uniform1i(program.u_wind_top_left, 1);
    gl.uniform1i(program.u_wind_top_center, 2);
    gl.uniform1i(program.u_wind_top_right, 3);
    gl.uniform1i(program.u_wind_middle_left, 4);
    gl.uniform1i(program.u_wind_middle_center, 5);
    gl.uniform1i(program.u_wind_middle_right, 6);
    gl.uniform1i(program.u_wind_bottom_left, 7);
    gl.uniform1i(program.u_wind_bottom_center, 8);
    gl.uniform1i(program.u_wind_bottom_right, 9);

    util.bindAttribute(gl, this.quadBuffer!, program.a_pos, 2);

    gl.uniform1f(program.u_rand_seed, Math.random());
    gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);
    gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
    gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);
    gl.uniform1f(program.u_speed_factor, this.particleSpeed);
    gl.uniform1f(program.u_drop_rate, this.dropRate);
    gl.uniform1f(program.u_drop_rate_bump, this.dropRateBump);
    gl.uniform1i(program.u_initialize, +!tile.updated);
    gl.uniformMatrix4fv(program.u_data_matrix, false, data.matrix);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();

    // swap the particle state textures so the new one becomes the current one
    const temp = tile.particleStateTexture0;
    tile.particleStateTexture0 = tile.particleStateTexture1;
    tile.particleStateTexture1 = temp;
  }

  render(gl: WebGLRenderingContext, matrix: mat4) {
    if (this.windData) {
      this.visibleParticleTiles().forEach((tile) => {
        const found = this.findAssociatedDataTiles(tile);
        if (!found) return;

        // this.draw(
        //   gl,
        //   matrix,
        //   this._particleTiles[tile],
        //   tile.viewMatrix(2),
        //   found
        // );

        // draw() is now embedded in drawScreen()
        this.drawScreen(
          gl,
          matrix,
          this._particleTiles[tile.toString()],
          tile.viewMatrix(2),
          found
        );
      });
    }
  }

  // NEW: attempt to overlay past screen state (particle tails)
  drawScreen(gl: WebGLRenderingContext, matrix: Float32List, tile: ParticleTile, offset: Float32List, data: DataTile) {
    // const gl = this.gl;

    // enable blending to support drawing on top of an existing background (e.g. a map)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    //Remember that if the canvas and the texture are different sizes you'll need to call gl.viewport to render correctly
    this.drawTexture(this.screenTexture!, 1.0);
    gl.disable(gl.BLEND);

    // draw the screen into a temporary framebuffer to retain it as the background on the next frame
    // what happens to screenTexture here? I don't see that it actually gets drawn to the frameBuffer 
    util.bindFramebuffer(gl, this.framebuffer, this.screenTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    this.drawTexture(this.backgroundTexture!, this.fadeOpacity);
    this.draw(gl, matrix, tile, offset, data);

    util.bindFramebuffer(gl, null); // this clears the frameBuffer so that we can draw to the canvas instead  

    // save the current screen as the background for the next frame
    const temp = this.backgroundTexture;
    this.backgroundTexture = this.screenTexture;
    this.screenTexture = temp;
  }

  // NEW: attempt to overlay past screen state (particle tails)
  drawTexture(texture: WebGLTexture, opacity: number) {
    const gl = this.gl;
    const program = this.screenProgram;
    gl.useProgram(program.program);

    util.bindAttribute(gl, this.quadBuffer!, program.a_pos, 2);
    util.bindTexture(gl, texture, 2);
    gl.uniform1i(program.u_screen, 2);
    gl.uniform1f(program.u_opacity, opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  //draw(gl, matrix, tile, offset, data) {
  protected draw(gl: WebGLRenderingContext, matrix: Float32List, tile: ParticleTile, offset: Float32List, data: DataTile) {
    const program = this.drawProgram;
    gl.useProgram(program.program);

    util.bindTexture(gl, tile.particleStateTexture0, 0);
    util.bindTexture(gl, data.tileTopLeft.getTexture!(gl), 1);
    util.bindTexture(gl, data.tileTopCenter.getTexture!(gl), 2);
    util.bindTexture(gl, data.tileTopRight.getTexture!(gl), 3);
    util.bindTexture(gl, data.tileMiddleLeft.getTexture!(gl), 4);
    util.bindTexture(gl, data.tileMiddleCenter.getTexture!(gl), 5);
    util.bindTexture(gl, data.tileMiddleRight.getTexture!(gl), 6);
    util.bindTexture(gl, data.tileBottomLeft.getTexture!(gl), 7);
    util.bindTexture(gl, data.tileBottomCenter.getTexture!(gl), 8);
    util.bindTexture(gl, data.tileBottomRight.getTexture!(gl), 9);
    util.bindTexture(gl, this.colorRampTexture!, 10);

    util.bindAttribute(gl, this.particleIndexBuffer!, program.a_index, 1);

    gl.uniform1i(program.u_particles, 0);
    gl.uniform1i(program.u_wind_top_left, 1);
    gl.uniform1i(program.u_wind_top_center, 2);
    gl.uniform1i(program.u_wind_top_right, 3);
    gl.uniform1i(program.u_wind_middle_left, 4);
    gl.uniform1i(program.u_wind_middle_center, 5);
    gl.uniform1i(program.u_wind_middle_right, 6);
    gl.uniform1i(program.u_wind_bottom_left, 7);
    gl.uniform1i(program.u_wind_bottom_center, 8);
    gl.uniform1i(program.u_wind_bottom_right, 9);
    gl.uniform1i(program.u_color_ramp, 10);

    gl.uniform1f(program.u_particles_res, this.particleStateResolution);

    gl.uniformMatrix4fv(program.u_offset, false, offset);
    gl.uniformMatrix4fv(
      program.u_offset_inverse,
      false,
      util.matrixInverse(Array.from(offset))
    );

    gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
    gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);

    gl.uniformMatrix4fv(program.u_matrix, false, matrix);
    gl.uniformMatrix4fv(program.u_data_matrix, false, data.matrix);

    gl.drawArrays(gl.POINTS, 0, this._numParticles);
    gl.flush();
  }
}

export default (options: LayerOptions) => new Particles(options);
