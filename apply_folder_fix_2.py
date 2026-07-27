import os
import re

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update deselectVerse to clean up folder state
old_deselect = '''function deselectVerse() {
    if (!selectedVerse) return;
    highlightSelectedVerseElement(false);
    selectedVerse = null;
    deactivatePillUI();
}'''

new_deselect = '''function deselectVerse() {
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

if old_deselect in js:
    js = js.replace(old_deselect, new_deselect)
    print("Updated deselectVerse")
else:
    print("WARN: Could not find old_deselect")

# 2. Update showSavedVerses folder loop & click handler
old_folder_loop = '''        let folderIdx = 0;
        for (const [albumName, verses] of Object.entries(albums)) {
            const folder = document.createElement('button');
            folder.className = 'album-square-btn album-folder-btn';
            folder.id = 'album-folder-' + (folderIdx++);
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.fontSize = '1.2rem';
            folder.innerText = albumName;
            
            if (selectedSavedAlbum === albumName) {
                folder.classList.add('active');
            }
            
            folder.onclick = () => {
                if (selectedSavedAlbum === albumName && selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === albumName) {
                    selectedSavedAlbum = null;
                    deselectVerse();
                } else {
                    selectedSavedAlbum = albumName;
                    selectVerse({ type: 'folder', name: albumName }, 'saved', folder.id);
                }
                showSavedVerses(false);
            };
            
            grid.appendChild(folder);
        }'''

new_folder_loop = '''        let folderIdx = 0;
        for (const [albumName, verses] of Object.entries(albums)) {
            const folder = document.createElement('button');
            folder.className = 'album-square-btn album-folder-btn';
            folder.id = 'album-folder-' + (folderIdx++);
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.fontSize = '1.2rem';
            folder.innerText = albumName;
            
            if ((selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === albumName) || selectedSavedAlbum === albumName) {
                folder.classList.add('active');
            }
            
            folder.onclick = (e) => {
                if (e) e.stopPropagation();
                if (selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === albumName) {
                    selectedSavedAlbum = null;
                    deselectVerse();
                } else {
                    selectedSavedAlbum = albumName;
                    selectVerse({ type: 'folder', name: albumName }, 'saved', folder.id, true);
                    showSavedVerses(false);
                }
            };
            
            grid.appendChild(folder);
        }'''

if old_folder_loop in js:
    js = js.replace(old_folder_loop, new_folder_loop)
    print("Updated showSavedVerses folder loop")
else:
    print("WARN: Could not find old_folder_loop")

# 3. Update handlePillLeftAction for folder delete
old_left_action = '''    if (selectedVerse.type === 'folder') {
        const albumName = selectedVerse.name;
        if (!albumName) return;
        
        // Remove from createdAlbums
        const albumIndex = createdAlbums.indexOf(albumName);
        if (albumIndex > -1) {
            createdAlbums.splice(albumIndex, 1);
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        }
        
        // Remove all verses in this folder
        let prevLen = savedVerses.length;
        savedVerses = savedVerses.filter(s => !(s && s.album === albumName));
        if (savedVerses.length !== prevLen) {
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        }
        
        deselectVerse();
        selectedSavedAlbum = null;
        showSavedVerses();
        showToast('Folder "' + albumName + '" deleted');
        return;
    }'''

new_left_action = '''    if (selectedVerse.type === 'folder') {
        const albumName = selectedVerse.name;
        if (!albumName) return;
        
        // Remove from createdAlbums
        const albumIndex = createdAlbums.indexOf(albumName);
        if (albumIndex > -1) {
            createdAlbums.splice(albumIndex, 1);
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        }
        
        // Remove album tag from savedVerses (or delete verses in this folder)
        savedVerses.forEach(s => {
            if (s && s.album === albumName) {
                delete s.album;
            }
        });
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        
        selectedSavedAlbum = null;
        deselectVerse();
        showSavedVerses(true);
        showToast('Folder "' + albumName + '" deleted');
        return;
    }'''

if old_left_action in js:
    js = js.replace(old_left_action, new_left_action)
    print("Updated handlePillLeftAction folder delete")
else:
    print("WARN: Could not find old_left_action")

# 4. Update handlePillPlay for folder open action
old_play = '''function handlePillPlay(e) {
    if (e) e.stopPropagation();'''

new_play = '''function handlePillPlay(e) {
    if (e) e.stopPropagation();
    if (selectedVerse && selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        showSavedVerses(false);
        showToast('Opened "' + selectedVerse.name + '"');
        return;
    }'''

if old_play in js:
    js = js.replace(old_play, new_play)
    print("Updated handlePillPlay for folder open action")
else:
    print("WARN: Could not find old_play")

# 5. Update submitRenameAlbum
old_submit_rename = '''function submitRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    if (!input || !selectedVerse || selectedVerse.type !== 'folder') return;
    
    const newName = input.value.trim();
    const oldName = selectedVerse.name;
    if (!newName || newName === oldName) {
        closeRenameModal();
        return;
    }
    
    // Update in savedVerses
    savedVerses.forEach(v => {
        if (v && v.album === oldName) v.album = newName;
    });
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    // Update in createdAlbums
    const idx = createdAlbums.indexOf(oldName);
    if (idx > -1) {
        createdAlbums[idx] = newName;
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    
    selectedSavedAlbum = newName;
    selectedVerse.name = newName;
    
    closeRenameModal();
    showSavedVerses();
    showToast('Folder renamed to "' + newName + '"');
}'''

new_submit_rename = '''function submitRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    if (!input || !selectedVerse || selectedVerse.type !== 'folder') return;
    
    const newName = input.value.trim();
    const oldName = selectedVerse.name;
    if (!newName || newName === oldName) {
        closeRenameModal();
        return;
    }
    
    // Update in savedVerses
    savedVerses.forEach(v => {
        if (v && v.album === oldName) v.album = newName;
    });
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    
    // Update in createdAlbums
    const idx = createdAlbums.indexOf(oldName);
    if (idx > -1) {
        createdAlbums[idx] = newName;
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    
    selectedSavedAlbum = newName;
    selectedVerse.name = newName;
    
    closeRenameModal();
    showSavedVerses(true);
    showToast('Folder renamed to "' + newName + '"');
}'''

if old_submit_rename in js:
    js = js.replace(old_submit_rename, new_submit_rename)
    print("Updated submitRenameAlbum")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print("Updated script_v14.js successfully")

# Update index.html for rename input Enter key
html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_rename_input = '<input type="text" id="rename-album-input" placeholder="New Name" autocomplete="off" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">'
new_rename_input = '<input type="text" id="rename-album-input" placeholder="New Name" autocomplete="off" onkeydown="if(event.key===\'Enter\') submitRenameAlbum()" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">'

if old_rename_input in html:
    html = html.replace(old_rename_input, new_rename_input)
    print("Updated index.html rename input")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Done with all updates!")
