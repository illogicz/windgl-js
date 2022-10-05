precision highp float;

#pragma glslify: wgs84ToMercator = require(./wgs84ToMercator)
#pragma glslify: mercatorToWGS84 = require(./mercatorToWGS84)
#pragma glslify: transform = require(./transform)

uniform mat4 u_transform;
uniform mat4 u_transform_inverse;
uniform sampler2D u_input;
uniform vec2 u_input_size;

attribute vec2 a_pos;
varying vec2 v_tex_pos;

const float c_factor = 255.0;

// 12 bits per component
// UUUUUUUU-UUUUVVVV-VVVVVVVV-11111111
// RRRRRRRR-GGGGGGGG-BBBBBBBB-AAAAAAAA

// Not using alpha channel in source PNGs, since it likely will cause headaches 
// with premultiplied alpha on different platforms. 12 bits should be good enough.


// Convert RGB to uint UV
vec2 RGBtoUVi(const vec4 rgb) {
    vec4 bits = floor(rgb * c_factor + 0.2);
    float n1 = floor(bits.g / 16.0);
    float n2 = floor(mod(bits.g, 16.0));
    float u = floor(bits.r) * 16.0 + n1;
    float v = n2 * 256.0 + floor(bits.b);
    return vec2(u, v);
}

// Convert uint UV to RGB
// likely unneeded as we will try to use alpha channel for actual work
vec4 UVtoRGB(const vec2 uvf) {
    vec2 uv = floor(uvf + 0.5);
    float n1 = floor(mod(uv.x, 16.0));
    float r = floor(uv.x / 16.0);
    float n2 = floor(uv.y / 256.0);
    float b = floor(mod(uv.y, 256.0));
    float g = n1 * 16.0 + n2;
    return vec4(r, g, b, c_factor) / c_factor;
}

vec4 UVtoRGBA(const vec2 uv) {
    vec2 uv8 = uv / 16.0;
    return vec4(floor(uv8) / 256.0, fract(uv8));
}


export void reprojectVertex() {
    vec2 clip = (a_pos - vec2(0.5)) * vec2(2.0);
    vec2 deg = transform(a_pos, u_transform);
    v_tex_pos = wgs84ToMercator(deg);
    gl_Position = vec4(clip, 0, 1); 
}

export void reprojectFragment() {
    vec2 deg = mercatorToWGS84(v_tex_pos);
    vec2 deg_tex = transform(deg, u_transform_inverse);

    float h = u_input_size.y;
    float tex_y = deg_tex.y * h - 0.5;
    vec4 t1 = texture2D(u_input, vec2(deg_tex.x, (floor(tex_y) + 0.5) / h));
    vec4 t2 = texture2D(u_input, vec2(deg_tex.x, (ceil(tex_y) + 0.5) / h));
    vec2 uv1 = RGBtoUVi(t1);
    vec2 uv2 = RGBtoUVi(t2);
    vec2 uv = mix(uv1, uv2, fract(tex_y));
    vec4 tex = UVtoRGB(uv);

    uv = RGBtoUVi(tex);
    tex = vec4(uv / (16.0 * 256.0), 0.0, 1.0);

    gl_FragColor = tex;
}
