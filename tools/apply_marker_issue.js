#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseIssueFormBody } = require('./issue_parser');
const { validateGeoJSON } = require('./validate_geojson');

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'docs/data/markers.geojson');
const RESULT_FILE = path.join(ROOT, 'tools/last_result.json');

function fail(message) {
  return { ok: false, message };
}

function success(message) {
  return { ok: true, message };
}

function cleanOptional(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^\((none|no change)\)$/i.test(trimmed)) return undefined;
  return trimmed;
}

function parseNumber(value, kind) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${kind} must be a number.`);
  }
  return num;
}

function validateCoordinateRange(lat, lng) {
  if (lat !== undefined && (lat < -90 || lat > 90)) {
    throw new Error('Latitude must be in range -90..90.');
  }
  if (lng !== undefined && (lng < -180 || lng > 180)) {
    throw new Error('Longitude must be in range -180..180.');
  }
}

function generateId(issueNumber) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex');
  return `m-${y}${m}${d}-${issueNumber || rand}`;
}

function stableSortFeatures(features) {
  return features.sort((a, b) => {
    const idA = a?.properties?.id || '';
    const idB = b?.properties?.id || '';
    return idA.localeCompare(idB);
  });
}

function parseIssueType(labels = []) {
  const names = labels.map((l) => (l.name || '').toLowerCase());
  if (names.includes('marker-add')) return 'add';
  if (names.includes('marker-update')) return 'update';
  if (names.includes('marker-delete')) return 'delete';
  return null;
}

function getField(parsed, key) {
  return parsed[key]?.value;
}

function applyMutation(issue, geojson) {
  const parsed = parseIssueFormBody(issue.body || '');
  const issueType = parseIssueType(issue.labels || []);

  if (!issueType) return fail('Issue is missing one of marker-add, marker-update, or marker-delete labels.');

  if (issueType === 'add') {
    const title = cleanOptional(getField(parsed, 'title'));
    const idValue = cleanOptional(getField(parsed, 'marker_id')) || cleanOptional(getField(parsed, 'id'));
    const description = cleanOptional(getField(parsed, 'description'));
    const link = cleanOptional(getField(parsed, 'link'));
    const category = cleanOptional(getField(parsed, 'category'));
    const icon = cleanOptional(getField(parsed, 'icon'));

    if (!title) return fail('Title is required for Add Marker issues.');

    let lat;
    let lng;
    try {
      lat = parseNumber(cleanOptional(getField(parsed, 'latitude')) || cleanOptional(getField(parsed, 'lat')), 'Latitude');
      lng = parseNumber(cleanOptional(getField(parsed, 'longitude')) || cleanOptional(getField(parsed, 'lng')), 'Longitude');
      validateCoordinateRange(lat, lng);
    } catch (err) {
      return fail(err.message);
    }

    if (lat === undefined || lng === undefined) {
      return fail('Latitude and longitude are required for Add Marker issues.');
    }

    const id = idValue || generateId(issue.number);
    if (geojson.features.some((f) => f?.properties?.id === id)) {
      return fail(`A marker with id "${id}" already exists.`);
    }

    const now = new Date().toISOString();
    const feature = {
      type: 'Feature',
      properties: {
        id,
        title,
        description,
        link,
        category,
        icon,
        updated_at: now,
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    };

    Object.keys(feature.properties).forEach((k) => feature.properties[k] === undefined && delete feature.properties[k]);

    geojson.features.push(feature);
    stableSortFeatures(geojson.features);
    return success(`Added marker "${id}".`);
  }

  if (issueType === 'update') {
    const id = cleanOptional(getField(parsed, 'marker_id')) || cleanOptional(getField(parsed, 'id'));
    if (!id) return fail('Marker ID is required for Update Marker issues.');

    const target = geojson.features.find((f) => f?.properties?.id === id);
    if (!target) return fail(`Marker with id "${id}" was not found.`);

    const props = target.properties || {};
    const title = cleanOptional(getField(parsed, 'title'));
    const description = cleanOptional(getField(parsed, 'description'));
    const link = cleanOptional(getField(parsed, 'link'));
    const category = cleanOptional(getField(parsed, 'category'));
    const icon = cleanOptional(getField(parsed, 'icon'));
    const focus = parsed.optional_map_behavior?.checked || parsed.recenter_map_to_this_marker_on_load_sets_properties_focus_on_load_true?.checked;

    let lat;
    let lng;
    try {
      lat = parseNumber(cleanOptional(getField(parsed, 'latitude')) || cleanOptional(getField(parsed, 'lat')), 'Latitude');
      lng = parseNumber(cleanOptional(getField(parsed, 'longitude')) || cleanOptional(getField(parsed, 'lng')), 'Longitude');
      validateCoordinateRange(lat, lng);
    } catch (err) {
      return fail(err.message);
    }

    if (title !== undefined) props.title = title;
    if (description !== undefined) props.description = description;
    if (link !== undefined) props.link = link;
    if (category !== undefined) props.category = category;
    if (icon !== undefined) props.icon = icon;
    if (focus) props.focus_on_load = true;

    if (lat !== undefined || lng !== undefined) {
      const currentLng = target.geometry?.coordinates?.[0];
      const currentLat = target.geometry?.coordinates?.[1];
      const nextLng = lng !== undefined ? lng : currentLng;
      const nextLat = lat !== undefined ? lat : currentLat;
      validateCoordinateRange(nextLat, nextLng);
      target.geometry = { type: 'Point', coordinates: [nextLng, nextLat] };
    }

    props.updated_at = new Date().toISOString();
    target.properties = props;
    return success(`Updated marker "${id}".`);
  }

  const id = cleanOptional(getField(parsed, 'marker_id')) || cleanOptional(getField(parsed, 'id'));
  if (!id) return fail('Marker ID is required for Delete Marker issues.');

  const confirm =
    parsed.confirmation?.checked ||
    parsed.confirm_delete?.checked ||
    /understand/i.test(cleanOptional(getField(parsed, 'confirmation')) || '');

  if (!confirm) {
    return fail('Delete confirmation checkbox must be checked.');
  }

  const initialCount = geojson.features.length;
  geojson.features = geojson.features.filter((feature) => feature?.properties?.id !== id);
  if (geojson.features.length === initialCount) {
    return fail(`Marker with id "${id}" was not found.`);
  }

  stableSortFeatures(geojson.features);
  return success(`Deleted marker "${id}".`);
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error('GITHUB_EVENT_PATH is required and must point to a valid event payload file.');
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const issue = event.issue;
  if (!issue) {
    throw new Error('This script must run on an issues event payload.');
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const geojson = JSON.parse(raw);

  const mutation = applyMutation(issue, geojson);
  if (!mutation.ok) {
    fs.writeFileSync(RESULT_FILE, JSON.stringify(mutation, null, 2));
    process.stdout.write(`${JSON.stringify(mutation)}\n`);
    process.exit(1);
  }

  const validationErrors = validateGeoJSON(geojson);
  if (validationErrors.length) {
    const joined = validationErrors.join(' | ');
    const errorResult = fail(`GeoJSON validation failed after mutation: ${joined}`);
    fs.writeFileSync(RESULT_FILE, JSON.stringify(errorResult, null, 2));
    process.stdout.write(`${JSON.stringify(errorResult)}\n`);
    process.exit(1);
  }

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(geojson, null, 2)}\n`);
  fs.writeFileSync(RESULT_FILE, JSON.stringify(mutation, null, 2));
  process.stdout.write(`${JSON.stringify(mutation)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const result = fail(error.message || 'Unknown error');
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(1);
  }
}
