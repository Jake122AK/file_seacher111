#!/usr/bin/env python3
"""
db_to_txt_paired.py - パス・内容ペア形式で80MB上限TXT変換
============================================================

各エントリで「ファイルパス → 本文」が1対1で対応するように整形。
複数の元ファイルを1つのTXTに連結するが、各エントリは
[FILE_BEGIN] ... [FILE_END] で明確に区切るため、
AIに渡したときに「どの内容がどのパスに属するか」が確実に対応する。

使い方:
  python db_to_txt_paired.py
  python db_to_txt_paired.py --max-mb 50
  python db_to_txt_paired.py --output-dir D:\\export
"""

import argparse
import sqlite3
import sys
import time
from pathlib import Path
from datetime import datetime

DEFAULT_SHARD_DIR = Path.home() / ".file_searcher" / "shards"
DEFAULT_OUTPUT_DIR = Path(".") / "copilot_export_paired"
DEFAULT_MAX_MB = 80
DEFAULT_NUM_SHARDS = 16
DOC_OVERHEAD_BYTES = 512


# ---------------------------------------------------------------------------
# UTF-8セーフな分割
# ---------------------------------------------------------------------------

def split_by_bytes(text: str, max_bytes: int) -> list[str]:
    """UTF-8 で max_bytes 以下になるよう改行優先で分割。"""
    if not text:
        return [""]
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return [text]
    chunks: list[str] = []
    remaining = text
    while remaining:
        rem_bytes = remaining.encode("utf-8")
        if len(rem_bytes) <= max_bytes:
            chunks.append(remaining)
            break
        lo, hi = 1, len(remaining)
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if len(remaining[:mid].encode("utf-8")) <= max_bytes:
                lo = mid
            else:
                hi = mid - 1
        split_at = lo
        lookback = max(split_at - 2000, 1)
        for j in range(split_at, lookback, -1):
            if remaining[j - 1] == "\n":
                split_at = j
                break
        chunks.append(remaining[:split_at])
        remaining = remaining[split_at:]
    return chunks


# ---------------------------------------------------------------------------
# シャード読み取り
# ---------------------------------------------------------------------------

def count_docs(shard_dir: Path, num_shards: int) -> int:
    total = 0
    for i in range(num_shards):
        sp = shard_dir / f"index_{i:02x}.db"
        if not sp.exists():
            continue
        try:
            conn = sqlite3.connect(str(sp), timeout=30)
            n = conn.execute(
                "SELECT COUNT(*) FROM contents "
                "WHERE content IS NOT NULL AND content != ''"
            ).fetchone()[0]
            conn.close()
            total += n
        except Exception as e:
            print(f"  WARN: シャード {i:02x}: {e}", flush=True)
    return total


def iter_docs(shard_dir: Path, num_shards: int):
    for i in range(num_shards):
        sp = shard_dir / f"index_{i:02x}.db"
        if not sp.exists():
            continue
        try:
            conn = sqlite3.connect(str(sp), timeout=60)
            conn.execute("PRAGMA journal_mode=WAL")
            cursor = conn.execute(
                "SELECT name, path, content FROM contents "
                "WHERE content IS NOT NULL AND content != ''"
            )
            while True:
                rows = cursor.fetchmany(500)
                if not rows:
                    break
                for row in rows:
                    yield row
            conn.close()
        except Exception as e:
            print(f"\n  WARN: シャード {i:02x}: {e}", flush=True)


# ---------------------------------------------------------------------------
# パス→内容のペア形式でブロック生成
# ---------------------------------------------------------------------------

def make_pair_block(name: str, path: str, content: str,
                    seq: int, part_idx: int = 0, total_parts: int = 1) -> str:
    """パス→内容のペアを明示する1エントリ。

    [FILE_BEGIN] と [FILE_END] でAIが識別しやすい区切りを入れる。
    パスは必ず本文の直前に書き、対応関係を明確に。
    """
    part_marker = f" (PART {part_idx}/{total_parts})" if total_parts > 1 else ""
    return (
        f"\n[FILE_BEGIN #{seq:05d}{part_marker}]\n"
        f"PATH: {path}\n"
        f"NAME: {name}\n"
        f"CONTENT:\n"
        f"{content}\n"
        f"[FILE_END #{seq:05d}]\n\n"
    )


# ---------------------------------------------------------------------------
# 出力ファイルローテーター
# ---------------------------------------------------------------------------

