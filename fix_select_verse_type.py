import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
html_path = os.path.join(root_dir, 'index.html')
js_path = os.path.join(root_dir, 'script_v14.js')

# 1. Update script_v14.js folder select call
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_select = "selectVerse({ type: 'folder', name: albumName }, 'saved', folder.id, true);"
new_select = "selectVerse({ name: albumName }, 'folder', folder.id, true);"

if old_select in js:
    js = js.replace(old_select, new_select)
    print("Fixed selectVerse call for folder")
else:
    print("WARN: Could not find old_select")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. Bump cache-buster version in index.html to v=61
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=60', 'script_v14.js?v=61')
html = html.replace('style_v5.css?v=60', 'style_v5.css?v=61')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated index.html cache busters to v=61")

# 3. Sync to www directory if it exists
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced www directory with v=61")

print("All done!")
