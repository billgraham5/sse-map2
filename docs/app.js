const statusMessage = document.getElementById('status-message');
const categoryFilters = document.getElementById('category-filters');
const searchInput = document.getElementById('search-input');

const map = L.map('map', {
  worldCopyJump: true,
});


L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

let markerLayer = L.layerGroup().addTo(map);
let allFeatures = [];

function setStatus(message) {
  statusMessage.textContent = message;
}

function normalizeText(value) {
  return (value || '').toString().trim();
}

function safeHtml(text) {
  return normalizeText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markerPopup(feature) {
  const props = feature.properties || {};
  const link = normalizeText(props.link);
  const location = normalizeText(props.Location || props.description);

  return `
    <article>
      <h3>${safeHtml(props.title || 'Untitled marker')}</h3>
      <p><strong>Location:</strong> ${safeHtml(location || 'Not provided.')}</p>
      <p><strong>Category:</strong> ${safeHtml(props.category || 'Uncategorized')}</p>
      <p><strong>Link:</strong> ${
        link
          ? `<a href="${safeHtml(link)}" target="_blank" rel="noopener noreferrer">${safeHtml(link)}</a>`
          : 'None'
      }</p>
    </article>
  `;
}

function collectCategories(features) {
  const values = new Set();
  for (const feature of features) {
    const raw = normalizeText(feature?.properties?.category);
    values.add(raw || 'Uncategorized');
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function buildCategoryControls(categories) {
  categoryFilters.innerHTML = '';

  if (!categories.length) {
    categoryFilters.innerHTML = '<p class="hint">No categories available.</p>';
    return;
  }

  for (const category of categories) {
    const id = `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `<input type="checkbox" id="${id}" value="${category}" checked /> ${safeHtml(
      category
    )}`;
    categoryFilters.appendChild(label);
  }

  categoryFilters.addEventListener('change', renderMarkers);
}

function getActiveCategories() {
  const selected = new Set();
  const checked = categoryFilters.querySelectorAll('input[type="checkbox"]:checked');
  for (const box of checked) {
    selected.add(box.value);
  }
  return selected;
}

function filterFeatures() {
  const activeCategories = getActiveCategories();
  const query = normalizeText(searchInput.value).toLowerCase();

  return allFeatures.filter((feature) => {
    const props = feature.properties || {};
    const category = normalizeText(props.category) || 'Uncategorized';

    const inCategory = activeCategories.size === 0 ? true : activeCategories.has(category);
    if (!inCategory) return false;

    if (!query) return true;

    const haystack = `${normalizeText(props.title)} ${normalizeText(props.description)}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderMarkers() {
  markerLayer.clearLayers();

  const filtered = filterFeatures();

  if (!filtered.length) {
    setStatus('No markers match your current filters.');
    return;
  }

  const bounds = [];
  for (const feature of filtered) {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;

    const [lng, lat] = coordinates;
    const marker = L.marker([lat, lng]);
    marker.bindPopup(markerPopup(feature));
    marker.addTo(markerLayer);
    bounds.push([lat, lng]);
  }

  if (!bounds.length) {
    setStatus('Marker data exists, but no valid coordinates were found.');
    return;
  }

  map.fitBounds(bounds, { padding: [30, 30] });
  setStatus(`Showing ${bounds.length} marker${bounds.length === 1 ? '' : 's'}.`);
}

async function loadMarkers() {
  try {
    const response = await fetch('./data/markers.geojson', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Expected a GeoJSON FeatureCollection with a features array.');
    }

    allFeatures = data.features.filter((feature) => feature?.geometry?.type === 'Point');

    if (!allFeatures.length) {
      setStatus('No markers yet. Use the GitHub “Add Marker” issue form to create one.');
      categoryFilters.innerHTML = '<p class="hint">No categories available.</p>';
      map.setView([20, 0], 2);
      return;
    }

    const categories = collectCategories(allFeatures);
    buildCategoryControls(categories);
    renderMarkers();
  } catch (error) {
    console.error(error);
    setStatus('Could not load marker data. Please try again later.');
    categoryFilters.innerHTML =
      '<p class="hint">Category filters are unavailable because marker data failed to load.</p>';
    map.setView([20, 0], 2);
  }
}

searchInput.addEventListener('input', renderMarkers);
loadMarkers();
