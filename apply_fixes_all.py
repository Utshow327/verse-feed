import os
import re

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update selectVerse to handle folder type properly
old_select_verse = '''function selectVerse(verseObj, type, elementId, forceSelect = false) {
    const isDifferentVerse = !selectedVerse || 
                             selectedVerse.type !== type ||
                             (verseObj.id && selectedVerse.id !== verseObj.id) ||
                             (!verseObj.id && (
                                 selectedVerse.book !== verseObj.book || 
                                 String(selectedVerse.chapter) !== String(verseObj.chapter) || 
                                 String(selectedVerse.verse) !== String(verseObj.verse)
                             ));'''

new_select_verse = '''function selectVerse(verseObj, type, elementId, forceSelect = false) {
    let isDifferentVerse = false;
    if (!selectedVerse) {
        isDifferentVerse = true;
    } else if (selectedVerse.type !== type) {
        isDifferentVerse = true;
    } else if (type === 'folder' || verseObj.type === 'folder') {
        isDifferentVerse = selectedVerse.name !== verseObj.name;
    } else if (verseObj.id) {
        isDifferentVerse = selectedVerse.id !== verseObj.id;
    } else {
        isDifferentVerse = selectedVerse.book !== verseObj.book || 
                           String(selectedVerse.chapter) !== String(verseObj.chapter) || 
                           String(selectedVerse.verse) !== String(verseObj.verse);
    }'''

if old_select_verse in js:
    js = js.replace(old_select_verse, new_select_verse)
    print('Updated selectVerse isDifferentVerse logic')
else:
    print('WARN: Could not find old_select_verse')

# 2. Update highlightSelectedVerseElement for folder
old_highlight = '''    } else if (selectedVerse.type === 'book') {'''
new_highlight = '''    } else if (selectedVerse.type === 'folder') {
        if (el) {
            if (active) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        }
    } else if (selectedVerse.type === 'book') {'''

if old_highlight in js:
    js = js.replace(old_highlight, new_highlight, 1)
    print('Updated highlightSelectedVerseElement for folder')
else:
    print('WARN: Could not find old_highlight')

