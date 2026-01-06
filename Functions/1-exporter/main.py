import os
import json
from dotenv import load_dotenv
from tqdm import tqdm
import UnityPy
import traceback
from datetime import datetime

# For debugging/development purposes
EXPORT_MAIN = True
EXPORT_STRINGS = True
EXPORT_DIALOGUES = True
EXPORT_TEXTURES = True

log_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Logs', '1-exporter.log')
os.makedirs(os.path.dirname(log_path), exist_ok=True)
open(log_path, 'w').close()

def log(message):
    from datetime import datetime
    with open(log_path, 'a', encoding='utf-8') as log_file:
        timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S]')
        log_file.write(f"{timestamp} {message}\n")

def tqdm_wrap(iterable, desc):
    bar_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
    if os.name == 'nt':  # Windows
        return tqdm(iterable=iterable, desc=desc, bar_format=bar_format, ascii=False)
    else:
        return tqdm(iterable=iterable, desc=desc, bar_format=bar_format)

log("==== FUNCTION STARTED ====")

load_dotenv('../../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')

# Suppress UnityVersionFallbackWarning since we're explicitly setting the fallback version
import warnings
warnings.filterwarnings("ignore", category=UnityPy.config.UnityVersionFallbackWarning)

log(f"Environment loaded - Unity Version: {os.getenv('GAME_UNITY_VERSION')}")

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if os.path.isabs(path):
        return path
    return os.path.join('../', '../', path)

data_dir = get_path('GAME_DATA_DIR')
res_dir = get_path('RES_DIR')
textures_dir = get_path('TEXTURES_DIR')

log(f"Paths configured - Data: {data_dir}, Resources: {res_dir}, Textures: {textures_dir}")

strings_num = 0
textures_num = 0
dialogues_num = 0

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False
    log("Using Python parser for TypeTree")

textures_list_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Data/textures.list')
log(f"Reading textures list from: {textures_list_path}")
with open(textures_list_path, 'r', encoding='utf-8') as f:
    textures = [line.strip() for line in f.readlines()]
    log(f"Loaded {len(textures)} textures from list")

streaming_assets_path = os.path.join('StreamingAssets', 'aa', 'StandaloneWindows64')
bundle_dir = os.path.join(data_dir, streaming_assets_path)
dialogue_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_other_' in f]
texture_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_texture_' in f]
scene_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_scenes_' in f]

log(f"Found {len(dialogue_bundles)} dialogue bundles, {len(texture_bundles)} texture bundles, {len(scene_bundles)} scene bundles")

typetree_path = os.path.join(os.path.dirname(__file__), os.path.join('../', '../', 'Data/I2.loc.typetree.json'))
log(f"Reading typetree from: {typetree_path}")
with open(typetree_path, 'r', encoding='utf-8') as f:
    I2LocTypetree = json.load(f)
    log("Loaded I2.loc.typetree.json")

