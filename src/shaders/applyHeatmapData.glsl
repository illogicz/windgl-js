precision highp float;

#pragma glslify: transform = require(./utils/transform)

// transform
uniform mat4 u_matrix;

// display
uniform float u_size;

// particle index
attribute vec2 a_positions; 
attribute vec4 a_data; 

varying vec4 v_data;

export void applyVertex() {
  v_data = a_data;
  vec2 pos = transform(a_positions, u_matrix);
  gl_PointSize = v_data.a >= 0.0 ? 5.0 : 0.0;
  gl_Position = v_data.a >= 0.0 ? vec4(2.0 * pos - 1.0, 0, 1.0) : vec4(0.0, 0.0, 0.0, 0.0);
}

export void applyFragment() {
    gl_FragColor = v_data;
} 