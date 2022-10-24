precision highp float;
#pragma glslify: transform = require(./utils/transform)
#pragma glslify: sampleUV = require(./data/sampleUV) 

// transform
uniform mat4 u_matrix;
uniform mat4 u_offset;
uniform vec2 u_wrap;

// color
uniform sampler2D u_color_ramp;
uniform float u_color_range;
uniform float u_color_min;
uniform float u_opacity;

attribute vec2 a_pos;
varying vec2 v_tex_pos;

export void fillLayerVertex() {
  v_tex_pos = a_pos;
  gl_Position = u_matrix * vec4(transform(a_pos, u_offset) + u_wrap, 0.0, 1.0); 
}

export void fillLayerFragment() {
  float speed = length(sampleUV(v_tex_pos));
  vec2 ramp_pos = vec2((speed - u_color_min) / u_color_range, 0.5);
  gl_FragColor = texture2D(u_color_ramp, ramp_pos) * u_opacity;
}
