precision highp float;

#pragma glslify: wgs84ToMercator = require(./utils/wgs84ToMercator)
#pragma glslify: mercatorToWGS84 = require(./utils/mercatorToWGS84)
#pragma glslify: transform = require(./utils/transform)

uniform mat4 u_matrix;
uniform mat4 u_offset;
uniform mat4 u_offset_inverse;
uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_speed_max;
uniform bool u_bli_enabled;

uniform float u_opacity;
uniform sampler2D u_color_ramp;
uniform mat4 u_inverse_matrix;
const vec4 c_empty = vec4(0.0 ,0.0 ,0.0 ,0.0);


attribute vec2 a_pos;

varying vec2 v_tex_pos; // the position in the texture to find

vec4 windTexture(const vec2 uv) {
    return texture2D(u_wind, uv);
}

// #pragma glslify: windSpeedRelative = require(./bilinearWind, windTexture=windTexture, windRes=u_wind_res)
#pragma glslify: bicubicSample = require(./utils/bicubic, windTexture=windTexture, windRes=u_wind_res)

vec4 windTexture_i(const vec2 uv) {
    return u_bli_enabled 
        ? bicubicSample(uv)
        : windTexture(uv);
}

export void sampleFillVertex() {
    vec2 worldCoordsWGS84 = transform(a_pos, u_offset);
    vec2 worldCoordsMerc = wgs84ToMercator(worldCoordsWGS84);
    v_tex_pos = worldCoordsMerc;
    gl_Position = u_matrix * vec4(worldCoordsMerc, 0, 1);
}

export void sampleFillFragment() {
    vec2 globalWGS84 = mercatorToWGS84(v_tex_pos);
    vec2 localWGS84 = transform(globalWGS84, u_offset_inverse);

    vec4 tex = windTexture_i(localWGS84);
    float speed_t = length(mix(u_wind_min, u_wind_max, tex.rg)) / u_speed_max;

    vec2 ramp_pos = vec2(speed_t, 0.5);
    vec4 color = texture2D(u_color_ramp, ramp_pos);
    float mask = (1.0 - ceil(tex.b));
    gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0) * mask;
}
