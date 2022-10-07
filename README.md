# WindGL

A WebGL-powered visualization of wind power using custom Maplibre Layers.

## Project Status

This code started as a fork of  
 -> https://github.com/mapbox/webgl-wind  
 -> https://github.com/astrosat/windgl  
 See there for more info

Technically a fork of https://github.com/lunaseasolutions/windgl-js on github.  
Although rebased back, might still use some of the changes in that fork.


## Changes

In the process of being modified, some of this done, some to do.

 - Converted to typescript
 - Replace mapbox with maplibre
 - Include non tile based layers
 - Preprojection to mercator for improved performance
 - Physically correct speeds
 - Interpolation between time series
 - 12 instead of 8 bit speed data, with a fixed range however
 - Learn how to webgl
  