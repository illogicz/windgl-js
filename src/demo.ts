import maplibregl from "maplibre-gl";
import * as windGL from ".";
import { LayerConfig } from "./layer";


//mapboxgl.accessToken =
//  "pk.eyJ1IjoiYXN0cm9zYXQiLCJhIjoiY2o3YWtjNnJzMGR6ajM3b2FidmNwaDNsaSJ9.lwWi7kOiejlT0RbD7RxtmA";

let mapContainer1 = document.getElementById("map1") as HTMLElement;
let mapContainer2 = document.getElementById("map2") as HTMLElement;

let map1: maplibregl.Map;
let map2: maplibregl.Map;


type Config = {
  style: string,
  layers: LayerConfig[],
  flyTo?: maplibregl.FlyToOptions;
}

const configs: Config[] = [
  {
    style: "mapbox://styles/mapbox/light-v9",
    layers: [
      { type: "sampleFill", after: "road-pedestrian-case" },
      { type: "particles", after: "waterway-label" }
    ],
    flyTo: { zoom: 2 }
  } as any,
  {
    style: "mapbox://styles/mapbox/dark-v9",
    layers: [
      {
        type: "arrow",
        after: "road-pedestrian-case",
        properties: {
          "arrow-min-size": 80,
          "arrow-color": [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            0.0,
            "#3288bd",
            10,
            "#66c2a5",
            20,
            "#abdda4",
            30,
            "#e6f598",
            40,
            "#fee08b",
            50,
            "#fdae61",
            60,
            "#f46d43",
            100.0,
            "#d53e4f"
          ]
        }
      } as any
    ],
    flyTo: { pitch: 30, zoom: 2.5, center: [0, 45] }
  },
  {
    style: "mapbox://styles/mapbox/light-v9",
    layers: [
      {
        type: "particles",
        after: "waterway-label",
        properties: {
          "particle-speed": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.9,
            8,
            1.5
          ],
          "particle-color": "rgba(60, 60, 90, 0.9)"
        }
      } as any
    ],
    flyTo: { zoom: 2, center: [50, -10] }
  },
  {
    style: "mapbox://styles/mapbox/light-v9",
    layers: [
      {
        type: "sampleFill",
        after: "road-pedestrian-case",
        properties: {
          "sample-fill-color": [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            0,
            "#ffffcc",
            10,
            "#ffeda0",
            20,
            "#fed976",
            30,
            "#feb24c",
            40,
            "#fd8d3c",
            50,
            "#fc4e2a",
            60,
            "#e31a1c",
            70,
            "#bd0026",
            80,
            "#800026"
          ]
        }
      },
      {
        type: "arrow",
        after: "waterway-label",
        properties: {
          "arrow-min-size": 30,
          "arrow-color": [
            "interpolate",
            ["linear"],
            ["get", "speed"],
            0,
            "rgba(30, 30, 30, 0)",
            10,
            "rgba(30, 30, 30, 0)",
            20,
            "rgba(30, 30, 30, 0.6)",
            30,
            "rgba(30, 30, 30, 0.8)",
            40,
            "rgba(30, 30, 30, 0.8)",
            50,
            "rgba(30, 30, 30, 0.8)",
            60,
            "rgba(30, 30, 30, 0.9)",
            70,
            "rgba(30, 30, 30, 1)",
            80,
            "rgba(30, 30, 30, 1)"
          ],
          "arrow-halo-color": "rgba(240, 240, 240, 1)"
        }
      }
    ],
    flyTo: { zoom: 2 }
  }
];

function initializeConfig(container: HTMLElement, { style, layers }: Config) {
  const map = new maplibregl.Map({
    container: container,
    style
  });
  map.on("load", () => {
    const source = windGL.source("wind/2019031012/tile.json");

    layers.forEach((layerConfig) => {
      const { type, after, properties } = layerConfig;
      let layer: any = layerConfig;
      if ((windGL as any)[type]) {
        layer = (windGL as any)[type](
          Object.assign(
            {
              id: type,
              source
            },
            properties || {}
          )
        );
      }
      if (after) {
        map.addLayer(layer, after);
      } else {
        map.addLayer(layer)
      }

    });
  });
  return map;
}

function nextConfig() {
  mapContainer1.style.left = "-100%";
  mapContainer1.style.transition = "left 1s";
  mapContainer2.style.left = "0";
  mapContainer2.style.transition = "left 1s";
  setTimeout(() => {
    if (configs[index].flyTo) {
      map2.flyTo(configs[index].flyTo!);
    }
    index = (index + 1) % configs.length;
    map1 && map1.remove();
    map1 = map2;
    mapContainer1.style.transition = "none";
    mapContainer1.style.left = "100%";
    const temp = mapContainer1;
    mapContainer1 = mapContainer2;
    mapContainer2 = temp;
    map2 = initializeConfig(mapContainer2, configs[index]);
  }, 1000);
}

let index = 0;

map2 = initializeConfig(mapContainer2, configs[index]);

nextConfig();

document.getElementById("next")!.addEventListener("click", nextConfig);
