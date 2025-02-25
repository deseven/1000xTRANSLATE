import os
import json
import UnityPy
from dotenv import load_dotenv

load_dotenv('../../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if os.path.isabs(path):
        return path
    return os.path.join('../', '../', path)

data_dir = get_path('GAME_DATA_DIR')
res_dir = get_path('RES_DIR')
textures_dir = get_path('TEXTURES_DIR')

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False

with open(os.path.join(os.path.dirname(__file__), '../', '../', 'Data/textures.list'), 'r', encoding='utf-8') as f:
    textures = [line.strip() for line in f.readlines()]

streaming_assets_path = os.path.join('StreamingAssets', 'aa', 'StandaloneWindows64')
bundle_dir = os.path.join(data_dir, streaming_assets_path)
dialogue_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_other_' in f]
texture_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_texture_' in f]

with open(os.path.join(os.path.dirname(__file__), os.path.join('../', '../', 'Data/I2.loc.typetree.json')), 'r', encoding='utf-8') as f:
    I2LocTypetree = json.load(f)

file_path = os.path.join(data_dir, 'resources.assets')
print(f"Processing {file_path}")
env = UnityPy.load(file_path)
found = False

for obj in env.objects:
    if obj.type.name == 'MonoBehaviour':
        try:
            data = obj.read(check_read=False)
            if getattr(data, 'm_Name') == "I2Languages":
                print('Exporting I2Languages')
                found = True
        except:
            continue
        if found:
            typetree = obj.read_typetree(I2LocTypetree['I2.Loc.LanguageSourceAsset'])
            json_data = json.dumps(typetree, indent=4, ensure_ascii=False)
            os.makedirs(res_dir, exist_ok=True)
            with open(os.path.join(res_dir, "I2Languages.json"), 'w', encoding='utf-8') as f:
                f.write(json_data)
            break

for bundle_name in texture_bundles:
    file_path = os.path.join(bundle_dir, bundle_name)
    print(f"Processing {file_path}")
    env = UnityPy.load(file_path)
    bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

    for asset_path, obj in env.container.items():
        if obj.type.name in ['Texture2D']: # add Sprite here when there will be UnityPy support
            if asset_path in textures:
                os.makedirs(textures_dir, exist_ok=True)
                data = obj.read()
                if not asset_path.endswith('.png'):
                    asset_path += '.png'
                path = os.path.join(textures_dir, os.path.basename(asset_path))
                data.image.save(path)

for bundle_name in dialogue_bundles:
    file_path = os.path.join(bundle_dir, bundle_name)
    print(f"Processing {file_path}")
    env = UnityPy.load(file_path)
    bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

    for asset_path, obj in env.container.items():
        if 'DialogueDatabaseArchive' in asset_path: # skip archived convos
            continue
        if obj.type.name == 'MonoBehaviour':
            try:
                data = obj.read()
                script = data.m_Script.read()
            except:
                continue

            if script.m_ClassName == 'DialogueDatabase':
                # check for typetree availability
                if not data.object_reader.serialized_type.nodes:
                    print(f"[WARN] Skipping {asset_path} - No typetree found")
                    continue

                typetree = data.object_reader.read_typetree()
                json_data = json.dumps(typetree, indent=4, ensure_ascii=False)

                # build destination path
                name = getattr(data, 'm_Name', 'MonoBehaviour')
                print(f"Exporting {name}")
                asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                filename = os.path.basename(asset_path) + ".json"

                os.makedirs(asset_dir, exist_ok=True)
                output_path = os.path.join(asset_dir, filename)

                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(json_data)
