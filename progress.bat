@echo off
echo Syncing latest cloud generation from GitHub...
git pull origin main
python scripts/check_progress.py
pause
