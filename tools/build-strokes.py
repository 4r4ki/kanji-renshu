#!/usr/bin/env python3
"""KanjiVG の SVG から、アプリで使う漢字の書き順データ (js/strokes.js) を作る。

使い方:
  git clone --depth 1 https://github.com/KanjiVG/kanjivg /path/to/kanjivg
  python3 tools/build-strokes.py /path/to/kanjivg

KanjiVG (https://kanjivg.tagaini.net) Copyright (C) Ulrich Apel, CC BY-SA 3.0
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def kanji_list():
    src = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf-8').read()
    return re.findall(r"^K\('(.)'", src, re.M)


def load(kvg_dir, ch):
    path = os.path.join(kvg_dir, 'kanji', '%05x.svg' % ord(ch))
    svg = open(path, encoding='utf-8').read()
    paths = re.findall(r'<path id="kvg:[0-9a-f]+-s(\d+)"[^>]*?\sd="([^"]+)"', svg)
    paths.sort(key=lambda p: int(p[0]))
    nums = re.findall(r'<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)</text>', svg)
    pos = {int(n): (float(x), float(y)) for x, y, n in nums}
    strokes = []
    for i, (n, d) in enumerate(paths, 1):
        assert int(n) == i, (ch, n, i)
        x, y = pos.get(i, (0, 0))
        strokes.append([d, round(x, 1), round(y, 1)])
    return strokes


def main():
    kvg_dir = sys.argv[1]
    out = {}
    for ch in kanji_list():
        out[ch] = load(kvg_dir, ch)
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    body = body.replace('],"', '],\n"')
    with open(os.path.join(ROOT, 'js', 'strokes.js'), 'w', encoding='utf-8') as f:
        f.write('// 書き順データ: KanjiVG (https://kanjivg.tagaini.net)\n')
        f.write('// Copyright (C) Ulrich Apel. CC BY-SA 3.0 で配布されています。\n')
        f.write('// tools/build-strokes.py で生成。[パス, 画数番号のx, y] の並び。\n')
        f.write('const STROKES = ' + body + ';\n')
    print(len(out), 'kanji')


if __name__ == '__main__':
    main()
