import os
import re

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. In showSavedVerses, remove the header code
header_code_pattern = r"const header = document\.createElement\('div'\);\s*header\.style\.padding = '10px';.*?contentDiv\.appendChild\(header\);"
js = re.sub(header_code_pattern, "", js, flags=re.DOTALL)

# 2. In renderSavedVerses, change folderDiv.onclick
old_folder_click = '''        folderDiv.onclick = (e) => {
            if (isSelectingMultiple) {
                // Not supported for folders yet
            } else {
                selectedSavedAlbum = name;
                showSavedVerses();
            }
        };'''
new_folder_click = '''        folderDiv.onclick = (e) => {
            if (isSelectingMultiple) {
                // Not supported for folders yet
            } else {
                selectVerse({ type: 'folder', name: name }, 'saved', folderDiv);
            }
        };'''
js = js.replace(old_folder_click, new_folder_click)

# 3. Update updatePillUI
old_pill_ui = '''    const bookmarkIcon = playBtn.querySelector('.icon-pill-bookmark');
    const deleteIcon = playBtn.querySelector('.icon-pill-delete');
    
    let isSaved = false;
    if (selectedVerse) {
        isSaved = savedVerses.some(s => s && s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse));
    }
    
    if (selectedVerse && (selectedVerse.type === 'saved' || isSaved)) {
        if (bookmarkIcon) bookmarkIcon.classList.add('hidden');
        if (deleteIcon) deleteIcon.classList.remove('hidden');
    } else {
        if (bookmarkIcon) bookmarkIcon.classList.remove('hidden');
        if (deleteIcon) deleteIcon.classList.add('hidden');
    }
    
    const playIcon = playBtn.querySelector('.pill-play-icon');
    if (playIcon) {
        if (isSpeaking && !isPaused) {
            playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        } else {
            playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
    }'''
