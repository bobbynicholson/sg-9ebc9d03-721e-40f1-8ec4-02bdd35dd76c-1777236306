@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\close-test-browsers.ps1" %*
