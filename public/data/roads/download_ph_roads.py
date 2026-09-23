import requests
import json
import time

BASE_URL = "https://services5.arcgis.com/30usvfexPlGhD61v/ArcGIS/rest/services/OSM_Roads/FeatureServer/0/query"

BATCH_SIZE = 2000

# First, find out how many roads there are
params = {
    "where": "1=1",
    "returnCountOnly": "true",
    "f": "json"
}

response = requests.get(BASE_URL, params=params)
response.raise_for_status()

total = response.json()["count"]

print(f"Total road features: {total:,}")
print(f"Estimated requests: {(total + BATCH_SIZE - 1) // BATCH_SIZE}")

all_features = []

for offset in range(0, total, BATCH_SIZE):

    print(
        f"Downloading {offset + 1:,} - "
        f"{min(offset + BATCH_SIZE, total):,}..."
    )

    params = {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "resultOffset": offset,
        "resultRecordCount": BATCH_SIZE,
        "f": "geojson"
    }

    response = requests.get(BASE_URL, params=params)
    response.raise_for_status()

    data = response.json()

    features = data.get("features", [])

    all_features.extend(features)

    print(f"  Received: {len(features):,}")

    time.sleep(0.5)


# Save everything into ONE GeoJSON file
output = {
    "type": "FeatureCollection",
    "features": all_features
}

with open("philippines_all_roads.geojson", "w", encoding="utf-8") as f:
    json.dump(output, f)

print()
print("===================================")
print("DOWNLOAD COMPLETE")
print("===================================")
print(f"Total downloaded: {len(all_features):,}")
print("File: philippines_all_roads.geojson")