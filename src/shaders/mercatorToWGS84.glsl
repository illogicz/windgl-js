const float PI = 3.1415926535897932384626433832795;

/**
 * Converts mapbox style pseudo-mercator coordinates (this is just like mercator, but the unit isn't a meter, but 0..1
 * spans the entire world) into texture like WGS84 coordinates (this is just like WGS84, but instead of angles, it uses
 * intervals of 0..1).
 * EDIT: Optimised 
 */
vec2 mercatorToWGS84(vec2 xy) {
    float y = (xy.y * 2.0 - 1.0) * PI;
    return vec2(xy.x, atan(exp(y)) * 2.0 / PI );
}

#pragma glslify: export(mercatorToWGS84)

/* ORIG
vec2 mercatorToWGS84(vec2 xy) {
    // convert lat into an angle
    float y = radians(180.0 - xy.y * 360.0);
    // use the formula to convert mercator -> WGS84
    y = 360.0 / PI  * atan(exp(y)) - 90.0;
    // normalize back into 0..1 interval
    y = y / -180.0 + 0.5;
    // pass lng through, as it doesn't change
    return vec2(xy.x, y);
}
*/