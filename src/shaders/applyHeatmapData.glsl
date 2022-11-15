precision highp float;

#pragma glslify: transform = require(./utils/transform)

// transform
uniform mat4 u_matrix;

// display
uniform float u_diameter;
uniform float u_fade;

// particle index
attribute vec2 a_positions; 
attribute vec4 a_data; 

varying vec4 v_data;

export void applyVertex() {
  v_data = a_data;
  vec2 pos = transform(a_positions, u_matrix);
  gl_PointSize = u_diameter;
  gl_Position = vec4(2.0 * pos - 1.0, 0, 1.0);
}

export void applyFragment() { 
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float f = 1.0 - smoothstep(u_fade, 1.0, d);
    gl_FragColor = vec4(v_data.rgb, 1.0) * f;
}
 