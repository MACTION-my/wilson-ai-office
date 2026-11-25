# 3D people from art (free route)

1. Put a full-body, A-pose image on a plain background in `art-src/body/<id>.png` and a 640px copy as `<id>_s.png`.
2. `python scripts/people-3d/1-shape.py <id>[,<id>…]` — shape from the free Hunyuan3D-2 Space (uses `secrets/hf.token` when present) → `art-src/models/<id>_shape.glb`.
3. `python scripts/people-3d/2-texture.py <id>[,<id>…]` — ~18k triangles, front/back texture from the image, rig landmarks → `public/models/<id>.glb` + `.json`.
4. Add the id to `MODEL_IDS` in `public/office3d.js` and bump `MODEL_V`. The page rigs the model itself.

Needs: `pip install gradio_client trimesh pillow numpy`.
