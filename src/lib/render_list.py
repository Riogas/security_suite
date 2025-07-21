import math

def lonlat_to_tile_xy(lon, lat, z):
    n = 2.0 ** z
    x_tile = int((lon + 180.0) / 360.0 * n)
    y_tile = int((1.0 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n)
    return x_tile, y_tile

# Coordenadas para Uruguay (puedes ajustar si querés menos/más margen)
lat_nw, lon_nw = -29.0, -59.0    # Arriba Izquierda (Noroeste)
lat_se, lon_se = -35.5, -52.5    # Abajo Derecha (Sudeste)

output_file = "render_commands.txt"

with open(output_file, "w") as f:
    for z in range(5, 19):
        x_min, y_min = lonlat_to_tile_xy(lon_nw, lat_nw, z)
        x_max, y_max = lonlat_to_tile_xy(lon_se, lat_se, z)
        min_x, max_x = min(x_min, x_max), max(x_min, x_max)
        min_y, max_y = min(y_min, y_max), max(y_min, y_max)
        command = (
            f"render_list -a --min-zoom={z} --max-zoom={z} "
            f"--min-x={min_x} --max-x={max_x} "
            f"--min-y={min_y} --max-y={max_y} "
            f"--num-threads=4 --verbose"
        )
        f.write(command + "\n")

print(f"Comandos guardados en: {output_file}")
