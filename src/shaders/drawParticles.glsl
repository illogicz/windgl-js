precision highp float;

// ------------------------------------------------------------------------------------
// Draw particles to screen

uniform sampler2D u_particles;
uniform float u_particles_res;
uniform mat4 u_matrix; // view matrix
uniform vec2 u_wrap;   // wrap index

attribute float a_index; // particle index
varying vec4 v_color;
// TODO actual particle coordinate, 
// could be used for coloring, or other geospacial interactions
// varying vec2 v_particle_pos;

export void drawVertex() {
  // get particle position from texture data
  vec2 pos = texture2D(u_particles, vec2(
    fract(a_index / u_particles_res),
    floor(a_index / u_particles_res) / u_particles_res)
  ).xy;

  float size = (u_matrix * vec4(0.0002, vec3(0.0))).x;
  v_color = vec4(min(1.0, size));
  gl_PointSize = size;
  // convert to screen coordinates
  gl_Position = u_matrix * vec4(pos + u_wrap, 0.0, 1.0); 
}

export void drawFragment() {
    // draw it white for now
    gl_FragColor = v_color;
}
