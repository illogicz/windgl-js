precision highp float;
#pragma glslify: transform = require(./utils/transform)

uniform mat4 u_matrix;
uniform mat4 u_offset;
uniform vec2 u_wrap;
uniform sampler2D u_tex;
uniform float u_output_mult;

attribute vec2 a_pos;
varying vec2 v_tex_pos;

export void drawVertex() {
  v_tex_pos = a_pos;
  gl_Position = u_matrix * vec4(transform(a_pos, u_offset) + u_wrap, 0.0, 1.0); 
}

export void drawFragment() {
  vec4 data = texture2D(u_tex, v_tex_pos);
  gl_FragColor = vec4(min(data.rgb, vec3(1.0) * u_output_mult), 0.0);
}
