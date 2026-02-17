#!/bin/sh
set -e

OUTPUT_DIR="dist"
ZIP_NAME="x-bookmarks-exporter.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/$ZIP_NAME"

zip -r "$OUTPUT_DIR/$ZIP_NAME" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  gallery.html \
  gallery.js \
  analytics.js \
  i18n.js \
  _locales \
  assets/icons

echo "Built $OUTPUT_DIR/$ZIP_NAME"
