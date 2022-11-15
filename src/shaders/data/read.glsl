precision highp float;
#pragma glslify: transform = require(./utils/transform)
#pragma glslify: sampleUV = require(./data/sampleUV) 

uniform mat4 u_matrix;
attribute vec2 a_pos;
varying vec2 v_tex_pos;

export void readVertex() { 
    v_tex_pos = transform(a_pos, u_matrix);
    gl_Position = vec4((a_pos - 0.5) * 2.0, 0, 1);
}

export void readFragment() {
    gl_FragColor = sampleUV(v_tex_pos);
}
