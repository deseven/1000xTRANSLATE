import os
import json
import UnityPy
from dotenv import load_dotenv

load_dotenv('../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')
data_dir = '../' + os.getenv('GAME_DATA_DIR')
res_dir = '../' + os.getenv('RES_DIR')
out_dir = '../' + os.getenv('OUT_DIR') + '/1000xRESIST_Data'

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False

with open('../data/bundles.list', 'r') as f:
    bundles = [line.strip() for line in f.readlines()]

with open('../data/I2.loc.typetree.json', 'r') as f:
    I2LocTypetree = json.load(f)

with open(res_dir + '/I2Languages.json', 'r') as f: # previously exported with read_typetree() + json.dumps()
    I2Languages = json.load(f)

file_path = data_dir + '/resources.assets'
print(f"Processing {file_path}")
env = UnityPy.load(file_path)
found = False

for obj in env.objects:
    if obj.type.name == 'MonoBehaviour':
        try:
            data = obj.read(check_read=False)
            if getattr(data, 'm_Name') == "I2Languages":
                print('Importing I2Languages')
                found = True
        except:
            continue
        if found:
            obj.save_typetree(I2Languages,I2LocTypetree['I2.Loc.LanguageSourceAsset'])
            os.makedirs(out_dir, exist_ok=True)
            with open(out_dir + '/resources.assets', "wb") as f:
                f.write(env.file.save(packer="original"))
            break

for bundle_name in bundles:
    file_path = data_dir + bundle_name
    print(f"Processing {file_path}")
    env = UnityPy.load(file_path)
    bundle_dest = res_dir + "/" + os.path.basename(bundle_name)

    for asset_path, obj in env.container.items():
        if obj.type.name == 'MonoBehaviour':
            data = obj.read()
            script = data.m_Script.read()

            if script.m_ClassName == 'DialogueDatabase':
                # check for typetree availability
                if not data.object_reader.serialized_type.nodes:
                    print(f"[WARN] Skipping {asset_path} - No typetree found")
                    continue

                typetree = data.object_reader.read_typetree()
                json_data = json.dumps(typetree, indent=4, ensure_ascii=False)

                # build destination path
                name = getattr(data, 'm_Name', 'MonoBehaviour')
                print(f"Importing {name}")
                asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                filename = os.path.basename(asset_path) + ".json"
                typetree_path = os.path.join(asset_dir, filename)

                with open(typetree_path, 'r', encoding='utf-8') as f:
                    typetree = json.load(f)
                
                if typetree:
                    objd = obj.deref()
                    objd.save_typetree(typetree)
                    os.makedirs(out_dir + os.path.dirname(bundle_name), exist_ok=True)
                    with open(out_dir + bundle_name, "wb") as f:
                        f.write(env.file.save(packer="original"))
