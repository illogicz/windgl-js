/**
 * Wind speed lookup. Returns a vector that isn't re-normalized to real world units.
 * Uses manual bilinear filtering based on 4 adjacent pixels for smooth interpolation.
 */
vec2 bilinearWind(const vec2 uv) {
    vec2 res = windRes; // - vec2(1.0, 1.0);
    vec2 px = 1.0 / res;
    vec2 vp = uv * res + vec2(0.5, 0.5);
    vec2 vc = floor(vp) * px;
    vec2 f = fract(vp);
    vec2 tl = windTexture(vc);
    vec2 tr = windTexture(vc + vec2(px.x, 0));
    vec2 bl = windTexture(vc + vec2(0, px.y));
    vec2 br = windTexture(vc + px);
    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

#pragma glslify: export(bilinearWind)
