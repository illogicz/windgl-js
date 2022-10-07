float c_x0 = -1.0;
float c_x1 =  0.0;
float c_x2 =  1.0;
float c_x3 =  2.0;

//=======================================================================================
vec3 CubicLagrange (vec3 A, vec3 B, vec3 C, vec3 D, float t)
{
    return
        A * 
        (
            (t - c_x1) / (c_x0 - c_x1) * 
            (t - c_x2) / (c_x0 - c_x2) *
            (t - c_x3) / (c_x0 - c_x3)
        ) +
        B * 
        (
            (t - c_x0) / (c_x1 - c_x0) * 
            (t - c_x2) / (c_x1 - c_x2) *
            (t - c_x3) / (c_x1 - c_x3)
        ) +
        C * 
        (
            (t - c_x0) / (c_x2 - c_x0) * 
            (t - c_x1) / (c_x2 - c_x1) *
            (t - c_x3) / (c_x2 - c_x3)
        ) +       
        D * 
        (
            (t - c_x0) / (c_x3 - c_x0) * 
            (t - c_x1) / (c_x3 - c_x1) *
            (t - c_x2) / (c_x3 - c_x2)
        );
}

//=======================================================================================
vec4 bicubicSample (vec2 P)
{
    vec2 pixel = P * windRes + 0.5;
    vec2 invRes = 1.0 / windRes;
    vec2 frac = fract(pixel);

    pixel = floor(pixel) / windRes - invRes * 0.5;
    
    vec3 C10 = windTexture(pixel + invRes * vec2( 0.0, -1.0)).rgb;
    vec3 C00 = windTexture(pixel + invRes * vec2(-1.0, -1.0)).rgb;
    vec3 C20 = windTexture(pixel + invRes * vec2( 1.0, -1.0)).rgb;
    vec3 C30 = windTexture(pixel + invRes * vec2( 2.0, -1.0)).rgb;

    vec3 C01 = windTexture(pixel + invRes * vec2(-1.0, 0.0)).rgb;
    vec3 C11 = windTexture(pixel + invRes * vec2( 0.0, 0.0)).rgb;
    vec3 C21 = windTexture(pixel + invRes * vec2( 1.0, 0.0)).rgb;
    vec3 C31 = windTexture(pixel + invRes * vec2( 2.0, 0.0)).rgb;    

    vec3 C02 = windTexture(pixel + invRes * vec2(-1.0, 1.0)).rgb;
    vec3 C12 = windTexture(pixel + invRes * vec2( 0.0, 1.0)).rgb;
    vec3 C22 = windTexture(pixel + invRes * vec2( 1.0, 1.0)).rgb;
    vec3 C32 = windTexture(pixel + invRes * vec2( 2.0, 1.0)).rgb;    

    vec3 C03 = windTexture(pixel + invRes * vec2(-1.0, 2.0)).rgb;
    vec3 C13 = windTexture(pixel + invRes * vec2( 0.0, 2.0)).rgb;
    vec3 C23 = windTexture(pixel + invRes * vec2( 1.0, 2.0)).rgb;
    vec3 C33 = windTexture(pixel + invRes * vec2( 2.0, 2.0)).rgb;    
    
    vec3 CP0X = CubicLagrange(C00, C10, C20, C30, frac.x);
    vec3 CP1X = CubicLagrange(C01, C11, C21, C31, frac.x);
    vec3 CP2X = CubicLagrange(C02, C12, C22, C32, frac.x);
    vec3 CP3X = CubicLagrange(C03, C13, C23, C33, frac.x);
    
    return vec4(CubicLagrange(CP0X, CP1X, CP2X, CP3X, frac.y), 1.0);
}


// vec4 cubic(float x)
// {
//     float x2 = x * x;
//     float x3 = x2 * x;
//     vec4 w;
//     w.x =   -x3 + 3.*x2 - 3.*x + 1.;
//     w.y =  3.*x3 - 6.*x2       + 4.;
//     w.z = -3.*x3 + 3.*x2 + 3.*x + 1.;
//     w.w =  x3;
//     return w;
// }

// vec4 cubic(float v)
// {
//     vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
//     vec4 s = n * n * n;
//     float x = s.x;
//     float y = s.y - 4.0 * s.x;
//     float z = s.z - 4.0 * s.y + 6.0 * s.x;
//     float w = 6.0 - x - y - z;
//     return vec4(x, y, z, w) / 6.0;
// }

// vec4 bicubicSample(vec2 coord_i)
// {

//     vec2 coord = coord_i * windRes;
// 	vec2 f = fract(coord);
//     coord = floor(coord);

//     f += vec2(0.5, 0.5);

//     vec4 xcubic = cubic(f.x);
//     vec4 ycubic = cubic(f.y);

//     vec4 c = vec4(coord.x - 0.5, coord.x + 1.5, coord.y - 0.5, coord.y + 1.5);
//     vec4 s = vec4(xcubic.x + xcubic.y, xcubic.z + xcubic.w, ycubic.x + ycubic.y, ycubic.z + ycubic.w);
//     vec4 offset = c + vec4(xcubic.y, xcubic.w, ycubic.y, ycubic.w) / s;

//     vec4 sample0 = windTexture(vec2(offset.x, offset.z) / windRes);
//     vec4 sample1 = windTexture(vec2(offset.y, offset.z) / windRes);
//     vec4 sample2 = windTexture(vec2(offset.x, offset.w) / windRes);
//     vec4 sample3 = windTexture(vec2(offset.y, offset.w) / windRes);

//     float sx = s.x / (s.x + s.y);
//     float sy = s.z / (s.z + s.w);

//     return mix(mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);
// }

#pragma glslify: export(bicubicSample)