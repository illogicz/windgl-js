precision highp float;
#pragma glslify: transform = require(./utils/transform)

// transform
uniform mat4 u_matrix;
uniform mat4 u_offset;
uniform vec2 u_wrap;

// interpolation params
uniform float u_tex_a;
uniform sampler2D u_tex_0;
uniform sampler2D u_tex_1;

// color
uniform sampler2D u_color_ramp;
uniform float u_max_value;

attribute vec2 a_pos;
varying vec2 v_tex_pos;

export void fillLayerVertex() {
    v_tex_pos = a_pos;
    gl_Position = u_matrix * vec4(transform(a_pos, u_offset) + u_wrap, 0.0, 1.0); 
}

export void fillLayerFragment() {
    vec4 c1 = texture2D(u_tex_0, v_tex_pos);
    vec4 c2 = texture2D(u_tex_1, v_tex_pos);
    vec2 uv = mix(c1.xy, c2.xy, u_tex_a);
    vec2 ramp = vec2(length(uv) / u_max_value, 0.5);
    gl_FragColor = texture2D(u_color_ramp, ramp);
}