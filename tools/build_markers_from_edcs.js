#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(process.cwd(), 'docs/data/edcs.txt');
const OUTPUT = path.join(process.cwd(), 'docs/data/markers.geojson');

function parseTsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) throw new Error('edcs.txt is empty.');

  const headers = lines[0].split('\t').map((h) => h.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cols[index] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function toNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be numeric, received: ${value}`);
  return number;
}

function buildFeature(row) {
  const id = row.id || row.ID;
  const title = row.title || row.Title;
  const location = row.Location || row.location;
  const category = row.category || row.Region || '';
  const lat = toNumber(row.lat || row.latitude || row.Latitude, 'lat');
  const lng = toNumber(row.lng || row.longitude || row.Longitude, 'lng');

  if (!id || !title || !location) {
    throw new Error(`row missing required field(s): id/title/Location in row ${JSON.stringify(row)}`);
  }

  return {
    type: 'Feature',
    properties: {
      id,
      title,
      description: location,
      Location: location,
      category,
      updated_at: row.updated_at || new Date().toISOString(),
    },
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
  };
}

function main() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const rows = parseTsv(source);
  const features = rows.map(buildFeature);

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(geojson, null, 2)}\n`);
  console.log(`Wrote ${features.length} markers to ${OUTPUT}`);
}

main();
