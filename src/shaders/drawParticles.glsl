precision highp float;

// ------------------------------------------------------------------------------------
// Draw particles to screen

// texture
uniform sampler2D u_particles;
uniform float u_particles_res;

// transform
uniform mat4 u_matrix;
uniform vec2 u_wrap;

// display
uniform vec4 u_color;
uniform float u_size;

// particle index
attribute float a_index; 

export void drawVertex() {
  // get particle position from texture data
  vec2 pos = texture2D(u_particles, vec2(
    fract(a_index / u_particles_res),
    floor(a_index / u_particles_res) / u_particles_res)
  ).xy;
  gl_PointSize = u_size;
  gl_Position = u_matrix * vec4(pos + u_wrap, 0.0, 1.0); 
}

export void drawFragment() {
    gl_FragColor = u_color;
}