class RotatingWriter:
    """サイズ上限を厳守するライター。"""

    def __init__(self, output_dir: Path, max_bytes: int, source_dir: Path):
        self.output_dir = output_dir
        self.max_bytes = max_bytes
        self.source_dir = source_dir
        self.file_num = 0
        self.current_f = None
        self.current_size = 0
        self.output_files: list[Path] = []
        self._open_new()

    def _open_new(self):
        if self.current_f is not None:
            self.current_f.close()
        self.file_num += 1
        p = self.output_dir / f"paired_source_{self.file_num:03d}.txt"
        self.output_files.append(p)
        self.current_f = open(p, "w", encoding="utf-8", buffering=64 * 1024)
        header = (
            f"# Paired Source File\n"
            f"# 生成日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"# 変換元  : {self.source_dir}\n"
            f"# 形式    : 各エントリは [FILE_BEGIN] ... [FILE_END] で囲まれ、\n"
            f"#           PATH と CONTENT が1対1で対応します。\n"
            f"# 上限    : {self.max_bytes / 1e6:.0f} MB（厳守）\n\n"
        )
        self.current_f.write(header)
        self.current_size = len(header.encode("utf-8"))

    def write_block(self, block: str):
        block_bytes = len(block.encode("utf-8"))
        if self.current_size + block_bytes > self.max_bytes:
            self._open_new()
        self.current_f.write(block)
        self.current_size += block_bytes

    def close(self):
        if self.current_f is not None:
            self.current_f.close()
            self.current_f = None


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def export(shard_dir: Path, output_dir: Path,
           max_mb: int, num_shards: int) -> list[Path]:
    max_bytes = max_mb * 1000 * 1000  # SI単位
    # 1エントリの最大サイズ：ファイル上限 - ヘッダ余裕
    max_chunk_bytes = max_bytes - DOC_OVERHEAD_BYTES - 500

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  FileSearcher DB → Paired TXT (PATH ↔ CONTENT ペア形式)")
    print(f"{'='*60}")
    print(f"  シャードDBフォルダ : {shard_dir}")
    print(f"  出力フォルダ       : {output_dir}")
    print(f"  1ファイル上限      : {max_mb} MB (厳守)")
    print(f"  シャード数         : {num_shards}")

    print(f"\n  ドキュメント数をカウント中...", end="", flush=True)
    total_docs = count_docs(shard_dir, num_shards)
    print(f" {total_docs:,} 件\n")

    if total_docs == 0:
        print("WARN: 変換できるドキュメントがありません。")
        return []

    writer = RotatingWriter(output_dir, max_bytes, shard_dir)
    done = 0
    skipped = 0
    split_doc = 0
    total_blocks = 0
    t0 = time.time()
    last_print = 0.0

    try:
        for name, path, content in iter_docs(shard_dir, num_shards):
            content = (content or "").strip()
            if not content:
                skipped += 1
                continue
            done += 1

            # 巨大ファイルは PART で分割
            chunks = split_by_bytes(content, max_chunk_bytes)
            total = len(chunks)
            if total > 1:
                split_doc += 1
            for i, chunk in enumerate(chunks, 1):
                block = make_pair_block(name, path, chunk, done, i, total)
                writer.write_block(block)
                total_blocks += 1

            now = time.time()
            if now - last_print >= 0.5 or done == total_docs:
                pct = done * 100 // max(total_docs, 1)
                elapsed = now - t0
                speed = done / elapsed if elapsed > 0 else 0
                eta = (total_docs - done) / speed if speed > 0 else 0
                eta_s = (f"{eta/60:.0f}分{eta%60:.0f}秒"
                         if eta > 60 else f"{eta:.0f}秒")
                print(
                    f"\r  [{pct:3d}%] {done:>10,} / {total_docs:,}件  "
                    f"{len(writer.output_files):>3}TXT  "
                    f"{speed:>6.0f}件/秒  残り約{eta_s}    ",
                    end="", flush=True,
                )
                last_print = now
    finally:
        writer.close()

    elapsed = time.time() - t0

    print(f"\n\n{'='*60}")
    print(f"  変換完了")
    print(f"{'='*60}")
    print(f"  変換ドキュメント数 : {done:,} 件")
    if skipped:
        print(f"  スキップ(空)       : {skipped:,} 件")
    if split_doc:
        print(f"  パート分割した文書 : {split_doc:,} 件")
    print(f"  書出ブロック総数   : {total_blocks:,} 個 (PATH↔CONTENTペア)")
    print(f"  出力ファイル数     : {len(writer.output_files)} 個")
    print(f"  処理時間           : {elapsed:.1f}s  ({done/elapsed:.0f} 件/s)")
    print()

    total_size = 0
    over = []
    for p in writer.output_files:
        try:
            sz = p.stat().st_size
            total_size += sz
            mark = "OK" if sz <= max_bytes else "OVER"
            if sz > max_bytes:
                over.append(p)
            print(f"  [{mark}] {p.name}  ({sz / 1e6:.1f} MB)")
        except OSError:
            print(f"  [?]  {p.name}")
    print(f"\n  合計サイズ: {total_size / 1e9:.2f} GB")

    if over:
        print(f"\nWARN: 上限超過ファイルあり: {len(over)} 個")
    else:
        print(f"\nOK: 全ファイル {max_mb}MB 以下を確認")

    print()
    print("  ─── 出力フォーマット ────────────────────────────────────")
    print("  各エントリは以下の構造になっています:")
    print()
    print("    [FILE_BEGIN #00001]")
    print("    PATH: \\\\server\\share\\経費精算.xlsx")
    print("    NAME: 経費精算.xlsx")
    print("    CONTENT:")
    print("    （ここに本文）")
    print("    [FILE_END #00001]")
    print()
    print("  AIに渡したとき、PATH と CONTENT の対応関係が明確です。")
    print()

    return writer.output_files


def main():
    parser = argparse.ArgumentParser(
        description="シャードDBを 80MB上限のペア形式 TXT に変換",
    )
    parser.add_argument(
        "--shard-dir", type=Path, default=DEFAULT_SHARD_DIR, metavar="DIR",
        help=f"シャードDBフォルダ (default: {DEFAULT_SHARD_DIR})",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, metavar="DIR",
        help=f"出力フォルダ (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--max-mb", type=int, default=DEFAULT_MAX_MB, metavar="MB",
        help=f"1ファイル上限MB (default: {DEFAULT_MAX_MB}, 厳守)",
    )
    parser.add_argument(
        "--num-shards", type=int, default=DEFAULT_NUM_SHARDS, metavar="N",
        help=f"シャード数 (default: {DEFAULT_NUM_SHARDS})",
    )
    args = parser.parse_args()

    if not args.shard_dir.exists():
        print(f"\nERROR: シャードDBフォルダが見つかりません: {args.shard_dir}")
        sys.exit(1)

    export(args.shard_dir, args.output_dir, args.max_mb, args.num_shards)


if __name__ == "__main__":
    main()
