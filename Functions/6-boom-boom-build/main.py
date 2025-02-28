import os
import json
import UnityPy
from PIL import Image
from dotenv import load_dotenv
from tqdm import tqdm

tqdm_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
load_dotenv('../../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')
UnityPy.config.FALLBACK_VERSION_WARNED = True

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if path is None:
        return ''
    if os.path.isabs(path):
        return path
    return os.path.join('../', '../', path)

data_dir = get_path('GAME_DATA_DIR')
res_dir = get_path('RES_DIR')
overrides_dir = get_path('OVERRIDES_DIR')
out_dir = os.path.join(get_path('OUT_DIR'), '1000xRESIST_Data')

strings_num = 0
textures_num = 0
dialogues_num = 0
bundles_num = 0

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False

streaming_assets_path = os.path.join('StreamingAssets', 'aa', 'StandaloneWindows64')
bundle_dir = os.path.join(data_dir, streaming_assets_path)
dialogue_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_other_' in f]
texture_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_texture_' in f]
scene_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_scenes_' in f]

with open(os.path.join('../','../', 'Data', 'I2.loc.typetree.json'), 'r', encoding='utf-8') as f:
    I2LocTypetree = json.load(f)

with open(os.path.join(res_dir, 'I2Languages.json'), 'r', encoding='utf-8') as f:
    I2Languages = json.load(f)

with open(os.path.join(res_dir, 'strings.json'), 'r', encoding='utf-8') as f:
    strings = json.load(f)

with open(os.path.join(os.path.dirname(__file__), '../', '../', 'Data/textures.list'), 'r', encoding='utf-8') as f:
    textures = [line.strip() for line in f.readlines()]

print('Importing I2Languages: ',end='')
file_path = os.path.join(data_dir, 'resources.assets')
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
            obj.save_typetree(I2Languages,I2LocTypetree['I2.Loc.LanguageSourceAsset'])
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, 'resources.assets'), "wb") as f:
                f.write(env.file.save(packer="original"))
            print('1/1')
            break

if not found:
    print('failed')
    exit(1)

for bundle_name in tqdm(iterable=scene_bundles, desc='Importing strings:', bar_format=tqdm_format):
    needs_saving = False
    file_path = os.path.join(bundle_dir, bundle_name)
    env = UnityPy.load(file_path)
    bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

    for obj in env.objects:
        if obj.type.name == 'MonoBehaviour':
            if obj.serialized_type.node:
                data = obj.read()
                tree = obj.read_typetree()
                if 'm_Script' in tree:
                    try:
                        script = data.m_Script.read()
                    except:
                        continue
                    if script.m_ClassName == 'TextMeshPro' and 'm_text' in tree:
                        strings_key = tree['m_text'].replace('\t', '\\t').replace('\n', '\\n')
                        if strings_key in strings and strings[strings_key] != "":
                            tree['m_text'] = strings[strings_key].replace('\\t', '\t').replace('\\n', '\n')
                            obj.save_typetree(tree)
                            needs_saving = True
                            strings_num += 1
    
    if needs_saving:
        os.makedirs(os.path.join(out_dir, streaming_assets_path, os.path.dirname(bundle_name)), exist_ok=True)
        with open(os.path.join(out_dir, streaming_assets_path, bundle_name), "wb") as f:
            f.write(env.file.save(packer="original"))
        bundles_num += 1
                            

if overrides_dir:
    for bundle_name in tqdm(iterable=texture_bundles, desc='Importing textures:', bar_format=tqdm_format):
        needs_saving = False
        file_path = os.path.join(bundle_dir, bundle_name)
        env = UnityPy.load(file_path)
        bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))

        for asset_path, obj in env.container.items():
            if obj.type.name in ['Texture2D','Sprite']:
                if asset_path in textures:
                    data = obj.read()
                    if not asset_path.endswith('.png'):
                        asset_path += '.png'
                    override = os.path.join(overrides_dir, os.path.basename(asset_path))
                    if os.path.exists(override) and obj.type.name == 'Texture2D': # sprite importing is not available rn
                        img = Image.open(override)
                        data.image = img
                        data.save()
                        needs_saving = True
                        textures_num += 1

        if needs_saving:
            os.makedirs(os.path.join(out_dir, streaming_assets_path, os.path.dirname(bundle_name)), exist_ok=True)
            with open(os.path.join(out_dir, streaming_assets_path, bundle_name), "wb") as f:
                f.write(env.file.save(packer="original"))
            bundles_num += 1

for bundle_name in tqdm(iterable=dialogue_bundles, desc='Importing dialogues:', bar_format=tqdm_format):
    needs_saving = False
    file_path = os.path.join(bundle_dir, bundle_name)
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
                json_data = json.dumps(typetree, indent=4, ensure_ascii=False)

                # build destination path
                name = getattr(data, 'm_Name', 'MonoBehaviour')
                asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                filename = os.path.basename(asset_path) + ".json"
                typetree_path = os.path.join(asset_dir, filename)

                with open(typetree_path, 'r', encoding='utf-8') as f:
                    typetree = json.load(f)
                
                if typetree:
                    objd = obj.deref()
                    objd.save_typetree(typetree)
                    needs_saving = True
                    dialogues_num += 1

    if needs_saving:
        os.makedirs(os.path.join(out_dir, streaming_assets_path, os.path.dirname(bundle_name)), exist_ok=True)
        with open(os.path.join(out_dir, streaming_assets_path, bundle_name), "wb") as f:
            f.write(env.file.save(packer="original"))
        bundles_num += 1

print()
print('[SUMMARY]')
print('Imported I2Languages: 1')
print('Imported strings:', strings_num)
print('Imported textures:', textures_num)
print('Imported dialogue databases:', dialogues_num)
print('Bundles created:', bundles_num)