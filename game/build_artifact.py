#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rigplay.html を「埋め込める形」に切り出す。

    python3 game/build_artifact.py [出力先.html]

出力は <html>/<head>/<body> を持たない断片で、ホスト側の骨組みに差し込まれる
ことを前提にしている。生成物はリポジトリに入れない（rigplay.html と中身が
ほぼ同じものを二重に持つ意味がない）。

なぜ上書きの CSS が要るのか
---------------------------
埋め込み先は iframe の高さを「中身の高さ」から決める。ところが rigplay は
position:fixed のレイヤーを height:100% の body に重ねただけのページなので、
固有の高さを一切持たない —— 与えられた高さをそのまま報告し返すだけで、
自分から大きくなれない。1px の枠に入れれば 1px と答え、つまり何も見えない。

実測（高さ1px の iframe に入れたときに報告し返す高さ）：

    上書きなし   docH=1     canvasH=1     何も見えない
    上書きあり   docH=640   canvasH=640   正しく描画

min-height ではなく height を明示しているのは、下の百分率がそれに対して
解決される必要があるため。height:auto のままだと canvas が固有サイズ
（描画バッファの画素数）にフォールバックして枠から溢れる。
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'rigplay.html')
DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'rigplay_embed.html')

FIT = '''<style>
  /* 埋め込み時だけの上書き : 固有の高さを持たせ、レイヤーをその中に置く */
  html{height:auto}
  body{position:relative;height:max(640px,100svh);min-height:640px;overflow:hidden;background:#0a0c10}
  #gl,#ui,#loading,#err{position:absolute;inset:0;width:100%;height:100%}
  #err{display:none}
</style>'''

HEAD = ('<!-- Autorig : 骨の入っていない人型 OBJ に、自動で骨を当てて歩かせる。\n'
        '     外部依存ゼロ。読み込んだファイルはブラウザの外に出ません。 -->\n')

s = io.open(SRC, encoding='utf-8').read()
style = s[s.index('<style>'):s.index('</style>') + len('</style>')]
body = s[s.index('<body>') + len('<body>'):s.index('</body>')]
out = HEAD + style + '\n' + FIT + '\n' + body.strip() + '\n'

for t in ['<!doctype', '<html', '<head', '<body', '</html', '</head', '</body']:
    assert t not in out.lower(), 'document-level tag leaked into the fragment: ' + t

io.open(DST, 'w', encoding='utf-8').write(out)
print('wrote %s (%.0f KB)' % (DST, len(out) / 1024))
