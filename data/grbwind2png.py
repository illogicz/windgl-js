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


import io
from math import ceil, log2
import os
import pathlib
import json
import argparse
import glob
from datetime import datetime
from affine import Affine as af

# from planar import Affine
import numpy as np
import rasterio
from rasterio.plot import reshape_as_image
from PIL import Image, ImageDraw


def prepare_array(bands):
    # Drop extra row in array
    # TODO: Something more elegant like interpolate rows

    # Convert coverage from 0->360 to -180->180
    # bands = np.roll(bands, int(0.5 * bands.shape[2]), 2)

    zero = [0, 0, 255, 255]
    # rescale values from floats to uint8
    for i in range(0, bands.shape[0]):
        def xform(v): return 255 * \
            (v - bands[i].min()) / (bands[i].max() - bands[i].min())
        zero[i] = np.uint8(xform(0))
        bands[i] = xform(bands[i])

    # Build array in image format
    empty_band = np.zeros((1, bands.shape[1], bands.shape[2]))

    bands = np.concatenate((bands, empty_band), axis=0)

    return (bands.astype(np.uint8), tuple(zero))


def write_json(data_dir, name, json_output):
    with open(os.path.join(data_dir, f"{name}.json"), "w") as f:
        f.write(json.dumps(json_output, indent=4))


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
        default="2022093011",  # 2022093011
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
    #filename = f"data/harmonie_xy_2022-09-28_06_nl.grb"
    imagename = "full.png"
    directory = os.path.join(args.output_dir, args.timestamp)

    src: rasterio.DatasetReader = rasterio.open(filename)
    bands = src.read()
    minRes = min(src.res)
    minzoom = 0
    maxzoom = ceil(log2(1/minRes))

    tileWidth = 360
    tileHeight = 180
    tileSize = (tileWidth, tileHeight)

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

    (array, zero) = prepare_array(bands)
    img_array = reshape_as_image(array)

    # full image, store it
    fullImage = Image.fromarray(img_array)
    write_image(directory, imagename, fullImage)

    # temp image to draw onto
    tileImage = Image.new("RGBA", (tileWidth, tileHeight), zero)
    draw = ImageDraw.Draw(tileImage)

    # empty image, store formated bytes
    emptyImage = io.BytesIO()
    tileImage.copy().save(emptyImage, "PNG")

    bounds_n = [
        af.translation(0.5, 0.5) * af.scale(1/360, -1/180) * p
        for p in [(src.bounds.left, src.bounds.top), (src.bounds.right, src.bounds.bottom)]
    ]

    for zoom in range(maxzoom + 1):
        scale = 2 ** zoom

        (lt, rb) = [af.scale(scale) *
                    af.scale(*tileSize) * p for p in bounds_n]
        size = ceil(rb[0] - lt[0]), ceil(rb[1] - lt[1])
        scaled = fullImage.resize(size, Image.Resampling.BICUBIC)

        for x in range(scale):
            dir = os.path.join(directory, str(zoom), str(x))
            os.makedirs(dir, exist_ok=True)
            for y in range(scale):
                (left, top, right, bottom) = map(round, np.array([
                    af.translation(-x * 360, -y * 180) * c for c in (lt, rb)
                ]).flatten())

                filename = os.path.join(dir, f"{y}.png")
                if left <= tileWidth and right >= 0 and top <= tileHeight and bottom >= 0:
                    draw.rectangle((0, 0, tileWidth, tileHeight), fill=zero)
                    tileImage.paste(scaled, (round(left), round(top)))
                    tileImage.save(filename)
                else:  # temporary, fill empty tiles, TODO, remove
                    with open(filename, "wb") as f:
                        f.write(emptyImage.getbuffer())

    write_json(directory, "data", json_variables)

    # if args.clean:
    #     for f in glob.glob(os.path.join(args.output_dir, "*.grb")):
    #         os.remove(f)
