precision highp float;
const float PI = 3.141592653589;
const float e = 2.7182818284590;
const float wmRange = 20037508.0;

#pragma glslify: transform = require(./utils/transform)


uniform sampler2D u_particles;
uniform sampler2D u_tex_0;
uniform sampler2D u_tex_1;

uniform float u_render_perc;

// interpolation params
uniform float u_tex_a;

// tex to merc
uniform mat4 u_offset;
// merc to tex, for looking up data
uniform mat4 u_offset_inverse;
uniform float u_time_step;
uniform float u_span_globe;
uniform vec2 u_padding;

// ------------------------------------------------------------------------------------
// particle drop and randomization

// droprate for vis
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
uniform float u_rand_seed;

// // pseudo-random generator
const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}


float cosh(float area) {
    return 0.5 * (pow(e, area) + pow(e, -area));    
}

// ------------------------------------------------------------------------------------
// Vertex

// verts or quad spanning particle position data texture
attribute vec2 a_particles;

// Individual particle positions
varying vec2 v_tex_pos;

// Mep tex to other buffer tex
export void updateVertex() {
  v_tex_pos = a_particles * vec2(1.0, u_render_perc);
  gl_Position = vec4(2.0 * v_tex_pos - 1.0, 0, 1);
}


// ------------------------------------------------------------------------------------
// Fragment, Update particle positions

export void updateFragment() {

  // Read particles positions from data texture
  vec2 pos = texture2D(u_particles, v_tex_pos).xy;

  // go from particle mercator to wind data texture coord,
  vec2 tex_pos = transform(pos, u_offset_inverse);

  // get uv x/y/t interpolated wind speed for its position
  vec4 c1 = texture2D(u_tex_0, tex_pos);
  vec4 c2 = texture2D(u_tex_1, tex_pos);
  vec2 uv = mix(c1.xy, c2.xy, u_tex_a); 

  // Correction for resolution at this lat 
  // We could in theory already encode this correction during reprojection
  // But that complicates things for shaders that do need to true value
  vec2 speed = vec2(uv.x , -uv.y);
  float res = cosh((pos.y * 2.0 - 1.0) * PI);
  pos = pos + speed * u_time_step / wmRange * res;

  // back to text coord
  tex_pos = transform(pos, u_offset_inverse);
  // use step function to check if particle went oob
  vec2 oob_xy = step(1. + u_padding, tex_pos) + (1.0 - step(-u_padding, tex_pos));
  // ignore x if spanning globe
  float oob = oob_xy.x * (1.0 - u_span_globe) + oob_xy.y;

  // randomisation ------------------------------------------------------------------
  vec2 seed = (pos + v_tex_pos) * u_rand_seed;
  vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1)) * (1.0 + u_padding * 2.0) - u_padding;
  float speed_t = (speed.x + speed.y) / 70.0;
  float drop_rate = (u_drop_rate + speed_t * u_drop_rate_bump) * abs(u_time_step) + oob;
  float drop = step(1.0 - drop_rate, rand(seed));
  // ---------------------------------------------------------------------------------

  tex_pos = mix(tex_pos, random_pos, drop);
  tex_pos = mix(tex_pos, fract(tex_pos), u_span_globe);
  // update particle position
  gl_FragColor = vec4(transform(tex_pos, u_offset), 0.0, 1.0);

   //gl_FragColor = vec4(mix(pos, transform(random_pos, u_offset), drop), 0.0, 1.0);
}
