precision highp float;
#pragma glslify: transform = require(./utils/transform)

uniform mat4 u_matrix;
uniform sampler2D u_tex_0;
uniform sampler2D u_tex_1;
uniform float u_tex_a;

attribute vec2 a_pos;
varying vec2 v_tex_pos;


// Even needed to have a program/frame buffer output for this?
// Just do on the fly? TODO: Either way, make module of it

export void interpolateVertex() {
    v_tex_pos = a_pos; //transform(a_pos, u_matrix);
    gl_Position = vec4((a_pos - 0.5) * 2.0, 0, 1);
}

export void interpolateFragment() {
    vec4 c1 = texture2D(u_tex_0, v_tex_pos);
    vec4 c2 = texture2D(u_tex_1, v_tex_pos);
    //vec4 uv12 = vec4(c1.rg, c2.rg) * 255.0 + vec4(c1.ba, c2.ba);
    //vec2 uv = mix(uv12.xy, uv12.zw, u_tex_a);

    // rg color test
    //gl_FragColor = vec4(uv / 255.0, 0.0, 1.0);

    // rgba encoded
    //gl_FragColor = vec4(floor(uv) / 255.0, fract(uv));

    // half_float to rg;
    vec2 uv = mix(c1.xy, c2.xy, u_tex_a);
    gl_FragColor = vec4((uv + 40.0) / 80.0, 0.0, 1.0);
}
