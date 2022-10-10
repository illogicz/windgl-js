precision highp float;
const float PI = 3.141592653589;
const float e = 2.718;
const float wmRange = 20037508.0;

#pragma glslify: transform = require(./utils/transform)

float cosh(float area) {
    return 0.5 * (pow(e, area) + pow(e, -area));    
}


uniform sampler2D u_particles;
uniform sampler2D u_tex_0;
uniform sampler2D u_tex_1;

// interpolation params
uniform float u_tex_a;

// tex to merc
// uniform mat4 u_offset; // useful for coloring particles at some point
// merc to tex, for looking up data
uniform mat4 u_offset_inverse;
uniform float u_speed_factor;


// ------------------------------------------------------------------------------------
// particle drop and randomisation

// droprate for vis
uniform float u_rand_seed;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;

// // pseudo-random generator
const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}

// ------------------------------------------------------------------------------------
// Vertex

// verts or quad spanning particle position data texture
attribute vec2 a_particles;

// Individual particle positions
varying vec2 v_tex_pos;

// Mep tex to other buffer tex
export void updateVertex() {
  v_tex_pos = a_particles;
  gl_Position = vec4(1.0 - 2.0 * a_particles, 0, 1);
}


// ------------------------------------------------------------------------------------
// Fragment, Update particle positions

export void updateFragment() {

  // Read particles positions from data texture
  vec2 pos = texture2D(u_particles, v_tex_pos).xy;

  // go from particle mercator to wind data texture coord,
  vec2 uv_tex_pos = fract(transform(pos, u_offset_inverse));

  // get uv x/y/t interpolated wind speed for its position
  vec4 c1 = texture2D(u_tex_0, uv_tex_pos);
  vec4 c2 = texture2D(u_tex_1, uv_tex_pos);
  vec2 uv = mix(c1.xy, c2.xy, u_tex_a); 

  // Correction for resolution at this lat 
  // Oh dear, we could already encode this correction during reprojection
  //          which means no need to do it per fragment/particle??
  // TODO, must be missing a PI somewhere?
  //float res = cosh(pos.y * 2.0 - 1.0);
  vec2 speed = vec2(uv.x , -uv.y);
  float res = cosh((pos.y * 2.0 - 1.0) * PI);
  pos = pos + speed * u_speed_factor / wmRange * res;
  pos.x = fract(pos.x);

  // TODO, 
  // - detect OOB, wrap earth, destoy, relocate, whatever
  // - any other interactions with environment (meta data, pressure, speed, 3rd dim, etc etc)
  // - Add random drops if used for visualisation, reimpelent original behaviour
  // - draw as lines somehow if possible, we have the data from prev frame


  // randomisation ------------------------------------------------------------------
  vec2 seed = (pos + v_tex_pos) * u_rand_seed;
  float speed_t = length(speed) / 56.0;
  vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1));
  float offlat = step(1.0, pos.y) + (1.0 - step(0.0, pos.y));
  float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump + offlat;
  float drop = step(1.0 - drop_rate, rand(seed));
  // ---------------------------------------------------------------------------------

  pos = mix(pos, random_pos, drop);

  // update particle position
  gl_FragColor = vec4(pos, 0.0, 1.0);
}
