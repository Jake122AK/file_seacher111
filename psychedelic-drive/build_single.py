#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_single.py — 全ソースを1枚のHTMLにまとめる

  python3 build_single.py

出力: dist/psychedelic-drive.html
外部リソースを一切参照しないので、そのままスマホへ転送しても、
どこかに置いてURLを共有しても、file:// で開いても動く。
"""
import os, re, io

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, 'dist')
OUT = os.path.join(OUT_DIR, 'psychedelic-drive.html')

def read(*parts):
    with io.open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()

def main():
    html = read('index.html')
    css = read('style.css')

    # index.html に書かれている読み込み順をそのまま使う（順序の二重管理を避ける）
    order = re.findall(r'<script src="([^"]+)"></script>', html)
    if not order:
        raise SystemExit('index.html から script タグを検出できませんでした')

    bundle = []
    for rel in order:
        src = read(*rel.split('/'))
        bundle.append('/* ===== %s ===== */\n%s' % (rel, src))
    js = '\n;\n'.join(bundle)

    body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
    body = re.sub(r'\s*<!--.*?-->\s*', '\n', body, flags=re.S)
    body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

    page = (
        '<!DOCTYPE html>\n<html lang="ja">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,'
        'user-scalable=no,viewport-fit=cover">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="theme-color" content="#07060d">\n'
        '<title>MIDNIGHT MUSHROOM DRIVE</title>\n'
        '<style>\n' + css + '</style>\n'
        '</head>\n<body>\n'
        + body.strip() + '\n'
        '<script>\n' + js + '\n</script>\n'
        '</body>\n</html>\n'
    )

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write(page)
    print('%s  (%.1f KB, %d files)' % (OUT, len(page.encode('utf-8')) / 1024.0, len(order)))

    # ホスティング先が <html>/<head>/<body> を用意する場合向けの断片版
    frag = ('<title>Midnight Mushroom Drive</title>\n'
            '<style>\n' + css + '</style>\n'
            + body.strip() + '\n'
            '<script>\n' + js + '\n</script>\n')
    frag_path = os.path.join(OUT_DIR, 'embed.html')
    with io.open(frag_path, 'w', encoding='utf-8') as f:
        f.write(frag)
    print('%s  (%.1f KB)' % (frag_path, len(frag.encode('utf-8')) / 1024.0))

if __name__ == '__main__':
    main()
