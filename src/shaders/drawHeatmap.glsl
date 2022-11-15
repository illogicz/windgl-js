precision highp float;
#pragma glslify: transform = require(./utils/transform)

uniform mat4 u_transform;
uniform float u_output_mult;
uniform float u_output_alpha;
uniform highp sampler2D u_tex;

attribute vec2 a_pos;
varying vec2 v_tex_pos;

export void drawVertex() {
  v_tex_pos = a_pos;
  vec4 c = u_transform * vec4(a_pos, 0, 1);
  gl_Position = vec4(c.xy / c.w, 0, 1);
}

export void drawFragment() {
  vec4 data = texture2D(u_tex, v_tex_pos);
  vec3 rgb = min(data.grb * u_output_mult, vec3(1.0));
  float a_avg = (rgb.r + rgb.b + rgb.g) / 3.0;
  float a_max = max(rgb.r, max(rgb.b, rgb.g));
  float a = mix(a_avg, a_max, u_output_alpha);
  gl_FragColor = vec4(rgb, a);
}
 