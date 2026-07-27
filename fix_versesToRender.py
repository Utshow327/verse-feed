import os
import re

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_rebuild = '''    // Rebuild verses list
    versesContainer.innerHTML = '';
    window.currentSavedVersesRendered = versesToRender;
    
    if (versesToRender.length > 0) {
        renderVersesList(versesToRender, versesContainer);
    } else {
        if (selectedSavedAlbum) {
            versesContainer.appendChild(header);
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.height = '40vh'; // Center vertically in remaining space
            placeholder.style.opacity = '0.6';
            placeholder.style.fontSize = '1.2rem';
            placeholder.innerText = 'No verses yet';
            versesContainer.appendChild(placeholder);
        }
    }'''

new_rebuild = '''    // Rebuild verses list
    versesContainer.innerHTML = '';
    
    let versesToRender = validVerses;
    if (selectedSavedAlbum) {
        versesToRender = albums[selectedSavedAlbum] || [];
    }
    
    window.currentSavedVersesRendered = versesToRender;
    
    if (versesToRender.length > 0) {
        renderVersesList(versesToRender, versesContainer);
    } else {
        if (selectedSavedAlbum) {
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.height = '40vh'; // Center vertically in remaining space
            placeholder.style.opacity = '0.6';
            placeholder.style.fontSize = '1.2rem';
            placeholder.innerText = 'No verses yet';
            versesContainer.appendChild(placeholder);
        }
    }'''

if old_rebuild in js:
    js = js.replace(old_rebuild, new_rebuild)
    print("Replaced successfully")
else:
    print("Not found")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print("Done")
