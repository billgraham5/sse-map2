#!/usr/bin/env node
const fs = require('node:fs');

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function validateGeoJSON(data) {
  const errors = [];

  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    errors.push('Root object must be a GeoJSON FeatureCollection with a features array.');
    return errors;
  }

  const ids = new Set();

  data.features.forEach((feature, index) => {
    const prefix = `feature[${index}]`;
    if (!feature || feature.type !== 'Feature') {
      errors.push(`${prefix}: must be type "Feature".`);
      return;
    }

    const props = feature.properties || {};
    const geom = feature.geometry || {};

    if (!props.id || typeof props.id !== 'string') {
      errors.push(`${prefix}: properties.id is required and must be a string.`);
    } else if (ids.has(props.id)) {
      errors.push(`${prefix}: duplicate id "${props.id}".`);
    } else {
      ids.add(props.id);
    }

    if (!props.title || typeof props.title !== 'string') {
      errors.push(`${prefix}: properties.title is required and must be a string.`);
    }

    if (props.link && !isValidUrl(props.link)) {
      errors.push(`${prefix}: properties.link must be a valid http/https URL if provided.`);
    }

    if (props.icon && props.icon !== 'default' && !isValidUrl(props.icon)) {
      errors.push(`${prefix}: properties.icon must be "default" or a valid URL.`);
    }

    if (!props.updated_at || Number.isNaN(Date.parse(props.updated_at))) {
      errors.push(`${prefix}: properties.updated_at must be an ISO datetime string.`);
    }

    if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates) || geom.coordinates.length !== 2) {
      errors.push(`${prefix}: geometry must be Point with [lng, lat] coordinates.`);
      return;
    }

    const [lng, lat] = geom.coordinates;
    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
      errors.push(`${prefix}: latitude must be a number in [-90, 90].`);
    }
    if (typeof lng !== 'number' || lng < -180 || lng > 180) {
      errors.push(`${prefix}: longitude must be a number in [-180, 180].`);
    }
  });

  return errors;
}

function main() {
  const filePath = process.argv[2] || 'docs/data/markers.geojson';
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const errors = validateGeoJSON(data);

  if (errors.length > 0) {
    console.error('GeoJSON validation failed:');
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`GeoJSON validation passed: ${filePath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateGeoJSON,
};
