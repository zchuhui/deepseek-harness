@echo off
cd /d "E:\Users\Administrator\AppData\Local\DeepSeek Harness\runtime"
start "instweb" /min node.exe "E:\Users\Administrator\AppData\Local\DeepSeek Harness\runtime\lib\bin.js" web --host 127.0.0.1 --port 60458 > "C:\Users\Administrator\AppData\Local\Temp\inst-web-out.txt" 2> "C:\Users\Administrator\AppData\Local\Temp\inst-web-err.txt"
