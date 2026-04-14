import gc
import os
import json
import shutil
import traceback
import UnityPy
from PIL import Image


class ResourcePatcher:
    """
    Handles all resource patching for 1000xRESIST.
    Can be used standalone or bundled into a patcher executable.

    Progress is reported via optional callbacks:
      - on_progress(stage, current, total)  called for each item processed
      - log_fn(message)                     called for log output
    """

    STREAMING_ASSETS_PATH = os.path.join('StreamingAssets', 'aa', 'StandaloneWindows64')

    def __init__(self, game_data_dir, res_dir, out_dir, overrides_dir=None,
                 unity_version=None, skip_textures=False, use_python_parser=False,
                 typetree_path=None, textures_list_path=None,
                 log_fn=None, on_progress=None, clean_output=True):
        """
        :param game_data_dir:      Path to 1000xRESIST_Data directory.
        :param res_dir:            Path to resources directory (I2Languages-mod.json,
                                   strings-mod.json, dialogue mods).
        :param out_dir:            Output directory root (patched files go under
                                   out_dir/1000xRESIST_Data/...).
        :param overrides_dir:      Optional path to texture overrides directory.
        :param unity_version:      Unity version string for UnityPy fallback.
        :param skip_textures:      If True, texture import is skipped.
        :param use_python_parser:  If True, use UnityPy Python parser instead of C++ boost.
        :param typetree_path:      Path to I2.loc.typetree.json.
        :param textures_list_path: Path to textures.list file.
        :param log_fn:             Optional callable(message: str) for logging.
        :param on_progress:        Optional callable(stage: str, current: int, total: int).
        :param clean_output:       If True, remove out_dir/1000xRESIST_Data before patching.
                                   Set to False when patching in-place into the game directory.
        """
        self.game_data_dir = game_data_dir
        self.res_dir = res_dir
        self.out_dir = os.path.join(out_dir, '1000xRESIST_Data')
        self.clean_output = clean_output
        self.overrides_dir = overrides_dir
        self.skip_textures = skip_textures
        self.log = log_fn if log_fn else lambda msg: None
        self.on_progress = on_progress if on_progress else lambda stage, cur, tot: None

        # Configure UnityPy
        if unity_version:
            UnityPy.config.FALLBACK_UNITY_VERSION = unity_version

        import warnings
        warnings.filterwarnings("ignore", category=UnityPy.config.UnityVersionFallbackWarning)

        if use_python_parser:
            from UnityPy.helpers import TypeTreeHelper
            TypeTreeHelper.read_typetree_boost = False
            self.log("Using Python parser for TypeTree")

        # Resolve bundle directory
        self.bundle_dir = os.path.join(game_data_dir, self.STREAMING_ASSETS_PATH)

        # Discover bundles
        all_bundles = os.listdir(self.bundle_dir)
        self.dialogue_bundles = [f for f in all_bundles if f.endswith('.bundle') and '_other_' in f]
        self.texture_bundles  = [f for f in all_bundles if f.endswith('.bundle') and '_texture_' in f]
        self.scene_bundles    = [f for f in all_bundles if f.endswith('.bundle') and '_scenes_' in f]
        self.log(f"Found bundles: {len(self.dialogue_bundles)} dialogue, "
                 f"{len(self.texture_bundles)} texture, {len(self.scene_bundles)} scene")

        # Load typetree
        if typetree_path is None:
            raise ValueError("typetree_path must be provided")
        self.log(f"Reading typetree: {typetree_path}")
        with open(typetree_path, 'r', encoding='utf-8') as f:
            self._I2LocTypetree = json.load(f)

        # Load textures list
        if textures_list_path is None:
            raise ValueError("textures_list_path must be provided")
        self.log(f"Reading textures list: {textures_list_path}")
        with open(textures_list_path, 'r', encoding='utf-8') as f:
            self.textures = [line.strip() for line in f.readlines()]

        # Counters
        self.strings_num   = 0
        self.textures_num  = 0
        self.dialogues_num = 0
        self.bundles_num   = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self):
        """Run the full patching pipeline. Returns a summary dict."""
        self._validate_resources()
        self._load_resources()
        if self.clean_output:
            self._clean_output()
        self._import_i2languages()
        self._import_strings()
        self._import_dialogues()
        self._import_textures()
        return self._summary()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_resources(self):
        i2languages_path = os.path.join(self.res_dir, 'I2Languages-mod.json')
        if not os.path.exists(i2languages_path) or os.path.getsize(i2languages_path) == 0:
            msg = "Error: I2Languages-mod.json is missing or empty. Run Desheetifier first?"
            self.log(msg)
            raise FileNotFoundError(msg)

        strings_path = os.path.join(self.res_dir, 'strings-mod.json')
        if not os.path.exists(strings_path) or os.path.getsize(strings_path) == 0:
            msg = "Error: strings-mod.json is missing or empty. Run Desheetifier first?"
            self.log(msg)
            raise FileNotFoundError(msg)

    def _load_resources(self):
        i2languages_path = os.path.join(self.res_dir, 'I2Languages-mod.json')
        strings_path     = os.path.join(self.res_dir, 'strings-mod.json')

        self.log(f"Reading file: {i2languages_path}")
        with open(i2languages_path, 'r', encoding='utf-8') as f:
            self._I2Languages = json.load(f)

        self.log(f"Reading file: {strings_path}")
        with open(strings_path, 'r', encoding='utf-8') as f:
            self._strings = json.load(f)

    def _clean_output(self):
        if os.path.exists(self.out_dir):
            self.log(f"Cleaning output directory: {self.out_dir}")
            shutil.rmtree(self.out_dir)
            self.log("Output directory cleaned")

    def _import_i2languages(self):
        file_path = os.path.join(self.game_data_dir, 'resources.assets')
        self.log(f"Reading file: {file_path}")
        self.on_progress('i2languages', 0, 1)
        try:
            env = UnityPy.load(file_path)
            found = False
            for obj in env.objects:
                if obj.type.name == 'MonoBehaviour':
                    try:
                        data = obj.read(check_read=False)
                        if getattr(data, 'm_Name') == "I2Languages":
                            found = True
                    except Exception:
                        continue
                    if found:
                        obj.save_typetree(self._I2Languages,
                                          self._I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                        os.makedirs(self.out_dir, exist_ok=True)
                        out_path = os.path.join(self.out_dir, 'resources.assets')
                        self.log(f"Writing file: {out_path}")
                        with open(out_path, "wb") as f:
                            f.write(env.file.save(packer="original"))
                        self.on_progress('i2languages', 1, 1)
                        self.log("I2Languages successfully imported")
                        break

            if not found:
                msg = "Failed to import I2Languages: I2Languages not found in resources.assets"
                self.log(msg)
                raise RuntimeError(msg)
        except RuntimeError:
            raise
        except Exception as e:
            msg = f"Error importing I2Languages: {str(e)}"
            self.log(msg)
            self.log(traceback.format_exc())
            raise RuntimeError(msg) from e

    def _import_strings(self):
        total = len(self.scene_bundles)
        for idx, bundle_name in enumerate(self.scene_bundles):
            self.on_progress('strings', idx, total)
            needs_saving = False
            file_path = os.path.join(self.bundle_dir, bundle_name)
            self.log(f"Reading file: {file_path}")
            try:
                env = UnityPy.load(file_path)
                bundle_strings_count = 0

                for obj in env.objects:
                    if obj.type.name == 'MonoBehaviour':
                        if not obj.serialized_type.nodes:
                            continue
                        try:
                            tree = obj.read_typetree()
                        except Exception as inner_e:
                            self.log(f"Error processing object in {bundle_name}: {str(inner_e)}")
                            continue
                        if 'm_text' in tree and 'm_fontAsset' in tree and '_SortingLayer' in tree:
                            strings_key = tree['m_text'].replace('\t', '\\t').replace('\n', '\\n')
                            if strings_key in self._strings and self._strings[strings_key] != "":
                                tree['m_text'] = self._strings[strings_key].replace('\\t', '\t').replace('\\n', '\n')
                                obj.save_typetree(tree)
                                needs_saving = True
                                self.strings_num += 1
                                bundle_strings_count += 1

                if needs_saving:
                    out_bundle_path = os.path.join(self.out_dir, self.STREAMING_ASSETS_PATH, bundle_name)
                    os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                    self.log(f"Writing file: {out_bundle_path} (imported {bundle_strings_count} strings)")
                    with open(out_bundle_path, "wb") as f:
                        f.write(env.file.save(packer="original"))
                    self.bundles_num += 1
            except Exception as e:
                self.log(f"Error processing bundle {bundle_name}: {str(e)}")
                self.log(traceback.format_exc())
            finally:
                del env
                if idx % 50 == 0:
                    gc.collect()
        self.on_progress('strings', total, total)

    def _import_dialogues(self):
        total = len(self.dialogue_bundles)
        for idx, bundle_name in enumerate(self.dialogue_bundles):
            self.on_progress('dialogues', idx, total)
            needs_saving = False
            file_path = os.path.join(self.bundle_dir, bundle_name)
            self.log(f"Reading file: {file_path}")
            try:
                env = UnityPy.load(file_path)
                bundle_dialogues_count = 0

                pathid_to_asset = {}
                for asset_path, obj in env.container.items():
                    pathid_to_asset[obj.path_id] = asset_path

                for obj in env.objects:
                    if obj.type.name != 'MonoBehaviour':
                        continue
                    if not obj.serialized_type.nodes:
                        continue
                    try:
                        typetree = obj.read_typetree()
                    except Exception as e:
                        self.log(f"Warning: failed to read typetree in {bundle_name}: {str(e)}")
                        continue

                    if not ('conversations' in typetree and 'actors' in typetree and 'items' in typetree):
                        continue

                    asset_path = pathid_to_asset.get(obj.path_id, '')
                    if 'DialogueDatabaseArchive' in asset_path:
                        continue

                    bundle_dest = os.path.join(self.res_dir, os.path.basename(bundle_name))
                    if asset_path:
                        asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                        filename = os.path.basename(asset_path) + "-mod.json"
                    else:
                        m_name = typetree.get('m_Name', f'dialogue_{obj.path_id}')
                        asset_dir = bundle_dest
                        filename = m_name + "-mod.json"
                    mod_path = os.path.join(asset_dir, filename)

                    if os.path.exists(mod_path) and os.path.getsize(mod_path) > 0:
                        self.log(f"Found modified dialogue: {mod_path} for {asset_path or '(no container path)'}")
                        with open(mod_path, 'r', encoding='utf-8') as f:
                            modified_typetree = json.load(f)

                        if modified_typetree:
                            obj.save_typetree(modified_typetree)
                            needs_saving = True
                            self.dialogues_num += 1
                            bundle_dialogues_count += 1

                if needs_saving:
                    out_bundle_path = os.path.join(self.out_dir, self.STREAMING_ASSETS_PATH, bundle_name)
                    os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                    self.log(f"Writing file: {out_bundle_path} (imported {bundle_dialogues_count} dialogue databases)")
                    with open(out_bundle_path, "wb") as f:
                        f.write(env.file.save(packer="original"))
                    self.bundles_num += 1
            except Exception as e:
                self.log(f"Error processing dialogue bundle {bundle_name}: {str(e)}")
                self.log(traceback.format_exc())
            finally:
                del env
                if idx % 50 == 0:
                    gc.collect()
        self.on_progress('dialogues', total, total)

    def _import_textures(self):
        if self.skip_textures:
            return
        if not self.overrides_dir:
            return

        total = len(self.texture_bundles)
        textures_set = set(self.textures)
        for idx, bundle_name in enumerate(self.texture_bundles):
            self.on_progress('textures', idx, total)
            needs_saving = False
            file_path = os.path.join(self.bundle_dir, bundle_name)
            self.log(f"Reading file: {file_path}")
            try:
                env = UnityPy.load(file_path)
                bundle_textures_count = 0

                for asset_path, obj in env.container.items():
                    if obj.type.name in ['Texture2D', 'Sprite']:
                        if asset_path in textures_set:
                            data = obj.read()
                            check_path = asset_path
                            if not check_path.endswith('.png'):
                                check_path += '.png'
                            override = os.path.join(self.overrides_dir, os.path.basename(check_path))
                            if os.path.exists(override):
                                self.log(f"Found texture override: {override} for {asset_path}")
                                img = Image.open(override)
                                if obj.type.name == 'Sprite':
                                    data = data.m_RD.texture.read()
                                data.image = img
                                data.save()
                                needs_saving = True
                                self.textures_num += 1
                                bundle_textures_count += 1

                if needs_saving:
                    out_bundle_path = os.path.join(self.out_dir, self.STREAMING_ASSETS_PATH, bundle_name)
                    os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                    self.log(f"Writing file: {out_bundle_path} (imported {bundle_textures_count} textures)")
                    with open(out_bundle_path, "wb") as f:
                        f.write(env.file.save(packer="original"))
                    self.bundles_num += 1
            except Exception as e:
                self.log(f"Error processing texture bundle {bundle_name}: {str(e)}")
                self.log(traceback.format_exc())
            finally:
                del env
                if idx % 50 == 0:
                    gc.collect()
        self.on_progress('textures', total, total)

    def _summary(self):
        return {
            'i2languages': 1,
            'strings':     self.strings_num,
            'textures':    self.textures_num,
            'dialogues':   self.dialogues_num,
            'bundles':     self.bundles_num,
        }