if EXPORT_MAIN:
    print('Exporting I2Languages: ',end='')
    file_path = os.path.join(data_dir, 'resources.assets')
    log(f"Reading: {file_path}")
    try:
        env = UnityPy.load(file_path)
        found = False
        for obj in env.objects:
            if obj.type.name == 'MonoBehaviour':
                try:
                    data = obj.read(check_read=False)
                    if getattr(data, 'm_Name') == "I2Languages":
                        found = True
                except:
                    continue
                if found:
                    typetree = obj.read_typetree(I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                    json_data = json.dumps(typetree, indent=2, ensure_ascii=False)
                    os.makedirs(res_dir, exist_ok=True)
                    i2_output_path = os.path.join(res_dir, "I2Languages.json")
                    log(f"Writing: {i2_output_path}")
                    with open(i2_output_path, 'w', encoding='utf-8') as f:
                        f.write(json_data)
                    print('1/1')
                    log("Successfully exported I2Languages")
                    break

        if not found:
            print('failed')
            log("ERROR: I2Languages not found in resources.assets")
            exit(1)
    except Exception as e:
        log(f"ERROR processing I2Languages: {str(e)}")
        log(traceback.format_exc())
        print('failed')
        exit(1)

if EXPORT_STRINGS:
    strings = {}
    for bundle_name in tqdm_wrap(iterable=scene_bundles, desc='Exporting strings:'):
        file_path = os.path.join(bundle_dir, bundle_name)
        log(f"Reading: {file_path}")
        
        try:
            env = UnityPy.load(file_path)
            bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

            for obj in env.objects:
                if obj.type.name == 'MonoBehaviour':
                    if obj.serialized_type.node:
                        try:
                            data = obj.read()
                            tree = obj.read_typetree()
                            if 'm_Script' in tree:
                                try:
                                    script = data.m_Script.read()
                                    if script.m_ClassName == 'TextMeshPro' and 'm_text' in tree:
                                        strings[tree['m_text'].replace('\t', '\\t').replace('\n', '\\n')] = ""
                                except:
                                    continue
                        except Exception as inner_e:
                            log(f"Error processing object in {bundle_name}: {str(inner_e)}")
                            continue
        except Exception as e:
            log(f"ERROR processing bundle {bundle_name}: {str(e)}")
            log(traceback.format_exc())

    strings = dict(sorted(strings.items()))
    strings_num = len(strings)
    strings_output_path = os.path.join(res_dir, "strings.json")
    log(f"Writing {strings_num} strings to: {strings_output_path}")
    with open(strings_output_path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(strings, indent=2, ensure_ascii=False))

if EXPORT_DIALOGUES:
    for bundle_name in tqdm_wrap(iterable=dialogue_bundles, desc='Exporting dialogues:'):
        file_path = os.path.join(bundle_dir, bundle_name)
        log(f"Reading: {file_path}")
        try:
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
                            continue

                        typetree = data.object_reader.read_typetree()
                        json_data = json.dumps(typetree, indent=2, ensure_ascii=False)

                        # build destination path
                        name = getattr(data, 'm_Name', 'MonoBehaviour')
                        asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                        filename = os.path.basename(asset_path) + ".json"

                        os.makedirs(asset_dir, exist_ok=True)
                        output_path = os.path.join(asset_dir, filename)
                        log(f"Writing dialogue: {output_path}")

                        with open(output_path, 'w', encoding='utf-8') as f:
                            f.write(json_data)
                        
                        dialogues_num += 1
        except Exception as e:
            log(f"ERROR processing dialogue bundle {bundle_name}: {str(e)}")
            log(traceback.format_exc())

if EXPORT_TEXTURES:
    exported_textures = set()
    for bundle_name in tqdm_wrap(iterable=texture_bundles, desc='Exporting textures:'):
        file_path = os.path.join(bundle_dir, bundle_name)
        log(f"Reading: {file_path}")
        try:
            env = UnityPy.load(file_path)
            bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

            for asset_path, obj in env.container.items():
                if asset_path in textures:
                    if obj.type.name in ['Texture2D','Sprite']:
                        data = obj.read()
                        if obj.type.name == 'Sprite':
                            # Get the original texture associated with this Sprite
                            data = data.m_RD.texture.read()
                        os.makedirs(textures_dir, exist_ok=True)
                        texture_save_name = asset_path if asset_path.endswith('.png') else asset_path + '.png'
                        path = os.path.join(textures_dir, os.path.basename(texture_save_name))
                        log(f"Writing texture: {path}")
                        data.image.save(path)
                        textures_num += 1
                        exported_textures.add(asset_path)
        except Exception as e:
            log(f"ERROR processing texture bundle {bundle_name}: {str(e)}")
            log(traceback.format_exc())
    missing_textures = sorted(list(set(textures) - exported_textures))
    log(f"Textures not exported: {', '.join(missing_textures)}")
else:
    missing_textures = []

summary = f"""
[SUMMARY]
Exported I2Languages: 1/1
Exported strings: {strings_num}
Exported textures: {textures_num}/{len(textures)}
Exported dialogue databases: {dialogues_num}
"""
print()
print(summary.strip())
log(summary)