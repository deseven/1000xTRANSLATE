import gc
import io
import os
import json
import shutil
import traceback
import UnityPy
from PIL import Image


def _load_env(file_path):
    """Read file into memory and load with UnityPy.

    Passing bytes to UnityPy causes it to use EndianBinaryReader_Memoryview
    which holds no file handle.  This means the original file is free to be
    overwritten immediately after this call returns, even on Windows.
    """
    with open(file_path, 'rb') as fh:
        data = fh.read()
    return UnityPy.load(io.BytesIO(data))


def detect_unity_version(game_data_dir):
    """Detect the Unity version by reading resources.assets from the game data directory."""
    try:
        resources_path = os.path.join(game_data_dir, 'resources.assets')
        env = UnityPy.load(resources_path)
        for sf in env.files.values():
            if hasattr(sf, 'unity_version') and sf.unity_version:
                return sf.unity_version
    except Exception:
        pass
    return None


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
        :param res_dir:            Path to resources directory containing flat
                                   patch maps (I2Languages-mod.json, strings-mod.json,
                                   dialogue *-mod.json patches) produced by the
                                   Desheetifier. These are merged into the original
                                   assets extracted from the user's game - the
                                   original assets are never replaced wholesale.
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

        # Configure UnityPy - auto-detect version from resources.assets if not provided
        if not unity_version:
            unity_version = detect_unity_version(game_data_dir)
        if not unity_version or not unity_version.startswith('6000'):
            raise RuntimeError(f"This game version is not supported (detected: {unity_version})")
        UnityPy.config.FALLBACK_UNITY_VERSION = unity_version
        self.log(f"Unity version: {unity_version}")

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
        self.fonts_num     = 0

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
            self._i2_patch = json.load(f)
        if self._i2_patch.get('format') != 'i2languages-patch':
            msg = ("Error: I2Languages-mod.json is in the old full-tree format. "
                   "Re-run Desheetifier to generate a patch file.")
            self.log(msg)
            raise RuntimeError(msg)

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
            env = _load_env(file_path)
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
                        # Merge translations into the ORIGINAL tree extracted from
                        # the user's game - never replace the whole asset, so
                        # content added/changed by newer game versions survives.
                        tree = obj.read_typetree(self._I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                        applied = self._apply_i2_patch(tree)
                        if applied:
                            obj.save_typetree(tree,
                                              self._I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                        # Replace legacy Font objects with override TTF/OTF files
                        # (shares the same env / single save pass as I2Languages)
                        self._import_fonts(env)
                        os.makedirs(self.out_dir, exist_ok=True)
                        out_path = os.path.join(self.out_dir, 'resources.assets')
                        self.log(f"Writing file: {out_path}")
                        with open(out_path, "wb") as f:
                            f.write(env.file.save(packer="original"))
                        self.on_progress('i2languages', 1, 1)
                        self.log(f"I2Languages successfully patched ({applied} terms applied)")
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

    # Legacy fallback language indices, used only when the target language
    # cannot be resolved against mLanguages of the user's game version.
    LEGACY_LANG_BIND = {'en': 0, 'zh': 1, 'ja': 2}

    def _resolve_language_index(self, source, target_lang):
        """Resolve the target language index against the mLanguages list of the
        ORIGINAL LanguageSourceAsset from the user's game version."""
        languages = source.get('mLanguages', [])
        target = (target_lang or '').lower()
        # 1. exact code match (en, zh, pt-BR, ...)
        for i, lang in enumerate(languages):
            if str(lang.get('Code', '')).lower() == target:
                return i
        # 2. prefix match (zh vs zh-CN, pt vs pt-BR, ...)
        for i, lang in enumerate(languages):
            code = str(lang.get('Code', '')).lower()
            if code and (code.startswith(target) or target.startswith(code)):
                return i
        # 3. exact name match (English, Chinese, ...)
        for i, lang in enumerate(languages):
            if str(lang.get('Name', '')).lower() == target:
                return i
        # 4. legacy fixed binding as a last resort
        legacy = self.LEGACY_LANG_BIND.get(target)
        if legacy is not None and legacy < len(languages):
            self.log(f"Warning: language '{target_lang}' not resolvable, "
                     f"falling back to legacy index {legacy}")
            return legacy
        return None

    def _apply_i2_patch(self, tree):
        """Apply the flat I2Languages patch to the original typetree in place.
        Returns the number of terms translated."""
        terms_patch = self._i2_patch.get('terms', {})
        if not terms_patch:
            self.log("I2Languages patch contains no terms, skipping")
            return 0
        target_lang = self._i2_patch.get('target_lang')
        source = tree.get('mSource', {})
        lang_idx = self._resolve_language_index(source, target_lang)
        if lang_idx is None:
            raise RuntimeError(
                f"Cannot resolve target language '{target_lang}' against the "
                "game's I2Languages asset")
        applied = 0
        for term in source.get('mTerms', []):
            translation = terms_patch.get(term.get('Term'))
            if translation:
                languages = term.setdefault('Languages', [])
                while len(languages) <= lang_idx:
                    languages.append('')
                languages[lang_idx] = translation
                applied += 1
        skipped = len(terms_patch) - applied
        self.log(f"I2Languages: applied {applied} term(s), skipped {skipped} "
                 f"(not present in this game version), language index {lang_idx}")
        return applied

    @staticmethod
    def _find_field(fields, field_type, title):
        for f in fields or []:
            if f.get('type') == field_type and f.get('title') == title:
                return f
        return None

    def _apply_dialogue_patch(self, typetree, patch):
        """Apply a flat dialogue patch to the original database typetree in
        place. Returns the number of fields translated."""
        target_lang = patch.get('target_lang', '')
        applied = 0

        actors_patch = patch.get('actors', {})
        if actors_patch:
            for actor in typetree.get('actors', []):
                fields = actor.get('fields', [])
                name_field = self._find_field(fields, 0, 'Name')
                if not name_field:
                    continue
                translation = actors_patch.get(name_field.get('value'))
                if not translation:
                    continue
                display_field = self._find_field(fields, 4, f'Display Name {target_lang}')
                if display_field is None:
                    # workaround for "Grace"
                    display_field = self._find_field(fields, 0, f'Display Name {target_lang}')
                if display_field is not None:
                    display_field['value'] = translation
                    applied += 1

        items_patch = patch.get('items', {})
        if items_patch:
            for item in typetree.get('items', []):
                fields = item.get('fields', [])
                key_field = self._find_field(fields, 0, 'Name')
                if not key_field:
                    continue
                translation = items_patch.get(key_field.get('value'))
                if not translation:
                    continue
                desc_field = self._find_field(fields, 4, f'Description {target_lang}')
                if desc_field is not None:
                    desc_field['value'] = translation
                    applied += 1

        dialogues_patch = patch.get('dialogues', {})
        if dialogues_patch:
            for conversation in typetree.get('conversations', []):
                title_field = None
                for f in conversation.get('fields', []):
                    if f.get('type') == 0 and str(f.get('title', '')).lower() == 'title':
                        title_field = f
                        break
                conv_title = title_field.get('value') if title_field else None
                if not conv_title:
                    continue
                for entry in conversation.get('dialogueEntries', []):
                    base_key = f"{conv_title}/{entry.get('id')}"
                    dialogue_text = dialogues_patch.get(f"{base_key}/DialogueText")
                    if dialogue_text:
                        field = self._find_field(entry.get('fields', []), 4, target_lang)
                        if field is not None:
                            field['value'] = dialogue_text
                            applied += 1
                    menu_text = dialogues_patch.get(f"{base_key}/MenuText")
                    if menu_text:
                        field = self._find_field(entry.get('fields', []), 4,
                                                 f'Menu Text {target_lang}')
                        if field is not None:
                            field['value'] = menu_text
                            applied += 1

        return applied

    def _import_strings(self):
        total = len(self.scene_bundles)
        for idx, bundle_name in enumerate(self.scene_bundles):
            self.on_progress('strings', idx, total)
            needs_saving = False
            file_path = os.path.join(self.bundle_dir, bundle_name)
            self.log(f"Reading file: {file_path}")
            env = None
            try:
                env = _load_env(file_path)
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
                env = None
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
            env = None
            try:
                env = _load_env(file_path)
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
                        self.log(f"Found dialogue patch: {mod_path} for {asset_path or '(no container path)'}")
                        with open(mod_path, 'r', encoding='utf-8') as f:
                            patch = json.load(f)

                        if patch.get('format') != 'dialogue-patch':
                            self.log(f"Warning: {mod_path} is in the old full-tree "
                                     "format, skipping (re-run Desheetifier)")
                            continue

                        # Merge translations into the ORIGINAL typetree read from
                        # the user's bundle - never replace the whole database.
                        applied = self._apply_dialogue_patch(typetree, patch)
                        if applied:
                            obj.save_typetree(typetree)
                            needs_saving = True
                            self.dialogues_num += 1
                            bundle_dialogues_count += 1
                            self.log(f"Applied {applied} translation(s) from {mod_path}")

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
                env = None
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
            env = None
            try:
                env = _load_env(file_path)
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
                env = None
                if idx % 50 == 0:
                    gc.collect()
        self.on_progress('textures', total, total)

    def _import_fonts(self, env):
        """Replace m_FontData in legacy Font objects using override TTF/OTF files.

        Looks for font files (``*.ttf`` / ``*.otf``) inside the overrides
        directory. The file's base name (without extension) must match the
        ``m_Name`` field of the target ``Font`` object in ``resources.assets``.
        Runs inside the ``_import_i2languages`` pass so it shares the same env
        and a single save pass.
        """
        if not self.overrides_dir or not os.path.isdir(self.overrides_dir):
            return

        # Build lookup: font_name -> file path (case-insensitive extension match)
        override_files = {}
        for filename in os.listdir(self.overrides_dir):
            if filename.lower().endswith(('.ttf', '.otf')):
                name = os.path.splitext(filename)[0]
                override_files[name] = os.path.join(self.overrides_dir, filename)

        if not override_files:
            return

        replaced = 0
        for obj in env.objects:
            if obj.type.name != 'Font':
                continue
            try:
                data = obj.read()
            except Exception as e:
                self.log(f"Warning: failed to read Font object: {str(e)}")
                continue
            if data.m_Name in override_files:
                override_path = override_files[data.m_Name]
                try:
                    with open(override_path, 'rb') as fh:
                        new_bytes = fh.read()
                except Exception as e:
                    self.log(f"Warning: failed to read font override '{override_path}': {str(e)}")
                    continue
                tree = obj.read_typetree()
                tree['m_FontData'] = list(new_bytes)
                obj.save_typetree(tree)
                self.log(f"Replaced font: {data.m_Name} ({len(new_bytes)} bytes) <- {override_path}")
                replaced += 1

        self.fonts_num += replaced
        if replaced:
            self.log(f"Replaced {replaced} font(s)")

    def _summary(self):
        return {
            'i2languages': 1,
            'strings':     self.strings_num,
            'textures':    self.textures_num,
            'dialogues':   self.dialogues_num,
            'bundles':     self.bundles_num,
            'fonts':       self.fonts_num,
        }