# 3. Update showSavedVerses to set folder.id, call selectVerse, and REMOVE header completely
old_folder_loop = '''        for (const [albumName, verses] of Object.entries(albums)) {
            const folder = document.createElement('button');
            folder.className = 'album-square-btn album-folder-btn';
            folder.style.width = 'calc(33.333% - 8px)';
            folder.style.aspectRatio = '1';
            folder.style.height = 'auto';
            folder.style.fontSize = '1.2rem';
            folder.innerText = albumName;
            
            if (selectedSavedAlbum === albumName) {
                folder.classList.add('active');
            }
            
            folder.onclick = () => {
                if (selectedSavedAlbum === albumName) {
                    selectedSavedAlbum = null;
                    folder.classList.remove('active');
                } else {
                    document.querySelectorAll('.album-folder-btn').forEach(btn => btn.classList.remove('active'));
                    selectedSavedAlbum = albumName;
                    folder.classList.add('active');
                }
                showSavedVerses(false); // Do not rebuild folders, just verses
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

if old_folder_loop in js:
    js = js.replace(old_folder_loop, new_folder_loop)
    print('Updated showSavedVerses folder loop')
else:
    print('WARN: Could not find old_folder_loop')

# Remove top folder header in showSavedVerses
show_saved_pattern = r"    versesContainer\.innerHTML = '';\s*const header = document\.createElement\('div'\);.*?window\.currentSavedVersesRendered = versesToRender;\s*if \(versesToRender\.length > 0\) \{\s*versesContainer\.appendChild\(header\);\s*renderVersesList\(versesToRender, versesContainer\);"
new_saved_verses = '''    versesContainer.innerHTML = '';
    window.currentSavedVersesRendered = versesToRender;
    
    if (versesToRender.length > 0) {
        renderVersesList(versesToRender, versesContainer);'''

js = re.sub(show_saved_pattern, new_saved_verses, js, flags=re.DOTALL)
print('Removed top folder header in showSavedVerses')

# 4. Update updatePillUI logic so Book section ALWAYS shows bookmark icon (never delete icon!)
old_update_pill = '''    if (selectedVerse && selectedVerse.type === 'folder') {
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
        
        if (shareIcon) shareIcon.classList.add('hidden');
        if (renameIcon) renameIcon.classList.remove('hidden');
        
        if (playSvg) playSvg.classList.add('hidden');
        if (folderSvg) folderSvg.classList.remove('hidden');
    } else {
        if (selectedVerse && (selectedVerse.type === 'saved' || isSaved)) {
            if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
            if (deleteIcon) deleteIcon.classList.remove('hidden');
        } else {
            if (bookmarkIcon) bookmarkIcon.classList.remove('hidden');
            if (deleteIcon) deleteIcon.classList.add('hidden');
        }
        
        if (shareIcon) shareIcon.classList.remove('hidden');
        if (renameIcon) renameIcon.classList.add('hidden');
        
        if (playSvg) playSvg.classList.remove('hidden');
        if (folderSvg) folderSvg.classList.add('hidden');
        
        if (playSvg) {
            if (isSpeaking && !isPaused) {
                playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        }
    }'''

new_update_pill = '''    if (selectedVerse && selectedVerse.type === 'folder') {
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
        
        if (shareIcon) shareIcon.classList.add('hidden');
        if (renameIcon) renameIcon.classList.remove('hidden');
        
        if (playSvg) playSvg.classList.add('hidden');
        if (folderSvg) folderSvg.classList.remove('hidden');
    } else if (selectedVerse && selectedVerse.type === 'saved') {
        // Individual saved verse in Saved tab: show delete icon
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
        
        if (shareIcon) shareIcon.classList.remove('hidden');
        if (renameIcon) renameIcon.classList.add('hidden');
        
        if (playSvg) playSvg.classList.remove('hidden');
        if (folderSvg) folderSvg.classList.add('hidden');
        
        if (playSvg) {
            if (isSpeaking && !isPaused) {
                playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        }
    } else {
        // Book or Feed section: ALWAYS show bookmark icon, NEVER delete icon!
        if (bookmarkIcon) {
            bookmarkIcon.classList.remove('hidden');
            if (isSaved) {
                bookmarkIcon.style.fill = 'currentColor';
            } else {
                bookmarkIcon.style.fill = 'none';
            }
        }
        if (deleteIcon) deleteIcon.classList.add('hidden');
        
        if (shareIcon) shareIcon.classList.remove('hidden');
        if (renameIcon) renameIcon.classList.add('hidden');
        
        if (playSvg) playSvg.classList.remove('hidden');
        if (folderSvg) folderSvg.classList.add('hidden');
        
        if (playSvg) {
            if (isSpeaking && !isPaused) {
                playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        }
    }'''

if old_update_pill in js:
    js = js.replace(old_update_pill, new_update_pill)
    print('Updated updatePillUI icon logic')
else:
    print('WARN: Could not find old_update_pill')

# 5. Pre-fill form in setCreateModalTab and trigger populateCreateVerseAlbumWheel
old_set_tab = '''function setCreateModalTab(tab) {
    const albumTab = document.getElementById('tab-create-album');
    const verseTab = document.getElementById('tab-create-verse');
    const albumForm = document.getElementById('form-create-album');
    const verseForm = document.getElementById('form-create-verse');
    
    if (tab === 'album') {
        if (albumTab) albumTab.classList.add('active');
        if (verseTab) verseTab.classList.remove('active');
        if (albumForm) albumForm.classList.remove('hidden');
        if (verseForm) verseForm.classList.add('hidden');
    } else {
        if (verseTab) verseTab.classList.add('active');
        if (albumTab) albumTab.classList.remove('active');
        if (verseForm) verseForm.classList.remove('hidden');
        if (albumForm) albumForm.classList.add('hidden');
    }
}'''

new_set_tab = '''function populateCreateVerseAlbumWheel() {
    const wheel = document.getElementById('create-verse-album-wheel');
    if (!wheel) return;
    wheel.innerHTML = '';
    
    const albums = getAlbumsGrouped();
    const albumNames = Object.keys(albums);
    if (albumNames.length === 0) albumNames.push('Default');
    
    albumNames.forEach((name, i) => {
        const item = document.createElement('div');
        item.className = 'chap-wheel-item';
        item.innerText = name;
        item.dataset.val = name;
        item.onclick = () => {
            const metrics = Array.from(wheel.children).map(el => el.offsetLeft + el.offsetWidth / 2);
            const targetScroll = metrics[i] - wheel.clientWidth / 2;
            wheel.scrollTo({ left: targetScroll, behavior: 'smooth' });
        };
        wheel.appendChild(item);
    });
    
    const updateStyle = () => {
        const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
        const items = Array.from(wheel.children);
        if (!items.length) return;
        const metrics = items.map((item) => item.offsetLeft + item.offsetWidth / 2);
        let itemWidth = items.length > 1 ? (metrics[1] - metrics[0]) : (wheel.clientWidth / 3 || 80);
        if (itemWidth === 0) itemWidth = 80;

        let closest = null, closestDist = Infinity;
        
        items.forEach((item, i) => {
            const itemCenter = metrics[i];
            const dist = itemCenter - containerCenter;
            const normDist = dist / itemWidth;
            const absNormDist = Math.abs(normDist);
            
            if (Math.abs(dist) < closestDist) {
                closestDist = Math.abs(dist);
                closest = item;
            }
            
            if (absNormDist < 1.5) {
                const opacity = 1 - absNormDist * 0.65;
                const scale = 1.15 - absNormDist * 0.3;
                const angle = normDist * 40;
                item.style.opacity = Math.max(0, opacity);
                item.style.transform = `rotateY(${-angle}deg) scale(${scale}) translateZ(0)`;
                item.style.fontWeight = absNormDist < 0.5 ? '700' : '500';
                item.style.pointerEvents = 'auto';
            } else {
                item.style.opacity = 0;
                item.style.transform = 'scale(0.1) translateZ(0)';
                item.style.pointerEvents = 'none';
            }
        });
        
        if (closest) {
            closest.style.color = 'var(--bg-grad-1)';
            window.selectedCreateVerseAlbum = closest.dataset.val;
            items.forEach(i => { if(i !== closest) i.style.color = 'var(--text-color)'; });
        }
    };
    
    wheel.onscroll = updateStyle;
    setTimeout(() => updateStyle(), 50);
}

function setCreateModalTab(tab) {
    const albumTab = document.getElementById('tab-create-album');
    const verseTab = document.getElementById('tab-create-verse');
    const albumForm = document.getElementById('form-create-album');
    const verseForm = document.getElementById('form-create-verse');
    
    if (tab === 'album') {
        if (albumTab) albumTab.classList.add('active');
        if (verseTab) verseTab.classList.remove('active');
        if (albumForm) albumForm.classList.remove('hidden');
        if (verseForm) verseForm.classList.add('hidden');
    } else {
        if (verseTab) verseTab.classList.add('active');
        if (albumTab) albumTab.classList.remove('active');
        if (verseForm) verseForm.classList.remove('hidden');
        if (albumForm) albumForm.classList.add('hidden');
        
        // Auto pre-fill if active selected verse exists
        if (selectedVerse && selectedVerse.type !== 'folder') {
            const textEl = document.getElementById('create-verse-text');
            const bookEl = document.getElementById('create-verse-book');
            const chapEl = document.getElementById('create-verse-chapter');
            const verseEl = document.getElementById('create-verse-number');
            if (textEl) textEl.value = selectedVerse.text || '';
            if (bookEl) bookEl.value = selectedVerse.book || '';
            if (chapEl) chapEl.value = selectedVerse.chapter || '';
            if (verseEl) verseEl.value = selectedVerse.verse || '';
        }
        
        populateCreateVerseAlbumWheel();
    }
}'''

if old_set_tab in js:
    js = js.replace(old_set_tab, new_set_tab)
    print('Updated setCreateModalTab and populateCreateVerseAlbumWheel')
else:
    print('WARN: Could not find old_set_tab')

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print('Updated script_v14.js successfully')

# Update index.html
html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Update placeholders and wheel container in index.html
old_verse_form = '''                <!-- Form for New Verse Bookmark -->
                <div id="form-create-verse" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
                    <textarea id="create-verse-text" placeholder="Text" rows="3" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit; resize:none;"></textarea>
                    <input type="text" id="create-verse-book" placeholder="Source" autocomplete="off" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                    <div style="display: flex; gap: 10px; width: 100%;">
                        <input type="text" id="create-verse-chapter" placeholder="Chapter (optional)" autocomplete="off" style="flex:1; min-width:0; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                        <input type="text" id="create-verse-number" placeholder="Verse (optional)" autocomplete="off" style="flex:1; min-width:0; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                    </div>
                    <div id="create-verse-album-wheel-container" style="position:relative; width:100%; height:60px; overflow:hidden; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg);">
                        <div id="create-verse-album-wheel" style="display:flex; position:relative; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%;"></div>
                    </div>
                    <button id="create-verse-submit-btn" class="album-create-btn" style="width: 100%;" onclick="submitCreateVerse()">Add Verse</button>
                </div>'''

new_verse_form = '''                <!-- Form for New Verse Bookmark -->
                <div id="form-create-verse" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
                    <textarea id="create-verse-text" placeholder="Text" rows="3" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit; resize:none;"></textarea>
                    <input type="text" id="create-verse-book" placeholder="Source" autocomplete="off" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                    <div style="display: flex; gap: 10px; width: 100%;">
                        <input type="text" id="create-verse-chapter" placeholder="Chapter" autocomplete="off" style="flex:1; min-width:0; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                        <input type="text" id="create-verse-number" placeholder="Verse" autocomplete="off" style="flex:1; min-width:0; padding:10px; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg); color:var(--text-color); font-family:inherit;">
                    </div>
                    <div id="create-verse-album-wheel-container" style="position:relative; width:100%; height:50px; overflow:hidden; perspective:1000px; margin: 10px 0;">
                        <div id="create-verse-album-wheel" style="display:flex; position:relative; overflow-x:auto; overscroll-behavior-x:none; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%; transform-style:preserve-3d;"></div>
                    </div>
                    <button id="create-verse-submit-btn" class="album-create-btn" style="width: 100%;" onclick="submitCreateVerse()">Add Verse</button>
                </div>'''

if old_verse_form in html:
    html = html.replace(old_verse_form, new_verse_form)
    print('Updated index.html verse form and wheel container')
else:
    print('WARN: Could not find old_verse_form in index.html')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print('Done applying all fixes!')
