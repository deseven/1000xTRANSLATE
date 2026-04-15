"""
1000xRESIST Patcher - standalone executable entry point.

Usage:
    patcher <game_directory>

Where <game_directory> is the root folder of your 1000xRESIST installation
(the one that contains the 1000xRESIST_Data sub-folder).

All patching resources (strings, dialogues, textures, etc.) are expected to
sit next to this executable in a 'resources' sub-folder, and texture overrides
in an 'overrides' sub-folder.  Patched files are written directly into the
provided game directory.
"""

import os
import sys
import traceback

from patcher import ResourcePatcher


# ---------------------------------------------------------------------------
# Base directory (works both as a script and as a frozen executable)
# ---------------------------------------------------------------------------

_base_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# Simple progress reporting
# ---------------------------------------------------------------------------

_stage_labels = {
    'i2languages': 'Importing I2Languages',
    'strings':     'Importing strings',
    'dialogues':   'Importing dialogues',
    'textures':    'Importing textures',
}

_stage_started = set()


def on_progress(stage, current, total):
    if total == 0:
        return
    label = _stage_labels.get(stage, stage)
    if current == 0 and stage not in _stage_started:
        print(f"{label}...", flush=True)
        _stage_started.add(stage)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: patcher <game_directory>")
        print("  <game_directory>  root folder of your 1000xRESIST installation")
        print("                    (must contain a '1000xRESIST_Data' sub-folder)")
        sys.exit(1)

    game_dir = os.path.abspath(sys.argv[1])
    game_data_dir = os.path.join(game_dir, '1000xRESIST_Data')

    if not os.path.isdir(game_data_dir):
        print(f"Error: '{game_data_dir}' does not exist or is not a directory.")
        print("Make sure you passed the correct game root directory.")
        sys.exit(1)

    res_dir            = os.path.join(_base_dir, 'resources')
    overrides_dir      = os.path.join(_base_dir, 'overrides')
    typetree_path      = os.path.join(_base_dir, 'data', 'I2.loc.typetree.json')
    textures_list_path = os.path.join(_base_dir, 'data', 'textures.list')

    skip_textures = not os.path.isdir(overrides_dir)

    print(f"Game directory : {game_dir}")
    print(f"Resources      : {res_dir}")
    if skip_textures:
        print("Textures       : skipped (no 'overrides' folder found)")
    else:
        print(f"Textures       : {overrides_dir}")
    print()

    try:
        patcher = ResourcePatcher(
            game_data_dir=game_data_dir,
            res_dir=res_dir,
            out_dir=game_dir,
            overrides_dir=None if skip_textures else overrides_dir,
            skip_textures=skip_textures,
            typetree_path=typetree_path,
            textures_list_path=textures_list_path,
            on_progress=on_progress,
            clean_output=False,
        )
        summary = patcher.run()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        print(traceback.format_exc())
        sys.exit(1)

    print(
        "\n[SUMMARY]\n"
        f"Imported I2Languages:        {summary['i2languages']}\n"
        f"Imported strings:            {summary['strings']}\n"
        f"Imported textures:           {summary['textures']}\n"
        f"Imported dialogue databases: {summary['dialogues']}\n"
        f"Bundles patched:             {summary['bundles']}"
    )


if __name__ == '__main__':
    main()
