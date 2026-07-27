"""Unpack ALL game textures from StreamingAssets bundles into tmp-textures/,
preserving internal asset paths (e.g. tmp-textures/Assets/SunsetVisitor/.../Foo.png).

Uses the 1-exporter venv (UnityPy). Run from the repo root:
    Functions/1-exporter/.venv/bin/python Misc/unpack-textures.py
"""

import os
import shutil
import sys
import warnings
import traceback
from dotenv import load_dotenv
from tqdm import tqdm
import UnityPy

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'all-textures')
DATA_DIR = os.getenv('GAME_DATA_DIR', '1000xRESIST_Data')
if not os.path.isabs(DATA_DIR):
    DATA_DIR = os.path.join(os.path.dirname(__file__), '..', DATA_DIR)

BUNDLE_DIR = os.path.join(DATA_DIR, 'StreamingAssets', 'aa', 'StandaloneWindows64')

FALLBACK_VERSION = os.getenv('GAME_UNITY_VERSION', '6000.1.10f1')
warnings.filterwarnings('ignore', category=UnityPy.config.UnityVersionFallbackWarning)
UnityPy.config.FALLBACK_UNITY_VERSION = FALLBACK_VERSION

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False

if os.path.isdir(OUT_DIR):
    shutil.rmtree(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

bundles = [f for f in os.listdir(BUNDLE_DIR) if f.endswith('.bundle')]
bundles.sort()

textures_num = 0
seen_paths = set()  # dedupe by output path (same texture can be in multiple bundles)


def save_image(img, asset_path):
    global textures_num
    save_name = asset_path if asset_path.endswith('.png') else asset_path + '.png'
    out_path = os.path.join(OUT_DIR, save_name)
    if out_path in seen_paths:
        return
    seen_paths.add(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path)
    textures_num += 1


for bundle_name in tqdm(bundles, desc='Unpacking textures'):
    file_path = os.path.join(BUNDLE_DIR, bundle_name)
    try:
        env = UnityPy.load(file_path)
        # map path_id -> container asset path
        pathid_to_asset = {obj.path_id: asset_path for asset_path, obj in env.container.items()}

        for obj in env.objects:
            if obj.type.name != 'Texture2D':
                continue
            asset_path = pathid_to_asset.get(obj.path_id)
            try:
                data = obj.read()
            except Exception as e:
                print(f'\nWarning: failed to read Texture2D in {bundle_name}: {e}')
                continue
            if not asset_path:
                # fallback: derive a path from the texture name
                name = getattr(data, 'm_Name', None) or f'texture_{obj.path_id}'
                asset_path = os.path.join('_unnamed', bundle_name, name)
            try:
                save_image(data.image, asset_path)
            except Exception:
                pass  # undecodable texture format, skip
    except Exception as e:
        print(f'\nERROR processing bundle {bundle_name}: {e}')
        traceback.print_exc()

print(f'\nDone. Exported {textures_num} textures to {os.path.abspath(OUT_DIR)}')
