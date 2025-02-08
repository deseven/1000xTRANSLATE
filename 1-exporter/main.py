import os
import json
import UnityPy
from dotenv import load_dotenv
#from UnityPy.helpers import TypeTreeHelper
#TypeTreeHelper.read_typetree_boost = False

load_dotenv('../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')
data_dir = '../' + os.getenv('GAME_DATA_DIR')
res_dir = '../' + os.getenv('RES_DIR')

with open('../data/bundles.list', 'r') as f:
    bundles = [line.strip() for line in f.readlines()]

with open('../data/I2.Loc.typetree.json', 'r') as f:
    I2LocTypetree = json.load(f)

file_path = data_dir + '/resources.assets'
print(f"Processing {file_path}")
env = UnityPy.load(file_path)

for obj in env.objects:
    if obj.type.name == 'MonoBehaviour':
        try:
            data = obj.read(check_read=False)
            if getattr(data, 'm_Name') == "I2Languages":
                print('Exporting I2Languages')
                typetree = obj.read_typetree(I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                json_data = json.dumps(typetree, indent=4, ensure_ascii=False)
                os.makedirs(res_dir, exist_ok=True)
                with open(res_dir + "/I2Languages.json", 'w', encoding='utf-8') as f:
                    f.write(json_data)
                break
        except:
            continue

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
                print(f"Exporting {name}")
                asset_subdir = os.path.join(
                    bundle_dest, *asset_path.split('/'))
                filename = f"{obj.path_id}.json"

                os.makedirs(asset_subdir, exist_ok=True)
                output_path = os.path.join(asset_subdir, filename)

                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(json_data)
