#!/usr/bin/env python3
"""
db_to_txt.py - FileSearcher シャードDB → Microsoft Copilot 用 TXT 変換
====================================================================

特徴:
- 各出力TXTは上限を厳守（デフォルト 500MB）。1バイトも超過しない。
- 1ドキュメントが上限を超える場合「パート 1/N」で更に分割
- UTF-8 の文字境界を壊さない安全な分割
- なるべく改行位置で分割するので途中で文章が途切れにくい

使い方:
  python db_to_txt.py
  python db_to_txt.py --output-dir D:\\export
  python db_to_txt.py --max-mb 400
"""

import argparse
import sqlite3
import sys
import time
from pathlib import Path
from datetime import datetime

DEFAULT_SHARD_DIR = Path.home() / ".file_searcher" / "shards"
DEFAULT_OUTPUT_DIR = Path(".") / "copilot_export"
DEFAULT_MAX_MB = 500
DEFAULT_NUM_SHARDS = 16

SEPARATOR = "=" * 80
DOC_OVERHEAD_BYTES = 512  # ヘッダ等のオーバーヘッド予約


# ---------------------------------------------------------------------------
# UTF-8 セーフな文字列分割
# ---------------------------------------------------------------------------

def _split_text_by_bytes(text: str, max_bytes: int) -> list[str]:
    """UTF-8 で各チャンクが max_bytes 以下になるよう分割。
    改行位置を優先、無理なら文字境界で分割。"""
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

        # 二分探索で max_bytes に収まる最大文字数を求める
        lo, hi = 1, len(remaining)
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if len(remaining[:mid].encode("utf-8")) <= max_bytes:
                lo = mid
            else:
                hi = mid - 1
        split_at = lo

        # 直前 2000 文字以内に改行があればそこで切る
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
            print(f"  WARN: シャード {i:02x} カウント失敗: {e}", flush=True)
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
            print(f"\n  WARN: シャード {i:02x} 読み取りエラー: {e}", flush=True)


# ---------------------------------------------------------------------------
# 出力ファイルのローテーション
# ---------------------------------------------------------------------------

class RotatingWriter:
    """サイズ上限を絶対に超えないよう自動ローテートするライター。"""

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
        p = self.output_dir / f"copilot_source_{self.file_num:03d}.txt"
        self.output_files.append(p)
        self.current_f = open(p, "w", encoding="utf-8", buffering=64 * 1024)
        header = (
            f"# Copilot Knowledge Source\n"
            f"# 生成日時   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"# 変換元     : {self.source_dir}\n"
            f"# ファイル番号: {self.file_num}\n"
            f"# 上限       : {self.max_bytes / 1e6:.0f} MB\n\n"
        )
        self.current_f.write(header)
        self.current_size = len(header.encode("utf-8"))

    def write_block(self, block: str):
        """1ブロックを書き込む。サイズ超過なら新ファイルへローテート。
        ブロックは max_bytes 以下であることが前提（事前にチャンク分割する）。"""
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
# メイン変換
# ---------------------------------------------------------------------------

def write_document(writer: RotatingWriter, name: str, path: str,
                    content: str, max_chunk_bytes: int) -> int:
    """1ドキュメントを書く。巨大なら PART 1/N で分割。書いたパート数を返す。"""
    chunks = _split_text_by_bytes(content, max_chunk_bytes)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        if total == 1:
            block = (
                f"\n{SEPARATOR}\n"
                f"ファイル名 : {name}\n"
                f"フルパス   : {path}\n"
                f"{SEPARATOR}\n"
                f"{chunk}\n\n"
            )
        else:
            block = (
                f"\n{SEPARATOR}\n"
                f"ファイル名 : {name}\n"
                f"フルパス   : {path}\n"
                f"パート     : {i}/{total}\n"
                f"{SEPARATOR}\n"
                f"{chunk}\n\n"
            )
        writer.write_block(block)
    return total


