"""
1000xRESIST Patcher - standalone executable entry point.

Usage:
    patcher <game_directory>

Where <game_directory> is the root folder of your 1000xRESIST installation
(the one that contains the 1000xRESIST_Data sub-folder).

On Windows, when no argument is given, a standard file dialog asks the user
to pick 1000xRESIST.exe (the game directory is derived from it), and the
console stays open afterwards so the output can be read.

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
# Windows file picker (used when no argument is given)
# ---------------------------------------------------------------------------

def _pick_game_exe_windows():
    """Show the standard WinAPI Open File dialog to pick 1000xRESIST.exe.
    Returns the selected path, or None if the dialog was cancelled."""
    import ctypes
    from ctypes import wintypes

    class OPENFILENAMEW(ctypes.Structure):
        _fields_ = [
            ('lStructSize', wintypes.DWORD),
            ('hwndOwner', wintypes.HWND),
            ('hInstance', wintypes.HINSTANCE),
            ('lpstrFilter', wintypes.LPCWSTR),
            ('lpstrCustomFilter', wintypes.LPWSTR),
            ('nMaxCustFilter', wintypes.DWORD),
            ('nFilterIndex', wintypes.DWORD),
            ('lpstrFile', wintypes.LPWSTR),
            ('nMaxFile', wintypes.DWORD),
            ('lpstrFileTitle', wintypes.LPWSTR),
            ('nMaxFileTitle', wintypes.DWORD),
            ('lpstrInitialDir', wintypes.LPCWSTR),
            ('lpstrTitle', wintypes.LPCWSTR),
            ('Flags', wintypes.DWORD),
            ('nFileOffset', wintypes.WORD),
            ('nFileExtension', wintypes.WORD),
            ('lpstrDefExt', wintypes.LPCWSTR),
            ('lCustData', wintypes.LPARAM),
            ('lpfnHook', wintypes.LPVOID),
            ('lpTemplateName', wintypes.LPCWSTR),
            ('pvReserved', wintypes.LPVOID),
            ('dwReserved', wintypes.DWORD),
            ('FlagsEx', wintypes.DWORD),
        ]

    OFN_NOCHANGEDIR   = 0x00000008
    OFN_PATHMUSTEXIST = 0x00000800
    OFN_FILEMUSTEXIST = 0x00001000

    buffer = ctypes.create_unicode_buffer(1024)
    ofn = OPENFILENAMEW()
    ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
    ofn.hwndOwner = None
    # filter pairs are separated/terminated by null chars; keep the literals
    # split so '\0' is never followed by a digit inside a single literal
    ofn.lpstrFilter = '1000xRESIST.exe\0' '1000xRESIST.exe\0\0'
    ofn.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
    ofn.nMaxFile = len(buffer)
    ofn.lpstrTitle = 'Select 1000xRESIST.exe'
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR

    if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
        return buffer.value
    return None


def _wait_for_keypress():
    """Console pause for interactive runs ('press any key')."""
    print("\nPress any key to exit...", end='', flush=True)
    try:
        import msvcrt
        msvcrt.getch()
    except ImportError:
        input()
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _run(game_dir):
    """Run the patcher against game_dir. Returns the process exit code."""
    game_data_dir = os.path.join(game_dir, '1000xRESIST_Data')

    if not os.path.isdir(game_data_dir):
        print(f"Error: '{game_data_dir}' does not exist or is not a directory.")
        print("Make sure you passed the correct game root directory.")
        return 1

    res_dir            = os.path.join(_base_dir, 'resources')
    overrides_dir      = os.path.join(_base_dir, 'overrides')
    typetree_path      = os.path.join(_base_dir, 'data', 'I2.loc.typetree.json')
    textures_list_path = os.path.join(_base_dir, 'data', 'textures.list')

    has_overrides = os.path.isdir(overrides_dir)
    # Textures are skipped only when there are no overrides at all; fonts and
    # textures share the same overrides directory, so as long as it exists we
    # pass it through (texture import itself is gated by skip_textures).
    skip_textures = not has_overrides

    print(f"Game directory : {game_dir}")
    print(f"Resources      : {res_dir}")
    if has_overrides:
        print(f"Overrides      : {overrides_dir}")
    else:
        print("Overrides      : skipped (no 'overrides' folder found)")
    print()

    try:
        patcher = ResourcePatcher(
            game_data_dir=game_data_dir,
            res_dir=res_dir,
            out_dir=game_dir,
            overrides_dir=overrides_dir if has_overrides else None,
            skip_textures=skip_textures,
            typetree_path=typetree_path,
            textures_list_path=textures_list_path,
            on_progress=on_progress,
            clean_output=False,
        )
        summary = patcher.run()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1
    except RuntimeError as e:
        print(f"Error: {e}")
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}")
        print(traceback.format_exc())
        return 1

    print(
        "\n[SUMMARY]\n"
        f"Imported I2Languages:        {summary['i2languages']}\n"
        f"Imported strings:            {summary['strings']}\n"
        f"Imported textures:           {summary['textures']}\n"
        f"Imported dialogue databases: {summary['dialogues']}\n"
        f"Bundles patched:             {summary['bundles']}\n"
        f"Imported fonts:              {summary['fonts']}"
    )
    return 0


def main():
    interactive = False

    if len(sys.argv) < 2:
        if os.name != 'nt':
            print("Usage: patcher <game_directory>")
            print("  <game_directory>  root folder of your 1000xRESIST installation")
            print("                    (must contain a '1000xRESIST_Data' sub-folder)")
            sys.exit(1)
        # No argument on Windows - ask the user to pick the game executable
        picked = _pick_game_exe_windows()
        if not picked:
            print("No 1000xRESIST.exe selected, aborting.")
            sys.exit(1)
        interactive = True
        game_dir = os.path.dirname(os.path.abspath(picked))
    else:
        game_dir = os.path.abspath(sys.argv[1])

    exit_code = _run(game_dir)
    if interactive:
        # keep the console window open so the user can read the output
        _wait_for_keypress()
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
