import os

js_path = r'c:\Users\ASUS\Desktop\religion app\script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update updatePillUI
old_pill_saved = '''    } else if (selectedVerse && selectedVerse.type === 'saved') {
        // Individual saved verse in Saved tab: show delete icon
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');'''

new_pill_saved = '''    } else if (selectedVerse && selectedVerse.type === 'saved') {
        if (!selectedSavedAlbum) {
            // "All" View: show Bookmark Icon, filled since it's already saved
            if (bookmarkIcon) {
                bookmarkIcon.classList.remove('hidden');
                bookmarkIcon.style.fill = 'currentColor';
            }
            if (deleteIcon) deleteIcon.classList.add('hidden');
        } else {
            // Inside a specific folder: show Delete Icon
            if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
            if (deleteIcon) deleteIcon.classList.remove('hidden');
        }'''

if old_pill_saved in js:
    js = js.replace(old_pill_saved, new_pill_saved)
    print("Updated updatePillUI")
else:
    print("WARN: Could not find old_pill_saved")


# 2. Update handlePillLeftAction
old_left_saved = '''    if (selectedVerse.type === 'saved') {
        // Delete action
        const index = savedVerses.findIndex(s => {'''

new_left_saved = '''    if (selectedVerse.type === 'saved') {
        if (!selectedSavedAlbum) {
            // In "All" view: this is a bookmark button, open album modal
            openAlbumModal(selectedVerse);
            return;
        }
        
        // Delete action
        const index = savedVerses.findIndex(s => {'''

if old_left_saved in js:
    js = js.replace(old_left_saved, new_left_saved)
    print("Updated handlePillLeftAction")
else:
    print("WARN: Could not find old_left_saved")


# 3. Update handlePillPlay (remove toast for folder open)
old_play_folder = '''    if (selectedVerse && selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        showSavedVerses(false);
        showToast('Opened "' + selectedVerse.name + '"');
        return;
    }'''

new_play_folder = '''    if (selectedVerse && selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        showSavedVerses(false);
        return;
    }'''

if old_play_folder in js:
    js = js.replace(old_play_folder, new_play_folder)
    print("Updated handlePillPlay")
else:
    print("WARN: Could not find old_play_folder")


with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Bump script version
html_path = r'c:\Users\ASUS\Desktop\religion app\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=61', 'script_v14.js?v=62')
html = html.replace('style_v5.css?v=61', 'style_v5.css?v=62')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=62")

import shutil
www_dir = r'c:\Users\ASUS\Desktop\religion app\www'
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced to www")
