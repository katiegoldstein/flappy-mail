#!/bin/sh
# Downloads the GeoNames city list (CC-BY 4.0, credited in the site footer) into data/raw.
set -e
cd "$(dirname "$0")/../data" && mkdir -p raw && cd raw
curl -sSfLO https://download.geonames.org/export/dump/cities15000.zip
curl -sSfLO https://download.geonames.org/export/dump/admin1CodesASCII.txt
unzip -o -q cities15000.zip && rm cities15000.zip
