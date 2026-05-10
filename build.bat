@echo off
REM ===========================================================
REM FileSearcher を単一exe化するためのビルドスクリプト
REM 実行: build.bat （file_searcher.py と同じフォルダで）
REM 出力: dist\FileSearcher.exe
REM ===========================================================

setlocal

echo === 依存ライブラリのインストール ===
pip install --upgrade pyinstaller
pip install -r requirements.txt
if errorlevel 1 (
    echo インストール失敗。Python と pip が動いてるか確認してください。
    pause
    exit /b 1
)

echo.
echo === 古いビルド成果物の削除 ===
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist FileSearcher.spec del /q FileSearcher.spec

echo.
echo === ビルド開始 ===
pyinstaller ^
    --onefile ^
    --windowed ^
    --name FileSearcher ^
    --collect-all openpyxl ^
    --collect-all pptx ^
    --collect-all docx ^
    --hidden-import xlrd ^
    --hidden-import olefile ^
    --hidden-import striprtf ^
    --hidden-import striprtf.striprtf ^
    --hidden-import pypdf ^
    file_searcher.py

if errorlevel 1 (
    echo.
    echo ビルド失敗。
    pause
    exit /b 1
)

echo.
echo === 完了 ===
echo dist\FileSearcher.exe が生成されました。
echo インデックスデータは C:\Users\%USERNAME%\.file_searcher\ に保存されます
echo （exe を移動・再ビルドしても引き継がれます）。

pause
