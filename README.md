# GitHub-Native Mapping App

This repository is a complete mapping app that uses only GitHub-native components:

- **GitHub Pages** serves the map UI from `/docs`
- **GitHub Issue Forms** provide add/update/delete marker workflows
- **GitHub Actions** parse form submissions and mutate `docs/data/markers.geojson`

## Repository structure

- `docs/` – static site for GitHub Pages
  - `index.html` – map page shell
  - `app.js` – Leaflet map, filters, data loading
  - `styles.css` – layout and UI styling
  - `data/edcs.txt` – tab-separated source input for marker rows (header row required)
  - `data/markers.geojson` – generated marker dataset consumed by the map
- `.github/ISSUE_TEMPLATE/` – issue forms for marker CRUD
- `.github/workflows/markers-from-issues.yml` – automation workflow
- `tools/` – local helpers for issue parsing and GeoJSON validation

## Quick start

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Set source to **Deploy from a branch**.
4. Select branch **main** and folder **/docs**.
5. Save. Your site URL will be:
   - `https://<user>.github.io/<repo>/`

> The app uses only **relative paths** (`./app.js`, `./data/markers.geojson`), so it works under GitHub Pages repo subpaths.

## How marker management works

Use the **Issues** tab and select one of these forms:

- **Add Marker** (`marker-add` label)
- **Update Marker** (`marker-update` label)
- **Delete Marker** (`marker-delete` label)

The workflow listens to issue events (`opened`, `edited`, `labeled`) and applies changes to `docs/data/markers.geojson`.

### Data model

GeoJSON `FeatureCollection` where each feature is a `Point`:

- `properties.id` (string, unique)
- `properties.title` (string, required)
- `properties.description` (string, optional)
- `properties.link` (string URL, optional)
- `properties.category` (string, optional)
- `properties.icon` (`default` or URL, optional)
- `properties.updated_at` (ISO datetime, automation managed)
- optional `properties.focus_on_load` (boolean, from Update Marker checkbox)

Coordinates are `[lng, lat]`.

## Workflow modes: Mode A vs Mode B

Configured via workflow env var in `.github/workflows/markers-from-issues.yml`:

```yaml
env:
  MARKER_APPLY_MODE: direct
```

### Mode A (default): `direct`

- Commits marker data changes directly to `main`
- Simplest setup
- Requires `contents: write`

### Mode B: `pr`

- Creates a branch + pull request (`peter-evans/create-pull-request`)
- Safer review flow
- Requires `contents: write` and `pull-requests: write`

To switch to PR mode:

```yaml
env:
  MARKER_APPLY_MODE: pr
```

## Labels and issue outcomes

- **Success**
  - adds label: `marker-applied`
  - comments with summary
  - closes the issue
- **Failure**
  - adds label: `marker-error`
  - comments with failure reason
  - leaves the issue open

## Local helper scripts

- Validate GeoJSON schema/ranges:

```bash
node tools/validate_geojson.js docs/data/markers.geojson
```

- Build markers from `docs/data/edcs.txt` (first row is field names):

```bash
node tools/build_markers_from_edcs.js
```

- Parse a sample issue body payload:

```bash
node tools/issue_parser.js "### Title\nMy Marker\n### Latitude\n37.1"
```

## Troubleshooting

### Pages shows 404

- Confirm Pages source is branch `main` and folder `/docs`
- Ensure `docs/index.html` exists on default branch
- Wait 1–2 minutes after saving Pages settings

### Assets fail under repo subpath

- Ensure all app-local links use relative paths (`./styles.css`, `./app.js`, `./data/markers.geojson`)
- Avoid root-absolute paths like `/app.js`

### Workflow permission errors (`GITHUB_TOKEN`)

- Confirm workflow has:
  - `contents: write`
  - `issues: write`
  - `pull-requests: write` (for PR mode)
- In repo settings, ensure Actions has read/write permission if required by org policy

### Malformed GeoJSON

- Run `node tools/validate_geojson.js docs/data/markers.geojson`
- Fix duplicate IDs, invalid coordinates, or missing required fields

### Duplicate marker IDs

- Add flow rejects duplicate IDs and labels issue `marker-error`
- Leave Add Marker ID blank to auto-generate an ID

## Security notes

- Issue content is treated as untrusted input.
- Automation never evaluates issue text as code.
- Only issues with expected marker labels are processed.
- Workflow runs on `issues` events (not pull_request), minimizing fork-PR permission risk.

## OpenStreetMap tiles

The map uses `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` for low-traffic use. If your project grows, move to a tile provider/service aligned with OSM tile usage policy.
