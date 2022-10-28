const float PI = 3.1415926535897932384626433832795;

/**
 * Converts texture like WGS84 coordinates (this is just like WGS84, but instead of angles, it uses
 * intervals of 0..1) into mapbox style pseudo-mercator coordinates (this is just like mercator, but the unit isn't a meter, but 0..1
 * spans the entire world).
 */
 vec2 wgs84ToMercator(vec2 xy) {

    float y = xy.y == 0.0 ? 0.0 : 
              xy.y == 1.0 ? 1.0 : 
              (1.0 - log(tan((1.0-xy.y) * PI / 2.0)) / PI) / 2.0;
    return vec2(xy.x, y);
}

#pragma glslify: export(wgs84ToMercator)
