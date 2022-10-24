precision highp float;

#pragma glslify: sampleUV = require(./data/sampleUV) 
#pragma glslify: transform = require(./utils/transform)

uniform sampler2D u_heatmap;
uniform mat4 u_hm_to_uv;
uniform vec2 u_resolution_met; // texel / meter
uniform vec2 u_resolution_tex;
uniform float u_time_step;
uniform float u_drop_off;

const float MAX_BLUR = 3.0;
const float BLUR_DIM = 7.0;
const int BLUR_SIZE = 49;
uniform float u_blur_kernel[49];

varying vec2 v_tex_pos;
attribute vec2 a_pos;
   


export void updateHeatmapVertex() {
  v_tex_pos = a_pos;
  gl_Position = vec4(2.0 * v_tex_pos - 1.0, 0, 1);
} 
 
// ------------------------------------------------------------------------------------
// Fragment, Update particle positions

export void updateHeatmapFragment() { 

  vec2 uv_pos = transform(v_tex_pos, u_hm_to_uv);
  vec2 speed = sampleUV(uv_pos);
  vec2 tex_dist = u_time_step * speed * u_resolution_met;
  vec2 sample_pos = v_tex_pos - tex_dist;

  vec4 sum = vec4(0.0);
  for(int i = 0; i < 49; i++){
    float x = mod(float(i), BLUR_DIM) - MAX_BLUR;
    float y = floor(float(i) / BLUR_DIM) - MAX_BLUR;
    vec2 tex_pos = sample_pos + vec2(x, y) * u_resolution_tex;
    vec4 tex_val = texture2D(u_heatmap, tex_pos);
    float blur = u_blur_kernel[i];
    sum += tex_val * blur; //blur;
  } 

  vec2 inside = step(sample_pos, vec2(0.99999)) * step(vec2(0.00001), sample_pos);
  float f = inside.x * inside.y;
  //gl_FragColor = texture2D(u_heatmap, sample_pos) * f * 0.9; //sum;
  gl_FragColor = vec4(sum.rgb * f * u_drop_off, 0.0);
}
 