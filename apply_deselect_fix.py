import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

# 1. Update deselectVerse in script_v14.js
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_deselect = '''function deselectVerse() {
    if (!selectedVerse) return;
    const wasFolder = selectedVerse.type === 'folder';
    highlightSelectedVerseElement(false);
    selectedVerse = null;
    deactivatePillUI();
    if (wasFolder) {
        selectedSavedAlbum = null;
        showSavedVerses(false);
    }
}'''

new_deselect = '''function deselectVerse() {
    if (!selectedVerse) return;
    const wasFolder = selectedVerse.type === 'folder';
    highlightSelectedVerseElement(false);
    
    if (!wasFolder && selectedSavedAlbum) {
        selectedVerse = null;
        const folders = document.querySelectorAll('.album-folder-btn');
        let folderId = null;
        folders.forEach(f => {
            if (f.innerText === selectedSavedAlbum) {
                folderId = f.id;
            }
        });
        selectVerse({ name: selectedSavedAlbum }, 'folder', folderId, true);
        return;
    }
    
    selectedVerse = null;
    deactivatePillUI();
    if (wasFolder) {
        selectedSavedAlbum = null;
        showSavedVerses(false);
    }
}'''

if old_deselect in js:
    js = js.replace(old_deselect, new_deselect)
    print("Updated deselectVerse")
else:
    print("WARN: Could not find old_deselect")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. Update rename SVG in index.html
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_svg = '<svg class="icon-pill-rename hidden" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
new_svg = '<svg class="icon-pill-rename hidden" viewBox="0 0 24 24" width="18" height="18" stroke="none" fill="currentColor"><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'

if old_svg in html:
    html = html.replace(old_svg, new_svg)
    print("Updated SVG for rename icon")
else:
    print("WARN: Could not find old_svg")

# Bump version to v=65
html = html.replace('script_v14.js?v=64', 'script_v14.js?v=65')
html = html.replace('style_v5.css?v=64', 'style_v5.css?v=65')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=65")

# 3. Sync
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced to www")
