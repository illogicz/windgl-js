
uniform float u_tex_a;
uniform sampler2D u_tex_0;
uniform sampler2D u_tex_1;

vec2 getSpeed(const vec2 tex_uv) {
  vec2 uv = mix(
    texture2D(u_tex_0, tex_uv).xy, 
    texture2D(u_tex_1, tex_uv).xy,
    u_tex_a
  ); 
  return vec2(uv.x , -uv.y);
}

#pragma glslify: export(getSpeed)