def export(shard_dir: Path, output_dir: Path, max_mb: int,
           num_shards: int) -> list[Path]:
    # Copilot Studio の上限表記に合わせ SI 単位 (1MB = 1,000,000バイト) で計算
    max_bytes = max_mb * 1000 * 1000
    # 1チャンクの最大サイズ：ファイル上限から各種ヘッダ分を差し引く
    max_chunk_bytes = max_bytes - DOC_OVERHEAD_BYTES - 300

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'=' * 60}")
    print(f"  FileSearcher DB → Copilot TXT 変換")
    print(f"{'=' * 60}")
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
    split_doc_count = 0
    total_parts = 0
    t0 = time.time()
    last_print = 0.0

    try:
        for name, path, content in iter_docs(shard_dir, num_shards):
            content = (content or "").strip()
            if not content:
                skipped += 1
                continue
            parts = write_document(writer, name, path, content, max_chunk_bytes)
            if parts > 1:
                split_doc_count += 1
            total_parts += parts
            done += 1

            now = time.time()
            if now - last_print >= 0.5 or done == total_docs:
                pct = done * 100 // max(total_docs, 1)
                elapsed = now - t0
                speed = done / elapsed if elapsed > 0 else 0
                eta_s = (total_docs - done) / speed if speed > 0 else 0
                eta = (f"{eta_s/60:.0f}m{eta_s%60:.0f}s"
                       if eta_s > 60 else f"{eta_s:.0f}s")
                print(
                    f"\r  [{pct:3d}%] {done:>10,} / {total_docs:,}  "
                    f"{len(writer.output_files):>3}ファイル  "
                    f"{speed:>6.0f}件/秒  残り約 {eta}    ",
                    end="", flush=True
                )
                last_print = now
    finally:
        writer.close()

    elapsed = time.time() - t0

    print(f"\n\n{'=' * 60}")
    print(f"  変換完了")
    print(f"{'=' * 60}")
    print(f"  変換ドキュメント数 : {done:,} 件")
    if skipped:
        print(f"  スキップ(空)       : {skipped:,} 件")
    if split_doc_count:
        print(f"  パート分割した文書 : {split_doc_count:,} 件")
    print(f"  書出ブロック総数   : {total_parts:,} 個")
    print(f"  出力ファイル数     : {len(writer.output_files)} 個")
    print(f"  処理時間           : {elapsed:.1f}s  ({done/elapsed:.0f} 件/s)")
    print()

    total_size = 0
    over_limit: list[Path] = []
    for p in writer.output_files:
        try:
            sz = p.stat().st_size
            total_size += sz
            mark = "OK" if sz <= max_bytes else "OVER"
            if sz > max_bytes:
                over_limit.append(p)
            print(f"  [{mark}] {p.name}  ({sz / 1e6:.1f} MB)")
        except OSError:
            print(f"  [?]  {p.name}")
    print(f"\n  合計サイズ: {total_size / 1e9:.2f} GB")

    if over_limit:
        print(f"\nWARN: 上限超過ファイルがあります: {len(over_limit)} 個")
        for p in over_limit:
            print(f"   - {p}")
    else:
        print(f"\nOK: 全ファイル {max_mb} MB 以下を確認")

    print()
    print("  --- Copilot Studio への登録手順 ---")
    print("  1. https://copilotstudio.microsoft.com を開く")
    print("  2. 対象のエージェントを開く（なければ新規作成）")
    print("  3. [ナレッジ] -> [追加] -> [ファイル] を選択")
    print(f"  4. {output_dir} の TXT を全選択してアップロード")
    print("  5. インデックス構築完了を待って [公開]")
    print()

    return writer.output_files


def main():
    parser = argparse.ArgumentParser(
        description="FileSearcher シャードDBを Copilot 用 TXT に変換（500MB厳守版）",
    )
    parser.add_argument(
        "--shard-dir", type=Path, default=DEFAULT_SHARD_DIR, metavar="DIR",
        help=f"シャードDBフォルダ (default: {DEFAULT_SHARD_DIR})",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, metavar="DIR",
        help=f"TXT 出力フォルダ (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--max-mb", type=int, default=DEFAULT_MAX_MB, metavar="MB",
        help=f"1ファイル上限 MB (default: {DEFAULT_MAX_MB}, 厳守)",
    )
    parser.add_argument(
        "--num-shards", type=int, default=DEFAULT_NUM_SHARDS, metavar="N",
        help=f"シャード数 (default: {DEFAULT_NUM_SHARDS})",
    )
    args = parser.parse_args()

    if not args.shard_dir.exists():
        print(f"\nERROR: シャードDBフォルダが見つかりません: {args.shard_dir}")
        sys.exit(1)
    if args.max_mb < 1:
        print(f"ERROR: --max-mb は 1 以上を指定")
        sys.exit(1)

    export(args.shard_dir, args.output_dir, args.max_mb, args.num_shards)


if __name__ == "__main__":
    main()
