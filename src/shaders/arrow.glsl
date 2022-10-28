precision highp float;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

uniform mat4 u_screen_to_coord;
uniform mat4 u_coord_to_uv;
uniform mat4 u_uv_to_coord;
uniform vec2 u_dimensions;

attribute float a_index;
attribute vec2 a_vert;

varying vec2 v_center;
varying float v_size;
varying float v_speed;


#pragma glslify: transform = require(./utils/transform)
#pragma glslify: sampleUV = require(./data/sampleUV) 

mat2 rotation(float angle) {
    return mat2(cos(angle), sin(angle),
                -sin(angle), cos(angle));
}

export void arrowVertex() {
    vec2 unit = 1.3 / u_dimensions;
    vec2 screen = vec2(
      mod(a_index, u_dimensions.x) + 0.5,
      floor(a_index / u_dimensions.x) + 0.5 
    ) / u_dimensions * 2.0 - 1.0;

    float min_lon = transform(vec2(0.0), u_uv_to_coord).x;
    vec2 coord = transform(screen, u_screen_to_coord);
    coord.x = fract(coord.x - min_lon) + min_lon;

    vec2 tex_pos = transform(coord, u_coord_to_uv);
    vec2 uv = sampleUV(tex_pos.xy);

    vec2 isb = step(tex_pos, vec2(1.0)) * step(vec2(0.0), tex_pos);
    screen.x += (1.0 - (isb.x * isb.y)) * 100.0;

    float angle = atan(uv.x, uv.y);
    float speed = length(uv);

    v_speed = speed;
    v_size = speed / 40.0;
    v_center = a_vert;

    gl_Position = vec4(screen.xy + rotation(angle + PI) * a_vert * unit, 0.0, 1.0);
}


float polygon(vec3 st, int N) {
    float a = atan(st.x, st.y) + PI;
  	float r = TWO_PI / float(N);

    float d = cos(floor(0.5 + a / r) * r - a) * length(st.xy);
    return d;
}

mat3 scale(vec2 _scale){
    return mat3(1.0 / _scale.x, 0, 0,
                0, 1.0 / _scale.y, 0,
                0, 0, 1);
}

mat3 translate(vec2 _translate) {
    return mat3(1, 0, _translate.x,
                0, 1, _translate.y,
                0, 0, 1);
}

float arrow(vec3 st, float len, float pad) {
    return min(
        polygon(st * scale(vec2(0.3 + pad)), 3),
        polygon(st * translate(vec2(-0.00, len / 2.0)) * scale(vec2(0.2 + pad, len + pad)), 4)
    );
}

export void arrowFragment() {
    vec3 st = vec3(v_center, 1);
    float size = mix(0.0, 2.0, v_size);
    float d = arrow(st * translate(vec2(0, -size / 2.0)), size, 0.0);
    float d2 = arrow(st * translate(vec2(0, -size / 2.0)), size, 0.1);

    float pi = 0.4; // 0.3
    float po = 0.5; // 0.37
    float inside = 1.0 - smoothstep(pi, po, d);
    float halo = 1.0 - smoothstep(pi, po, d2);
    //float halo = (1.0 - smoothstep(0.405, 0.555, d)) - inside;

    // EDIT: 256x1 instead, avoiding vertical interpolation issues
    //vec2 ramp_pos = vec2(v_speed, 0.5);
    
    vec4 fill = vec4(1.0, 1.0, 1.0, 1.0); //texture2D(u_color_ramp, ramp_pos);
    vec4 stroke = vec4(0.0, 0.0, 0.0, 1.0); //texture2D(u_color_ramp, ramp_pos);
    gl_FragColor = fill * inside + halo * stroke;
}
