import os

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update handlePillLeftAction
old_left_action = '''    if (selectedVerse.type === 'saved') {
        // Delete action
        const index = savedVerses.findIndex(s => {'''
new_left_action = '''    if (selectedVerse.type === 'folder') {
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
    }
    
    if (selectedVerse.type === 'saved') {
        // Delete action
        const index = savedVerses.findIndex(s => {'''

if old_left_action in js:
    js = js.replace(old_left_action, new_left_action)
    print("Updated handlePillLeftAction")
else:
    print("WARN: Could not find old_left_action")


# 2. Update handlePillShare and add rename modal functions
old_share = '''function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    
    const text = selectedVerse.text + " - " + selectedVerse.book + " " + selectedVerse.chapter + ":" + selectedVerse.verse;
    if (navigator.share) {
        navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    }
}'''
new_share = '''function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    
    if (selectedVerse.type === 'folder') {
        const input = document.getElementById('rename-album-input');
        if (input) input.value = selectedVerse.name || '';
        const modal = document.getElementById('rename-modal');
        if (modal) {
            modal.classList.remove('hidden');
            if (input) {
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }
        return;
    }
    
    const text = selectedVerse.text + " - " + selectedVerse.book + " " + selectedVerse.chapter + ":" + selectedVerse.verse;
    if (navigator.share) {
        navigator.share({ title: 'Daily Verse', text: text }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    }
}

function closeRenameModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('rename-modal');
    if (modal) modal.classList.add('hidden');
}

function submitRenameAlbum() {
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

if old_share in js:
    js = js.replace(old_share, new_share)
    print("Updated handlePillShare and added rename functions")
else:
    print("WARN: Could not find old_share")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
print("Done updating script_v14.js")
