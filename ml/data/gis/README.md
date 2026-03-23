# GIS inputs for synthetic data generation

Government PHIVOLCS layers live under **`data/gis/data/`** in two folders:

| Folder | Product | Role in generator |
|--------|---------|-------------------|
| **`H_VFS_PHIVOLCS/`** | `H_VFS_ALL_PHIVOLCS_PL.shp` | **Valley Fault System** polylines — used for **`distance_to_fault_km`** (nearest segment in projected CRS). |
| **`H_LIQ_PHIVOLCS_BUL/`** | `H_LIQ_LOW_PHIVOLCS.shp`, `H_LIQ_MOD_PHIVOLCS.shp`, `H_LIQ_HIGH_PHIVOLCS.shp` | Liquefaction bulletin **polygons** — if a building point falls inside, **`soil_classification`** is set from tier (LOW→C, MOD→D, HIGH→E); overlaps resolve to the highest tier. |

Place **all** sidecar files next to each `.shp` (`.dbf`, `.shx`, `.prj`, `.cpg`, etc.).

## Run

From the `ml/` directory:

```bash
pip install -r requirements.txt
python scripts/generate_synthetic_data.py --n 5000
```

Defaults:

- Fault shapefile: `data/gis/data/H_VFS_PHIVOLCS/H_VFS_ALL_PHIVOLCS_PL.shp`
- Liquefaction: `data/gis/data/H_LIQ_PHIVOLCS_BUL/*.shp` (disable with `--no-liquefaction-overlay`)
- Study area (**San Jose del Monte, Bulacan**): downloaded from Nominatim unless you pass `--boundary path/to/study_area.geojson` (alias: `--caloocan-boundary` for older scripts).

Override the GIS root:

```bash
python scripts/generate_synthetic_data.py --gis-data-dir data/gis/data
```
