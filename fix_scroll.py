import os

html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_html = '''<div id="create-verse-album-wheel" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%;"></div>'''
new_html = '''<div id="create-verse-album-wheel" style="display:flex; position:relative; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%;"></div>'''

if old_html in html:
    html = html.replace(old_html, new_html)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print('Updated wheel position in index.html')
else:
    print('Could not find wheel html')

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Fix modal visibility before calculating offsetLeft
old_open_modal = '''function openCreateBookmarkModal() {
    const modal = document.getElementById('create-bookmark-modal');
    if (!modal) return;
    
    const wheel = document.getElementById('create-verse-album-wheel');'''

new_open_modal = '''function openCreateBookmarkModal() {
    const modal = document.getElementById('create-bookmark-modal');
    if (!modal) return;
    
    // Unhide modal early so offsetLeft calculations work correctly
    modal.classList.remove('hidden');
    setCreateModalTab('album');
    
    const wheel = document.getElementById('create-verse-album-wheel');'''

js = js.replace(old_open_modal, new_open_modal)

# Remove the late unhide
old_late_unhide = '''    setCreateModalTab('album');
    modal.classList.remove('hidden');
}'''
new_late_unhide = '''}'''
js = js.replace(old_late_unhide, new_late_unhide)

# Fix renaming logic missing createdAlbums update
old_rename = '''            const saveRename = () => {
                const newName = input.value.trim();
                if (newName && newName !== selectedSavedAlbum) {
                    savedVerses.forEach(v => {
                        if (v.album === selectedSavedAlbum) v.album = newName;
                    });
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    selectedSavedAlbum = newName;
                }
                showSavedVerses(true);
            };'''
new_rename = '''            const saveRename = () => {
                const newName = input.value.trim();
                if (newName && newName !== selectedSavedAlbum) {
                    savedVerses.forEach(v => {
                        if (v.album === selectedSavedAlbum) v.album = newName;
                    });
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    
                    const idx = createdAlbums.indexOf(selectedSavedAlbum);
                    if (idx > -1) {
                        createdAlbums[idx] = newName;
                        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
                    }
                    
                    selectedSavedAlbum = newName;
                }
                showSavedVerses(true);
            };'''
js = js.replace(old_rename, new_rename)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print('Updated script_v14.js')
