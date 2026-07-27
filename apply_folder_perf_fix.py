import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update loadSelectedData to only block on the first religion
old_load = '''async function loadSelectedData() {
    const relsToLoad = globalSelectedRels ? globalSelectedRels : religions;
    for (const rel of relsToLoad) {
        await loadReligionData(rel);
        await new Promise(r => setTimeout(r, 10)); // Yield to prevent startup freeze
    }
}'''

new_load = '''async function loadSelectedData() {
    const relsToLoad = globalSelectedRels ? globalSelectedRels : religions;
    if (relsToLoad.length > 0) {
        await loadReligionData(relsToLoad[0]);
    }
    
    // Load the rest asynchronously in the background so app responds instantly
    if (relsToLoad.length > 1) {
        setTimeout(async () => {
            for (let i = 1; i < relsToLoad.length; i++) {
                await loadReligionData(relsToLoad[i]);
                await new Promise(r => setTimeout(r, 100)); // Yield heavily
            }
        }, 100);
    }
}'''

if old_load in js:
    js = js.replace(old_load, new_load)
    print("Updated loadSelectedData")
else:
    print("WARN: Could not find old_load")

# 2. Update highlightSelectedVerseElement to NOT remove 'active' from the currently opened folder
old_highlight = '''    } else if (selectedVerse.type === 'folder') {
        if (el) {
            if (active) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    } else if (selectedVerse.type === 'book') {'''

new_highlight = '''    } else if (selectedVerse.type === 'folder') {
        if (el) {
            if (active) {
                el.classList.add('active');
            } else {
                if (selectedSavedAlbum !== selectedVerse.name) {
                    el.classList.remove('active');
                }
            }
        }
    } else if (selectedVerse.type === 'book') {'''

if old_highlight in js:
    js = js.replace(old_highlight, new_highlight)
    print("Updated highlightSelectedVerseElement")
else:
    print("WARN: Could not find old_highlight")


with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Bump version to v=64
html_path = os.path.join(root_dir, 'index.html')
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=63', 'script_v14.js?v=64')
html = html.replace('style_v5.css?v=63', 'style_v5.css?v=64')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=64")

www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced to www")
