import os
import shutil
import re

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

# 1. Update saveToAlbum in script_v14.js
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_save = '''function saveToAlbum(albumName) {
    if (!pendingBookmarkVerse) return;
    
    const v = { ...pendingBookmarkVerse, album: albumName };
    savedVerses.push(v);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    closeAlbumModal();
    showSavedVerses();
    showToast('Saved to ' + albumName);
    updatePillUI();
}'''

new_save = '''function saveToAlbum(albumName) {
    if (!pendingBookmarkVerse) return;
    
    // Check if it already exists
    const existingIdx = savedVerses.findIndex(s => {
        if (s.id && pendingBookmarkVerse.id) return s.id === pendingBookmarkVerse.id;
        return s.book === pendingBookmarkVerse.book && String(s.chapter) === String(pendingBookmarkVerse.chapter) && String(s.verse) === String(pendingBookmarkVerse.verse);
    });
    
    let isSameAlbum = false;
    
    if (existingIdx > -1) {
        if (savedVerses[existingIdx].album === albumName) {
            isSameAlbum = true;
        } else {
            savedVerses[existingIdx].album = albumName;
        }
    } else {
        const v = { ...pendingBookmarkVerse, album: albumName };
        savedVerses.unshift(v);
    }
    
    if (!isSameAlbum) {
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        showToast('Saved to ' + albumName);
    }
    
    closeAlbumModal();
    if (document.getElementById('saved-verses').classList.contains('active-section')) {
        showSavedVerses(true);
    }
    updatePillUI();
}'''

if old_save in js:
    js = js.replace(old_save, new_save)
    print("Updated saveToAlbum")
else:
    print("WARN: Could not find old_save")

# 2. Update updatePillUI logic for bookmark icon
old_pill_book_feed = '''        // Book or Feed section: ALWAYS show bookmark icon, NEVER delete icon!
        if (bookmarkIcon) {
            bookmarkIcon.classList.remove('hidden');
            if (isSaved) {
                bookmarkIcon.style.fill = 'currentColor';
            } else {
                bookmarkIcon.style.fill = 'none';
            }
        }'''

new_pill_book_feed = '''        // Book or Feed section: ALWAYS show bookmark icon, NEVER delete icon!
        if (bookmarkIcon) {
            bookmarkIcon.classList.remove('hidden');
            bookmarkIcon.style.fill = 'currentColor'; // Universally filled
        }'''

if old_pill_book_feed in js:
    js = js.replace(old_pill_book_feed, new_pill_book_feed)
    print("Updated updatePillUI bookmark styling")
else:
    print("WARN: Could not find old_pill_book_feed")

# 3. Update 'All' view bookmark fill logic
old_pill_all = '''        if (!selectedSavedAlbum) {
            // "All" View: show Bookmark Icon, filled since it's already saved
            if (bookmarkIcon) {
                bookmarkIcon.classList.remove('hidden');
                bookmarkIcon.style.fill = 'currentColor';
            }'''

new_pill_all = '''        if (!selectedSavedAlbum) {
            // "All" View: show Bookmark Icon, filled
            if (bookmarkIcon) {
                bookmarkIcon.classList.remove('hidden');
                bookmarkIcon.style.fill = 'currentColor'; // Universally filled
            }'''

if old_pill_all in js:
    js = js.replace(old_pill_all, new_pill_all)
    print("Updated updatePillUI All View bookmark styling")
else:
    pass # already there basically

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 4. Update index.html
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Update bookmark icon fill
old_svg = '<svg class="icon-pill-bookmark" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2">'
new_svg = '<svg class="icon-pill-bookmark" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="currentColor" stroke-width="2">'

if old_svg in html:
    html = html.replace(old_svg, new_svg)
    print("Updated SVG fill in index.html")

# Bump version to v=63
html = html.replace('script_v14.js?v=62', 'script_v14.js?v=63')
html = html.replace('style_v5.css?v=62', 'style_v5.css?v=63')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=63")

# 5. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced to www")

print("All done!")
