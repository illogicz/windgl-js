"""
gfswind2png creates a TMS like pyramid of GFS wind data where the red and green
bands represent the u and v vector components.
Level 0 = 1 degree spatial resolution
Level 1 = 0.5 degree spatial resolution
Level 2 = 0.25 degree spatial resolution

setup: create python virtualenv with dependencies using Pipenv and the Pipfile
in this directory

usage: gfswind2png.py [-h] --timestamp TIMESTAMP [--output_dir OUTPUT_DIR]
                      [--clean]

optional arguments:
  -h, --help            show this help message and exit
  --timestamp TIMESTAMP
                        Enter timestamp in YYYYMMDDhh format. hh must be 00,
                        06, 12, 18
  --output_dir OUTPUT_DIR
                        Enter path to directory to save output. Defaults to
                        the current working directory.
  --clean               Cleans local folders
"""


from math import ceil, log2
import os
import pathlib
import json
import argparse
import glob
from datetime import datetime

#from planar import Affine
import numpy as np
import rasterio
from rasterio.plot import reshape_as_image
from PIL import Image, ImageDraw


def prepare_array(bands):
    # Drop extra row in array
    # TODO: Something more elegant like interpolate rows
    bands = bands[:, :-1, :]

    # Convert coverage from 0->360 to -180->180
    #bands = np.roll(bands, int(0.5 * bands.shape[2]), 2)

    # rescale values from floats to uint8
    for i in range(0, bands.shape[0]):
        bands[i] = (
            255
            * (bands[i] - bands[i].min())
            / (bands[i].max() - bands[i].min())
        )

    # Build array in image format
    empty_band = np.zeros((1, bands.shape[1], bands.shape[2]))

    bands = np.concatenate((bands, empty_band), axis=0)
    bands = bands.astype(np.uint8)

    return bands


def base_json(datetime, width, height, bounds, umin, umax, vmin, vmax):
    return {
        "date": datetime,
        "width": width,
        "height": height,
        "bounds": bounds,
        "uMin": round(umin, 2),
        "uMax": round(umax, 2),
        "vMin": round(vmin, 2),
        "vMax": round(vmax, 2)
    }


def build_tile_json(base, minzoom, maxzoom):
    return dict(base, {
        "minzoom": minzoom,
        "maxzoom": maxzoom,
        "tiles": [f"{{z}}/{{x}}/{{y}}.png"],
    })


def build_image_json(base, path, transform):
    return dict(base, {
        "transform": transform,
        "image": path
    })


def write_json(data_dir, name, json_output):
    with open(os.path.join(data_dir, "{name}.json"), "w") as f:
        f.write(json.dumps(json_output))


def write_image(base_dir, filename, image):
    path = os.path.join(base_dir, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path)


def slice_image(image, start_y, end_y, start_x, end_x):
    return image[start_y:end_y, start_x:end_x, :]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--timestamp",
        type=str,
        default="2022093012",
        required=False,
        help="Enter timestamp in YYYYMMDDhh format. hh must be 00, 06, 12, 18",
    )

    parser.add_argument(
        "--output_dir",
        type=str,
        default=pathlib.Path(__file__).resolve().parent,
        help=(
            "Enter path to directory to save output. "
            "Defaults to the current working directory."
        )
    )

    parser.add_argument(
        "--clean",
        dest="clean",
        action="store_true",
        help="Cleans local folders",
    )

    args = parser.parse_args()

    try:
        date_time = datetime.strptime(
            f"{args.timestamp}+0000", "%Y%m%d%H%z"
        ).isoformat()
    except ValueError as e:
        raise ValueError("Invalid timestamp entered.") from e

    filename = f"data/NL_{args.timestamp}00.grb"
    imagename = f"NL_{args.timestamp}00.png"
    directory = os.path.join(args.output_dir, args.timestamp)

    src = rasterio.open(filename)
    bands = src.read()
    minRes = min(src.res)
    minzoom = 0
    maxzoom = ceil(log2(1/minRes))
    tileHeight = 180
    tileWidth = 360

    json_variables = {
        "date": date_time,
        "uMin": round(bands[0, :, :].min(), 2),
        "uMax": round(bands[0, :, :].max(), 2),
        "vMin": round(bands[1, :, :].min(), 2),
        "vMax": round(bands[1, :, :].max(), 2),
        "bounds": src.bounds,

        "tileHeight": tileHeight,
        "tileWidth": tileWidth,
        "minzoom": minzoom,
        "maxzoom": maxzoom,
        "tiles": [f"{{z}}/{{x}}/{{y}}.png"],

        "width": src.width,
        "height": src.height,
        "transform": src.transform,
        "image": imagename
    }

    bands = reshape_as_image(prepare_array(bands))
    image = Image.fromarray(bands)
    write_image(directory, imagename, image)

    tileImage = Image.new("RGBA", (tileWidth, tileHeight), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tileImage)

    for zoom in range(maxzoom + 1):
        b = src.bounds.mul(2 ** zoom)
        for x in range(2 ** maxzoom):
            for y in range(2 ** maxzoom):
                filename = os.path.join(
                    directory, str(zoom), str(x), f"{y}.png")
                draw.rectangle((0, 0, tileWidth, tileHeight),
                               fill=(0, 0, 0, 0))
                tileImage.paste(image, src.bounds)
                image_cut = slice_image(
                    image, y * tileHeight, (y + 1) * tileHeight, x * tileWidth, (x + 1) * tileWidth)
                write_image(filename, image_cut)

    json_output = build_tile_json(args.timestamp, **json_variables)
    write_json(os.path.join(args.output_dir, args.timestamp), json_output)

    if args.clean:
        for f in glob.glob(os.path.join(args.output_dir, "*.grb")):
            os.remove(f)
