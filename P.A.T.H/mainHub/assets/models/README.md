# Balloon GLB Models

Drop custom hot-air-balloon `.glb` files in this folder.

Load order (first existing file wins):
1. `window.PATH_BALLOON_GLB_URL` (if set)
2. `./assets/models/{skinId}.glb`
3. `./assets/models/default.glb`
4. `./assets/models/balloon.glb`

If no file loads, the app automatically falls back to the built-in hardcoded balloon model.

## Example

- For all skins: add `balloon.glb`
- For a specific skin: add `default.glb`, `magma.glb`, etc.