new_pill_ui = '''    const bookmarkIcon = playBtn.querySelector('.icon-pill-bookmark');
    const deleteIcon = playBtn.querySelector('.icon-pill-delete');
    const shareIcon = playBtn.querySelector('.icon-pill-share');
    const renameIcon = playBtn.querySelector('.icon-pill-rename');
    const playSvg = playBtn.querySelector('.icon-pill-play-svg');
    const folderSvg = playBtn.querySelector('.icon-pill-folder-svg');
    
    let isSaved = false;
    if (selectedVerse && selectedVerse.type !== 'folder') {
        isSaved = savedVerses.some(s => s && s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse));
    }
    
    if (selectedVerse && selectedVerse.type === 'folder') {
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
js = js.replace(old_pill_ui, new_pill_ui)

# 4. Handle Pill actions
old_pill_left = '''function handlePillLeftAction(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    toggleBookmark(selectedVerse);
}'''
new_pill_left = '''function handlePillLeftAction(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    if (selectedVerse.type === 'folder') {
        savedVerses = savedVerses.filter(v => v.album !== selectedVerse.name);
        createdAlbums = createdAlbums.filter(a => a !== selectedVerse.name);
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        deselectVerse();
        renderSavedVerses();
        return;
    }
    toggleBookmark(selectedVerse);
}'''
js = js.replace(old_pill_left, new_pill_left)

old_pill_play = '''function handlePillPlay(e) {
    if (e) e.stopPropagation();
    if (isSpeaking && !isPaused) {
        pauseTTS();
    } else if (isSpeaking && isPaused) {
        resumeTTS();
    } else {
        if (selectedVerse) playTTS(selectedVerse.text);
    }
    updatePillUI();
}'''
new_pill_play = '''function handlePillPlay(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    if (selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        deselectVerse();
        showSavedVerses();
        return;
    }
    if (isSpeaking && !isPaused) {
        pauseTTS();
    } else if (isSpeaking && isPaused) {
        resumeTTS();
    } else {
        if (selectedVerse) playTTS(selectedVerse.text);
    }
    updatePillUI();
}'''
js = js.replace(old_pill_play, new_pill_play)

old_pill_share = '''function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    const text = `"${selectedVerse.text}"\n— ${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`;
    if (navigator.share) {
        navigator.share({ title: 'Verse', text: text }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    }
}'''
new_pill_share = '''function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    if (selectedVerse.type === 'folder') {
        window.folderToRename = selectedVerse.name;
        const modal = document.getElementById('rename-album-modal');
        const input = document.getElementById('rename-album-input');
        input.value = selectedVerse.name;
        modal.classList.remove('hidden');
        return;
    }
    const text = `"${selectedVerse.text}"\\n— ${selectedVerse.book} ${selectedVerse.chapter}:${selectedVerse.verse}`;
    if (navigator.share) {
        navigator.share({ title: 'Verse', text: text }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    }
}
function confirmRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    const newName = input.value.trim();
    if (newName && newName !== window.folderToRename) {
        savedVerses.forEach(v => {
            if (v.album === window.folderToRename) v.album = newName;
        });
        const idx = createdAlbums.indexOf(window.folderToRename);
        if (idx > -1) createdAlbums[idx] = newName;
        
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        
        if (selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === window.folderToRename) {
            selectedVerse.name = newName;
        }
        renderSavedVerses();
    }
    document.getElementById('rename-album-modal').classList.add('hidden');
}'''
js = js.replace(old_pill_share, new_pill_share)

# 5. Fix Album Scrollwheel to be 3D
old_open_modal_wheel = '''        const updateStyle = () => {
            const containerCenter = wheel.scrollLeft + wheel.clientWidth / 2;
            let closest = null, closestDist = Infinity;
            Array.from(wheel.children).forEach(item => {
                const itemCenter = item.offsetLeft + item.offsetWidth / 2;
                const dist = Math.abs(containerCenter - itemCenter);
                if (dist < closestDist) { closestDist = dist; closest = item; }
                item.style.opacity = '0.5';
                item.style.transform = 'scale(0.8)';
                item.style.color = 'var(--text-color)';
            });
            if (closest) {
                closest.style.opacity = '1';
                closest.style.transform = 'scale(1.1)';
                closest.style.color = 'var(--bg-grad-1)';
                window.selectedCreateVerseAlbum = closest.dataset.val;
            }
        };'''
new_open_modal_wheel = '''        const updateStyle = () => {
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
        };'''
js = js.replace(old_open_modal_wheel, new_open_modal_wheel)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print('Updated js')

# Update HTML
html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Add SVG to pill
old_pill = '''                <div class="pill-option-btn pill-btn-play" onclick="handlePillPlay(event)">
                    <span class="pill-play-icon" style="display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                    </span>
                </div>
                <div class="pill-option-btn pill-btn-share" onclick="handlePillShare(event)">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </div>'''
new_pill = '''                <div class="pill-option-btn pill-btn-play" onclick="handlePillPlay(event)">
                    <span class="pill-play-icon" style="display: flex; align-items: center; justify-content: center;">
                        <svg class="icon-pill-play-svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        <svg class="icon-pill-folder-svg hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </span>
                </div>
                <div class="pill-option-btn pill-btn-share" onclick="handlePillShare(event)">
                    <svg class="icon-pill-share" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    <svg class="icon-pill-rename hidden" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>'''
html = html.replace(old_pill, new_pill)

# Update album scrollwheel style
old_wheel_cont = '''<div id="create-verse-album-wheel-container" style="position:relative; width:100%; height:60px; overflow:hidden; border-radius:8px; border:1px solid var(--glass-border); background:var(--card-bg);">
                    <div id="create-verse-album-wheel" style="display:flex; position:relative; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%;"></div>
                </div>'''
new_wheel_cont = '''<div id="create-verse-album-wheel-container" style="position:relative; width:100%; height:60px; overflow:hidden;">
                    <div id="create-verse-album-wheel" style="display:flex; position:relative; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; height:100%; align-items:center; padding:0 33.333%; perspective:1000px;"></div>
                </div>'''
html = html.replace(old_wheel_cont, new_wheel_cont)

# Add rename modal
rename_modal = '''
    <!-- Rename Album Modal -->
    <div id="rename-album-modal" class="modal-overlay hidden" onclick="if(event.target===this) { this.classList.add('hidden'); }">
        <div class="modal-content" style="text-align: center;">
            <input type="text" id="rename-album-input" class="modern-input" placeholder="Enter new name" style="margin-bottom: 20px;">
            <button class="modern-btn" onclick="confirmRenameAlbum()">Rename</button>
        </div>
    </div>
'''
if 'id="rename-album-modal"' not in html:
    html = html.replace('</body>', rename_modal + '\n</body>')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print('Updated HTML')
