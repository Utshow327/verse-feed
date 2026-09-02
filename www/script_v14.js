function selectAppLanguage(lang) {
    if (!lang || !lang.code) return;
    const prevLang = currentAppLanguage;
    currentAppLanguage = lang.code;
    localStorage.setItem('versefeed_user_language', lang.code);
    
    // Instant live selection visual feedback
    const query = document.getElementById('lang-search-input')?.value || '';
    renderLanguageList(query);
    
    // Reload religion datasets if language switch involves native packs (Arabic, Bengali, English)
    const affectedLangs = ['ar', 'bn', 'en_US', 'en'];
    if (affectedLangs.includes(prevLang) || affectedLangs.includes(lang.code)) {
        loadedReligions.clear();
        if (religionBooks.Islam) delete religionBooks.Islam;
        if (religionBooks.Christianity) delete religionBooks.Christianity;
        loadSelectedData().then(() => {
            if (typeof showReligions === 'function') showReligions();
            if (typeof renderCurrentSection === 'function') renderCurrentSection();
        });
    }

    setTimeout(() => {
        applyLanguageTranslations(lang.code);
        closeLanguageModal();
        showToast(`Language switched to ${lang.name}`);
        
        // Refresh feed verses to reflect new language
        if (typeof renderCards === 'function') {
            renderCards();
        }
    }, 220);
}
function selectAppLanguage(lang) {
    currentAppLanguage = lang.code;
    localStorage.setItem('versefeed_user_language', lang.code);
    localStorage.setItem('user_language_selected', 'true');
    
    // Immediate visual selection update in modal
    const searchVal = document.getElementById('lang-search-input')?.value || '';
    renderLanguageList(searchVal);
    
    applyLanguageTranslations(lang.code);
    
    setTimeout(() => {
        closeLanguageModal();
    }, 220);

    if (!lang.hasVoice) {
        showToast(lang.name + ' (Text only)');
    } else {
        showToast(lang.name);
    }
}

function openLanguageModal(isFirstLaunch = false) {
    const modal = document.getElementById('language-modal');
    if (!modal) return;
    const searchInput = document.getElementById('lang-search-input');
    if (searchInput) searchInput.value = '';
    renderLanguageList('');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
}

function closeLanguageModal(e) {
    if (e) e.stopPropagation();
    const modal = document.getElementById('language-modal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 250);
}

function initLanguageSettings() {
    const saved = localStorage.getItem('versefeed_user_language') || 'en_US';
    applyLanguageTranslations(saved);
}





/* --- Album Logic --- */
let pendingBookmarkVerse = null;
let albumScrollTimeout = null;
let isDraggingAlbumWheel = false;
let isProgrammaticAlbumScroll = false;
let programmaticAlbumScrollTimeout = null;
let lastActiveAlbumIdx = -1;

function openAlbumModal(verseObj) {
    pendingBookmarkVerse = verseObj;
    const modal = document.getElementById('album-modal');
    if (!modal) return;
    populateAlbumWheel();
    openModal(modal);
}

function closeAlbumModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('album-modal'));
    pendingBookmarkVerse = null;
}

function saveToAlbum(albumName) {
    if (!pendingBookmarkVerse) return;
    
    // Check if it already exists
    const existingIdx = savedVerses.findIndex(s => {
        if (s && s.id && pendingBookmarkVerse.id) return s.id === pendingBookmarkVerse.id;
        return s && s.book === pendingBookmarkVerse.book && String(s.chapter) === String(pendingBookmarkVerse.chapter) && String(s.verse) === String(pendingBookmarkVerse.verse);
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
        if (!v.id) v.id = 'sv_' + Date.now() + '_' + Math.floor(Math.random()*100000);
        savedVerses.unshift(v);
    }
    
    if (!isSameAlbum) {
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        showToast(existingIdx > -1 ? ('Moved to ' + albumName) : ('Saved to ' + albumName));
    }
    
    closeAlbumModal();
    // Don't deselect verse in book section — keep the verse selected after bookmarking
    const isBookSection = document.getElementById('read-books') && document.getElementById('read-books').classList.contains('active-section');
    if (!isBookSection) {
        deselectVerse();
    }
    if (document.getElementById('saved-verses').classList.contains('active-section')) {
        showSavedVerses(true);
    }
    updatePillUI();
}

function getAlbumWheelItems() { return []; }
function getActiveAlbumWheelItem() { return null; }
function setupAlbumWheelListeners() {}

function populateAlbumWheel() {
    const grid = document.getElementById('album-grid');
    if (!grid) return false;
    
    // Determine current folder of pendingBookmarkVerse if saved
    let currentAlbum = null;
    if (pendingBookmarkVerse) {
        const existing = savedVerses.find(s => {
            if (!s) return false;
            if (s.id && pendingBookmarkVerse.id) return s.id === pendingBookmarkVerse.id;
            return s.book === pendingBookmarkVerse.book && 
                   String(s.chapter) === String(pendingBookmarkVerse.chapter) && 
                   String(s.verse) === String(pendingBookmarkVerse.verse);
        });
        if (existing && existing.album && existing.album !== 'Default' && existing.album !== 'All') {
            currentAlbum = existing.album;
        } else if (pendingBookmarkVerse.album && pendingBookmarkVerse.album !== 'Default' && pendingBookmarkVerse.album !== 'All') {
            currentAlbum = pendingBookmarkVerse.album;
        }
    }

    const albums = new Set();
    createdAlbums.forEach(name => {
        if (name && name !== 'Default' && name !== 'All') albums.add(name);
    });
    savedVerses.forEach(v => {
        if (v && v.album && v.album !== 'Default' && v.album !== 'All') albums.add(v.album);
    });
    
    let albumList = Array.from(albums);
    
    // Exclude currentAlbum if verse is already in that folder
    if (currentAlbum) {
        albumList = albumList.filter(name => name !== currentAlbum);
    }
    
    grid.innerHTML = '';
    
    // Show 'All' option if currently in a custom folder
    if (currentAlbum) {
        const allBtn = document.createElement('button');
        allBtn.className = 'album-create-btn';
        allBtn.style.width = '100%';
        allBtn.style.fontSize = '0.95rem';
        allBtn.innerText = 'All';
        allBtn.onclick = () => saveToAlbum('All');
        grid.appendChild(allBtn);
    }

    albumList.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'album-create-btn';
        btn.style.width = '100%';
        btn.style.fontSize = '0.95rem';
        btn.innerText = name;
        btn.onclick = () => saveToAlbum(name);
        grid.appendChild(btn);
    });
    
    return true;
}

function updateAlbumWheelActiveStyle() {}

function updateSpeakIcons() {
    updateSpeakButton('speak-general');
}

/* --- Create Bookmark / Album Modal --- */
function openCreateBookmarkModal() {
    if (createdAlbums.length >= 3 && !isPremiumUser) {
        showToast("Upgrade to Premium for unlimited folders");
        openPremiumModal();
        return;
    }
    const modal = document.getElementById('create-bookmark-modal');
    if (!modal) return;
    const input = document.getElementById('create-album-name');
    if (input) input.value = '';
    openModal(modal);
    setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeCreateBookmarkModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('create-bookmark-modal'));
}

let lastDeletedItem = null;
let undoTimeout = null;

function showDeleteToast(msg, undoCallback) {
    if (piperInitializing) return; // Do not overwrite active voice download progress
    const toast = document.getElementById('global-toast');
    const msgEl = document.getElementById('toast-message');
    const actionBtn = document.getElementById('toast-action-btn');
    const progressEl = document.getElementById('toast-progress');
    if (!toast || !msgEl) return;
    
    msgEl.textContent = msg;
    if (actionBtn) {
        actionBtn.style.display = 'inline-block';
        actionBtn.innerText = 'Undo';
        actionBtn.onclick = () => {
            clearTimeout(undoTimeout);
            toast.classList.remove('show');
            if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
            if (undoCallback) undoCallback();
        };
    }
    
    const duration = 4000;
    if (progressEl) {
        progressEl.style.transition = 'none';
        progressEl.style.transform = 'scaleX(0)';
        requestAnimationFrame(() => {
            progressEl.style.transition = `transform ${duration}ms linear`;
            progressEl.style.transform = 'scaleX(1)';
        });
    }
    
    toast.classList.add('show');
    clearTimeout(toastHideTimeout);
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        toast.classList.remove('show');
        if (progressEl) {
            setTimeout(() => {
                progressEl.style.transition = 'none';
                progressEl.style.transform = 'scaleX(0)';
            }, 200);
        }
        lastDeletedItem = null;
    }, duration);
}

function toRomanNumeral(num, max = 20) {
    if (num < 1 || num > max) return '';
    const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (num >= vals[i]) {
            result += syms[i];
            num -= vals[i];
        }
    }
    return result;
}

function sanitizeFolderName(raw) {
    const maxNum = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 49 : 9;
    const maxChars = (typeof isPremiumUser !== 'undefined' && isPremiumUser) ? 30 : 10;
    
    // Convert numbers to Roman numerals (1-9 for free, 1-49 for premium)
    let name = raw.replace(/\d+/g, (match) => {
        const num = parseInt(match, 10);
        if (num < 1 || num > maxNum) return '';
        return toRomanNumeral(num, maxNum);
    });
    // Trim and limit to max characters
    name = name.trim().substring(0, maxChars);
    return name;
}

function submitCreateAlbum() {
    const input = document.getElementById('create-album-name');
    if (!input) return;
    let name = sanitizeFolderName(input.value);
    if (!name) return;
    
    // Premium Lock: Max 3 albums for free users
    if (createdAlbums.length >= 3 && !isPremiumUser) {
        closeCreateBookmarkModal();
        openPremiumModal();
        return;
    }
    
    if (!createdAlbums.includes(name)) {
        createdAlbums.push(name);
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    
    input.value = '';
    closeCreateBookmarkModal();
    showSavedVerses();
    showToast('Folder "' + name + '" created');
}


function handleFolderDelete(e, albumName) {
    if (e) e.stopPropagation();
    const name = albumName || (selectedVerse && selectedVerse.name) || selectedSavedAlbum;
    if (!name) return;
    
    const idx = createdAlbums.indexOf(name);
    const deletedVerses = savedVerses.filter(s => s && s.album === name);
    
    if (idx > -1) {
        createdAlbums.splice(idx, 1);
        localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
    }
    savedVerses = savedVerses.filter(s => s && s.album !== name);
    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
    selectedSavedAlbum = null;
    deselectVerse();
    showSavedVerses(true);
    
    showDeleteToast('Folder deleted', () => {
        if (!createdAlbums.includes(name)) {
            createdAlbums.splice(idx > -1 ? idx : createdAlbums.length, 0, name);
            localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
        }
        deletedVerses.forEach(v => savedVerses.unshift(v));
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        showSavedVerses(true);
        showToast('Folder restored');
    });
}

function handlePillMoveFolder(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    openAlbumModal(selectedVerse);
}

function handlePillDeleteVerse(e) {
    if (e) e.stopPropagation();
    if (!selectedVerse) return;
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
    
    const index = savedVerses.findIndex(s => {
        if (s.id && selectedVerse.id) return s.id === selectedVerse.id;
        return s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse);
    });
    if (index > -1) {
        const deletedVerse = { ...savedVerses[index] };
        const deletedIndex = index;
        savedVerses.splice(index, 1);
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        if (isSpeaking && !isPaused) stopAudio(true);
        deselectVerse();
        showSavedVerses(false);
        
        showDeleteToast('Verse deleted', () => {
            savedVerses.splice(deletedIndex, 0, deletedVerse);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            showSavedVerses(false);
            showToast('Verse restored');
        });
    }
}

function deselectVerse() {
    if (!isSpeaking || isPaused) {
        stopWaveformVisualizer(false);
    }
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
}

function getVerseFolderState(verseObj) {
    if (!verseObj) return { isSaved: false, label: '', album: null };
    const v = verseObj.v || verseObj;
    const index = savedVerses.findIndex(s => {
        if (s.id && v.id) return s.id === v.id;
        return s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse);
    });
    if (index === -1) {
        return { isSaved: false, label: '', album: null };
    }
    const album = savedVerses[index].album || 'All';
    if (album === 'All' || album === 'Default') {
        return { isSaved: true, label: 'A', album: 'All' };
    }
    const customFolders = createdAlbums.filter(n => n && n !== 'Default' && n !== 'All');
    const fIdx = customFolders.indexOf(album);
    const roman = fIdx > -1 ? toRomanNumeral(fIdx + 1) : 'I';
    return { isSaved: true, label: roman || 'I', album: album };
}

function createActionIconsElement(verseObj, type) {
    const isFolder = type === 'folder' || (verseObj && verseObj.type === 'folder');
    if (isFolder) return null;

    const container = document.createElement('div');
    container.className = 'verse-actions';

    const vState = getVerseFolderState(verseObj);
    let cycleIconHtml = '';
    if (!vState.isSaved) {
        cycleIconHtml = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    } else {
        cycleIconHtml = `<span class="folder-cycle-badge">${vState.label}</span>`;
    }

    if (type === 'saved') {
        const isInsideCustomFolder = selectedSavedAlbum && selectedSavedAlbum !== 'All';
        const cycleBtnHtml = isInsideCustomFolder ? '' : `
            <button class="va-btn va-cycle-btn" onclick="cycleVerseFolder(selectedVerse, event)" aria-label="Change Folder" title="Change Folder">
                ${cycleIconHtml}
            </button>
        `;
        container.innerHTML = `
            ${cycleBtnHtml}
            <button class="va-btn" onclick="handlePillShare(event)" aria-label="Share" title="Share">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
            </button>
            <button class="va-btn" onclick="handlePillDeleteVerse(event)" aria-label="Delete Bookmark" title="Delete Bookmark">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
        `;
        return container;
    }

    // Default for Feed, Book, Search
    container.innerHTML = `
        <button class="va-btn va-cycle-btn" onclick="cycleVerseFolder(selectedVerse, event)" aria-label="Save or Change Folder" title="Save / Change Folder">
            ${cycleIconHtml}
        </button>
        <button class="va-btn" onclick="handlePillShare(event)" aria-label="Share" title="Share">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
        </button>
    `;
    return container;
}

function deactivatePillUI() {
    document.querySelectorAll('.verse-card .verse-actions, .saved-verse .verse-actions, .saved-verse-container .verse-actions, .book-verse .verse-actions, .album-square-btn .verse-actions').forEach(el => el.remove());
    document.querySelectorAll('.selected-verse-active').forEach(el => el.classList.remove('selected-verse-active'));
}

function highlightSelectedVerseElement(active) {
    deactivatePillUI();
    if (!selectedVerse) return;
    const el = document.getElementById(selectedVerse.elementId);
    
    if (selectedVerse.type === 'saved' || selectedVerse.type === 'search') {
        if (el) {
            if (active) {
                el.style.background = 'var(--text-color)';
                el.style.color = 'var(--bg-grad-1)';
                el.style.opacity = '1';
                el.style.borderColor = 'var(--text-color)';
                const t = el.querySelector('.verse-text');
                if (t) t.style.color = 'var(--bg-grad-1)';
                const r = el.querySelector('.verse-ref');
                if (r) r.style.color = 'var(--bg-grad-1)';
                
                const footer = el.querySelector('.saved-verse-footer') || el;
                const actions = createActionIconsElement(selectedVerse, selectedVerse.type);
                if (actions) footer.appendChild(actions);
            } else {
                el.style.background = '';
                el.style.color = '';
                el.style.opacity = '';
                el.style.borderColor = '';
                const t = el.querySelector('.verse-text');
                if (t) t.style.color = '';
                const r = el.querySelector('.verse-ref');
                if (r) r.style.color = '';
            }
        }
    } else if (selectedVerse.type === 'folder') {
        if (el) {
            if (active) {
                el.classList.add('active');
            } else {
                if (selectedSavedAlbum !== selectedVerse.name) {
                    el.classList.remove('active');
                }
            }
        }
    } else if (selectedVerse.type === 'book') {
        if (el) {
            if (active) {
                document.querySelectorAll('.book-verse.marked').forEach(e => e.classList.remove('marked'));
                el.classList.add('marked');
                const actions = createActionIconsElement(selectedVerse, 'book');
                if (actions) el.appendChild(actions);
            } else {
                el.classList.remove('marked');
            }
        }
    } else if (selectedVerse.type === 'feed') {
        const card = document.querySelector('.verse-card.card-center');
        if (card) {
            if (active) {
                card.style.background = 'var(--text-color)';
                card.style.color = 'var(--bg-grad-1)';
                card.style.borderColor = 'var(--text-color)';
                card.style.boxShadow = '0 0 15px rgba(var(--loader-rgb), 0.3)';
                const t = card.querySelector('.verse-text');
                if (t) t.style.color = 'var(--bg-grad-1)';
                const r = card.querySelector('.verse-ref');
                if (r) r.style.color = 'var(--bg-grad-1)';
                const f = card.querySelector('.card-footer');
                if (f) {
                    f.style.color = 'var(--bg-grad-1)';
                    const actions = createActionIconsElement(selectedVerse, 'feed');
                    if (actions) f.appendChild(actions);
                }
            } else {
                card.style.background = '';
                card.style.color = '';
                card.style.borderColor = '';
                card.style.boxShadow = '';
                const t = card.querySelector('.verse-text');
                if (t) t.style.color = '';
                const r = card.querySelector('.verse-ref');
                if (r) r.style.color = '';
                const f = card.querySelector('.card-footer');
                if (f) f.style.color = '';
            }
        }
    }
}

function updateVerseActions() {
    updateSpeakButton('speak-general');
}

function updatePillUI() {
    updateVerseActions();
}

function selectVerse(verseObj, type, elementId, forceSelect = false) {
    if (verseObj && verseObj.isAd) return;
    // Clear all existing saved verse element highlights to prevent multi-selection
    document.querySelectorAll('.saved-verse').forEach(el => {
        el.style.background = '';
        el.style.color = '';
        el.style.opacity = '';
        el.style.borderColor = '';
        const t = el.querySelector('.verse-text');
        if (t) t.style.color = '';
        const r = el.querySelector('.verse-ref');
        if (r) r.style.color = '';
    });
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
    }

    if (!forceSelect && !isDifferentVerse) {
        if (type === 'book') return; // Prevent deselection in book section
        if (isSpeaking && !isPaused) return; // Don't deselect while voice is actively playing
        deselectVerse();
        return;
    }

    highlightSelectedVerseElement(false);
    selectedVerse = { ...verseObj, type, elementId };
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(e){}
    highlightSelectedVerseElement(true);

    // Immediate play on selection ONLY if actively playing (isSpeaking is true AND isPaused is false)
    if (isSpeaking && !isPaused && isDifferentVerse && !forceSelect) {
        let isSameAsCurrentlyPlaying = false;
        if (type === 'feed' && verseBatches.general && verseBatches.general[currentVerseIndex.general]) {
            const curPlaying = verseBatches.general[currentVerseIndex.general];
            if (curPlaying.id && verseObj.id && curPlaying.id === verseObj.id) isSameAsCurrentlyPlaying = true;
            else if (curPlaying.text && verseObj.text && curPlaying.text === verseObj.text) isSameAsCurrentlyPlaying = true;
        } else if (type === 'book' && verseObj.globalIndex !== undefined && verseObj.globalIndex === bookVoiceCurrentVerse) {
            isSameAsCurrentlyPlaying = true;
        }

        if (!isSameAsCurrentlyPlaying) {
            stopAudio(true);
            if (type === 'book') {
                if (selectedVerse.globalIndex !== undefined) {
                    const targetIdx = selectedVerse.globalIndex;
                    bookVoiceCurrentVerse = targetIdx;
                    syncWheelsToCurrent();
                    scrollToBookVerse(targetIdx);
                    markVerse();
                    playBookVerse(targetIdx);
                    autoNextBook = true;
                }
            } else if (type === 'saved') {
                playText(selectedVerse.text, 'saved');
                autoMode = true;
            } else if (type === 'feed') {
                playText(selectedVerse.text, 'feed');
                autoMode = true;
            }
        }
    } else if (isSpeaking && isPaused && isDifferentVerse && !forceSelect) {
        // If voice session is paused, select/highlight it and update indices, but do NOT autoplay!
        stopAudio(true);
        if (type === 'book') {
            if (selectedVerse.globalIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.globalIndex);
                markVerse();
            }
        }
    } else {
        if (type === 'book') {
            if (selectedVerse.globalIndex !== undefined) {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                syncWheelsToCurrent();
                scrollToBookVerse(selectedVerse.globalIndex);
                markVerse();
            }
        }
    }
    updatePillUI();
}

function handlePillLeftAction(e) {
    if (e) e.stopPropagation();
    
    // Auto-select current feed or book verse if selectedVerse is null
    if (!selectedVerse) {
        const isFeed = document.getElementById('verse-feed').classList.contains('active-section');
        const isBook = document.getElementById('read-books').classList.contains('active-section');
        if (isFeed && typeof currentFeedIndex !== 'undefined' && verseBatches.general && verseBatches.general[currentFeedIndex]) {
            selectedVerse = verseBatches.general[currentFeedIndex];
        } else if (isBook && typeof currentBookObj !== 'undefined' && lastSelectedBookVerse) {
            selectedVerse = lastSelectedBookVerse;
        }
    }
    
    if (!selectedVerse) {
        openCreateBookmarkModal();
        return;
    }
    
    // Safety check just in case
    if (!Array.isArray(savedVerses)) savedVerses = [];
    
    if (selectedVerse.type === 'folder') {
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
        
        return;
    }
    
    if (selectedVerse.type === 'saved' || selectedVerse.type === 'search') {
        if (!selectedSavedAlbum) {
            // In "All" view: this is a bookmark button, open album modal
            openAlbumModal(selectedVerse);
            return;
        }
        
        // Delete action
        const index = savedVerses.findIndex(s => {
            if (s.id && selectedVerse.id) return s.id === selectedVerse.id;
            return s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse);
        });
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            
            if (isSpeaking && !isPaused) {
                stopAudio(true);
            }
            
            deselectVerse();
            activeSavedVerse = null;
            showSavedVerses(false);
            showToast('Bookmark removed');
        }
    } else {
        // Bookmark/Save action
        const index = savedVerses.findIndex(s => s.book === selectedVerse.book && String(s.chapter) === String(selectedVerse.chapter) && String(s.verse) === String(selectedVerse.verse));
        if (index > -1) {
            savedVerses.splice(index, 1);
            localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
            showToast('Bookmark removed');
        } else {
            openAlbumModal(selectedVerse);
        }
    }
    updatePillUI();
}

function handlePillPlay(e) {
    if (e) e.stopPropagation();
    if (selectedVerse && selectedVerse.type === 'folder') {
        selectedSavedAlbum = selectedVerse.name;
        showSavedVerses(false);
        return;
    }
    
    // Synchronously resume audio context on user gesture to avoid browser block
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(err => console.error("AudioContext resume failed:", err));
    }

    const isBookSection = document.getElementById('read-books').classList.contains('active-section')
        && !document.getElementById('book-content-view').classList.contains('hidden');
    const isFeedSection = document.getElementById('verse-feed').classList.contains('active-section');

    if (isGenerating) {
        console.log("Audio generating, ignoring extra clicks...");
        return;
    }

    if (isSpeaking) {
        const btn = document.getElementById('speak-general');
        if (btn) btn.classList.remove('loading');
        if (!isPaused) {
            isPaused = true;
            if (currentAudioNode) {
                try {
                    currentAudioNode.onended = null;
                    currentAudioNode.stop();
                } catch (err) { }
            }
            stopWaveformVisualizer(false);
            updateSpeakIcons();
            updatePillUI();
        } else {
            isPaused = false;
            startWaveformVisualizer();
            startAudioPlayback(0, currentGenerationId);
            updateSpeakIcons();
            updatePillUI();
        }
    } else {
        if (selectedVerse) {
            if (selectedVerse.type === 'book') {
                bookVoiceCurrentVerse = selectedVerse.globalIndex;
                markVerse();
                syncWheelsToCurrent();
                playBookVerse(bookVoiceCurrentVerse);
                autoNextBook = true;
            } else if (selectedVerse.type === 'feed') {
                playText(selectedVerse.text, 'feed');
                autoMode = false; // Only play this selected verse and stop
            } else if (selectedVerse.type === 'search') {
                let textToSpeak = selectedVerse.text;
                playText(textToSpeak, 'search');
                autoMode = true;
            } else if (selectedVerse.type === 'saved') {
                const idx = window.currentSavedVersesRendered ? window.currentSavedVersesRendered.findIndex(item => {
                    let v = item.v;
                    if (v.id && selectedVerse.id) return v.id === selectedVerse.id;
                    return v.book === selectedVerse.book && String(v.chapter) === String(selectedVerse.chapter) && String(v.verse) === String(selectedVerse.verse);
                }) : -1;
                savedVoiceCurrentIndex = idx !== -1 ? idx : 0;
                playText(selectedVerse.text, 'saved');
                autoMode = true;
            }
        } else {
            // Nothing explicitly selected, play contextual default
            if (isFeedSection) {
                const currentVerseObj = getVerseAtIndex(currentVerseIndex.general);
                if (currentVerseObj) {
                    if (currentVerseObj.isAd) {
                        if (!currentVerseObj.funnyLine) {
                            currentVerseObj.funnyLine = getNextFunnyLine();
                        }
                        const adSpokenText = "VerseFeed Premium. " + currentVerseObj.funnyLine;
                        playText(adSpokenText, 'feed');
                        autoMode = true;
                    } else {
                        let spokenText = currentVerseObj.spoken_text || currentVerseObj.text || '';
                        if (spokenText) {
                            if (!spokenText.endsWith('.')) spokenText += '.';
                            if (ttsAnnounceSource && currentVerseObj.book) {
                                spokenText += '. ' + currentVerseObj.book + '.';
                            }
                            playText(spokenText, 'feed');
                            autoMode = true; // Auto advance to next verse
                        }
                    }
                }
            } else if (isBookSection) {
                playBookVerse(bookVoiceCurrentVerse || 0);
                autoNextBook = true;
            }
        }
        updatePillUI();
    }
}

function cycleVerseFolder(verseObj, e) {
    if (e) e.stopPropagation();
    const v = verseObj ? (verseObj.v || verseObj) : (selectedVerse ? (selectedVerse.v || selectedVerse) : getCurrentActiveVerse() || getVerseAtIndex(currentVerseIndex.general));
    if (!v) return;

    if (typeof playScrollSound === 'function') {
        try { playScrollSound(); } catch(err){}
    } else if (typeof playTapSound === 'function') {
        try { playTapSound(); } catch(err){}
    }

    const isSavedSection = (verseObj && verseObj.type === 'saved') || (selectedVerse && selectedVerse.type === 'saved') || (document.getElementById('saved-verses') && document.getElementById('saved-verses').classList.contains('active-section'));

    const customFolders = createdAlbums.filter(n => n && n !== 'Default' && n !== 'All');
    const index = savedVerses.findIndex(s => {
        if (s.id && v.id) return s.id === v.id;
        return s.book === v.book && String(s.chapter) === String(v.chapter) && String(s.verse) === String(v.verse);
    });

    if (index === -1) {
        // Currently unsaved -> Save to 'All'
        const newSaved = {
            book: v.book,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
            translation: v.translation || '',
            album: 'All',
            timestamp: Date.now(),
            id: v.id || `${v.book}_${v.chapter}_${v.verse}_${Date.now()}`
        };
        savedVerses.unshift(newSaved);
        localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
        triggerCloudSync();
        showToast('Saved to Bookmarks (All)');
    } else {
        const currentAlbum = savedVerses[index].album || 'All';
        if (currentAlbum === 'All' || currentAlbum === 'Default') {
            if (customFolders.length > 0) {
                // Move to 1st custom folder (Roman I)
                const nextFolder = customFolders[0];
                savedVerses[index].album = nextFolder;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                triggerCloudSync();
                showToast(`Moved to ${nextFolder} (I)`);
            } else {
                if (isSavedSection) {
                    showToast('In Bookmarks (All)');
                } else {
                    // Loop back to unsaved in Feed/Book/Search
                    savedVerses.splice(index, 1);
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Bookmark removed');
                }
            }
        } else {
            const curFolderIdx = customFolders.indexOf(currentAlbum);
            if (curFolderIdx > -1 && curFolderIdx + 1 < customFolders.length) {
                // Move to next custom folder (II, III...)
                const nextFolder = customFolders[curFolderIdx + 1];
                savedVerses[index].album = nextFolder;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                triggerCloudSync();
                showToast(`Moved to ${nextFolder} (${toRomanNumeral(curFolderIdx + 2)})`);
            } else {
                if (isSavedSection) {
                    // In Bookmark section: Loop back to 'All'
                    savedVerses[index].album = 'All';
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Moved to Bookmarks (All)');
                } else {
                    // In Feed/Book/Search: Loop back to unsaved
                    savedVerses.splice(index, 1);
                    localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                    triggerCloudSync();
                    showToast('Bookmark removed');
                }
            }
        }
    }

    if (typeof showSavedVerses === 'function') showSavedVerses(false);
    updatePillUI();
    if (selectedVerse) highlightSelectedVerseElement(true);
}

function handlePillBookmark(e) {
    cycleVerseFolder(selectedVerse, e);
}

function handlePillShare(e) {
    if (e) e.stopPropagation();
    if (typeof playScrollSound === 'function') try { playScrollSound(); } catch(err){}
    const verseToShare = selectedVerse || getCurrentActiveVerse() || getVerseAtIndex(currentVerseIndex.general);
    if (!verseToShare) return;
    
    if (verseToShare.type === 'folder') {
        const input = document.getElementById('rename-album-input');
        if (input) input.value = verseToShare.name || '';
        const modal = document.getElementById('rename-modal');
        if (modal) {
            openModal(modal);
            if (input) {
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }
        return;
    }
    
    generateAndShareImage(verseToShare, verseToShare.elementId);
}

function formatVerseForShare(verseObj) {
    if (!verseObj) return '';
    const text = (verseObj.text || '').replace(/<[^>]*>?/gm, '').trim();
    let ref = formatVerseRef(verseObj);
    ref = ref.replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').replace(/^- /, '').trim();
    return `${text}\n\n${ref}\n\nVerseFeed`;
}

async function shareTextFallback(text) {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
            try {
                await window.Capacitor.Plugins.Share.share({ title: 'VerseFeed', text: text, dialogTitle: 'Share Verse' });
            } catch (shareErr) {
                if (shareErr && (shareErr.message || '').toLowerCase().includes('cancel')) return;
                if (shareErr && (shareErr.message || '').toLowerCase().includes('dismiss')) return;
                throw shareErr;
            }
            return;
        }
        if (navigator.share) {
            await navigator.share({ title: 'VerseFeed', text: text });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast('Verse copied');
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Verse copied');
        }
    } catch (e) {
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                showToast('Verse copied');
            }
        } catch (e2) {
            showToast('Could not share');
        }
    }
}

function drawVersePosterToCanvas(verseObj, isDark) {
    const canvas = document.createElement('canvas');
    const width = 1080;
    const height = 1080;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Background gradient (clean borderless poster)
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (isDark) {
        grad.addColorStop(0, '#1F1D1B');
        grad.addColorStop(1, '#141210');
    } else {
        grad.addColorStop(0, '#C8B8A6');
        grad.addColorStop(1, '#A99684');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    
    // Verse Text
    let rawText = verseObj.text || '';
    rawText = rawText.replace(/<span class='author-attr'>.*?<\/span>/gm, '');
    rawText = rawText.replace(/<[^>]*>?/gm, '').trim();
    
    ctx.fillStyle = isDark ? '#f7e7ce' : '#1E1D1B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let fontSize = rawText.length > 200 ? 36 : (rawText.length > 120 ? 44 : (rawText.length > 60 ? 52 : 58));
    ctx.font = `600 ${fontSize}px "Times New Roman", serif`;
    
    const maxWidth = 880;
    const words = rawText.split(' ');
    let lines = [];
    let currentLine = '';
    
    for (let word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    
    const lineHeight = fontSize * 1.48;
    const totalTextHeight = lines.length * lineHeight;
    let startY = (height / 2) - (totalTextHeight / 2) - 40;
    
    lines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, startY + (idx * lineHeight));
    });
    
    // Source Reference (No brackets)
    let ref = formatVerseRef(verseObj);
    ref = ref.replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').replace(/^- /, '').trim();
    ctx.font = `400 32px "Times New Roman", serif`;
    ctx.fillStyle = isDark ? 'rgba(247, 231, 206, 0.85)' : 'rgba(30, 29, 27, 0.85)';
    ctx.fillText(ref, width / 2, startY + totalTextHeight + 50);
    
    // Branding with clean space
    ctx.font = `500 24px "Times New Roman", serif`;
    ctx.fillStyle = isDark ? 'rgba(247, 231, 206, 0.45)' : 'rgba(30, 29, 27, 0.45)';
    ctx.fillText('VerseFeed', width / 2, startY + totalTextHeight + 110);
    
    return canvas;
}

async function generateAndShareImage(verseObj, elementId) {
    if (!verseObj) return;
    
    try {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const canvas = drawVersePosterToCanvas(verseObj, isDark);
        const text = formatVerseForShare(verseObj);
        
        // 1. Native Capacitor with @capacitor/filesystem and @capacitor/share
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (isNative && window.Capacitor.Plugins) {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            if (Filesystem && Share) {
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                    const fileName = `verse_${Date.now()}.png`;
                    
                    await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: 'CACHE'
                    });
                    
                    const uriRes = await Filesystem.getUri({
                        path: fileName,
                        directory: 'CACHE'
                    });
                    
                    if (uriRes && uriRes.uri) {
                        await Share.share({
                            title: 'VerseFeed',
                            text: text,
                            files: [uriRes.uri],
                            dialogTitle: 'Share Verse'
                        });
                        return;
                    }
                } catch (nativeShareErr) {
                    console.warn('Native Filesystem/Share error:', nativeShareErr);
                }
            }
        }
        
        // 2. Web / Browser Share API with image file
        canvas.toBlob(async (blob) => {
            if (!blob) {
                await shareTextFallback(text);
                return;
            }
            
            try {
                const file = new File([blob], 'versefeed_share.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Daily Verse',
                        text: text
                    });
                    return;
                }
            } catch (fileShareErr) {
                console.warn('Navigator file share error:', fileShareErr);
            }
            
            // 3. Fallback: Direct image download
            try {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = 'versefeed_share.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('Image downloaded');
                return;
            } catch (dlErr) {
                console.warn('Download fallback error:', dlErr);
            }
            
            await shareTextFallback(text);
        }, 'image/png');
    } catch (e) {
        console.error('Error generating image poster:', e);
        const text = formatVerseForShare(verseObj);
        await shareTextFallback(text);
    }
}

function closeRenameModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('rename-modal'));
}

let renamingAlbumName = null;

function openRenameAlbumModal(albumName) {
    renamingAlbumName = albumName;
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-album-input');
    if (!modal || !input) return;
    input.value = albumName || '';
    openModal(modal);
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

function submitRenameAlbum() {
    const input = document.getElementById('rename-album-input');
    const oldName = renamingAlbumName || (selectedVerse && selectedVerse.type === 'folder' ? selectedVerse.name : null);
    if (!input || !oldName) return;
    
    let newName = sanitizeFolderName(input.value);
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
    
    if (selectedSavedAlbum === oldName) selectedSavedAlbum = newName;
    if (selectedVerse && selectedVerse.type === 'folder' && selectedVerse.name === oldName) {
        selectedVerse.name = newName;
    }
    
    closeRenameModal();
    showSavedVerses(true);
    showToast('Folder renamed to "' + newName + '"');
}

function confirmRenameAlbum() { submitRenameAlbum(); }


// ==============================================
// FIREBASE AUTHENTICATION & FIRESTORE CLOUD SYNC
// ==============================================

function applyUserAuthSuccess(user) {
    if (!user) return;
    
    const savedName = localStorage.getItem('nameForSignUp');
    if (savedName && user.updateProfile) {
        user.updateProfile({ displayName: savedName }).then(() => {
            localStorage.removeItem('nameForSignUp');
        }).catch(() => {});
        try { Object.defineProperty(user, 'displayName', { value: savedName, writable: true }); } catch(e){}
    }

    const nameToUse = savedName || user.displayName || user.email || 'User';
    const localAvatar = localStorage.getItem('customUserAvatar_' + user.uid);
    googleUser = {
        name: nameToUse,
        picture: localAvatar || user.photoURL || '',
        email: user.email || '',
        sub: user.uid
    };
    try { originalSetItem.call(localStorage, 'googleUser', JSON.stringify(googleUser)); } catch(e){}
    
    switchProfile('account_' + user.uid);
    loadUserDataFromFirestore(user.uid);
    
    if (document.getElementById('onboarding') && document.getElementById('onboarding').classList.contains('active-section')) {
        goTo('verse-feed');
    }
    closeEmailAuthModal();
    closeEmailVerifyModal();
    updateUserUI();
}

function initFirebaseAuth() {
    if (typeof firebase === 'undefined') return;
    
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
        } catch(e) {
            console.error("Firebase init error:", e);
        }
    }
    
    if (firebase.apps.length) {
        db = firebase.firestore();
        
        // Handle Google Sign-In redirect return
        if (firebase.auth().getRedirectResult) {
            firebase.auth().getRedirectResult().then((result) => {
                if (result && result.user) {
                    showToast("Signed in as " + (result.user.displayName || result.user.email || 'User'));
                    applyUserAuthSuccess(result.user);
                }
            }).catch((error) => {
                if (error && error.code !== 'auth/null-user') {
                    console.error("Redirect auth error:", error);
                }
            });
        }

        // Handle Email Link Verification & Reclaiming Account
        if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
            let email = window.localStorage.getItem('emailForSignIn');
            if (!email) {
                email = window.prompt('Please confirm your email address for verification:');
            }
            if (email) {
                showToast("Verifying email...");
                firebase.auth().signInWithEmailLink(email, window.location.href)
                    .then((result) => {
                        window.localStorage.removeItem('emailForSignIn');
                        const savedName = window.localStorage.getItem('nameForSignUp');
                        const savedPass = window.localStorage.getItem('passwordToSetOnVerify');
                        
                        const tasks = [];
                        if (savedName && result.user && result.user.updateProfile) {
                            tasks.push(result.user.updateProfile({ displayName: savedName }));
                        }
                        if (savedPass && result.user && result.user.updatePassword) {
                            tasks.push(result.user.updatePassword(savedPass));
                        }

                        Promise.all(tasks).finally(() => {
                            window.localStorage.removeItem('nameForSignUp');
                            window.localStorage.removeItem('passwordToSetOnVerify');
                            if (window.history && window.history.replaceState) {
                                window.history.replaceState({}, document.title, window.location.pathname);
                            }
                            showToast("Email verified!");
                            applyUserAuthSuccess(result.user);
                        });
                    })
                    .catch((error) => {
                        console.error("Sign in with email link error:", error);
                        showToast("Link expired or invalid");
                    });
            }
        }

        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                const isPasswordUser = user.providerData && user.providerData.some(p => p.providerId === 'password');
                if (isPasswordUser && !user.emailVerified) {
                    googleUser = null;
                    try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
                    switchProfile('guest');
                    updateUserUI();
                    showEmailVerifyModal(user.email);
                } else {
                    applyUserAuthSuccess(user);
                }
            } else {
                googleUser = null;
                try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
                switchProfile('guest');
                closeEmailVerifyModal();
                updateUserUI();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initFirebaseAuth();
});

let resendTimerInterval = null;

function updateResendTimerUI() {
    const btn = document.getElementById('resend-verify-btn');
    if (!btn) return;
    
    const lastResendTime = localStorage.getItem('verification_resend_time');
    if (!lastResendTime) {
        btn.disabled = false;
        btn.innerText = "Resend Email";
        btn.style.opacity = "1";
        return;
    }
    
    const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
    const now = Date.now();
    const elapsed = now - parseInt(lastResendTime);
    
    if (elapsed >= COOLDOWN_MS) {
        localStorage.removeItem('verification_resend_time');
        btn.disabled = false;
        btn.innerText = "Resend Email";
        btn.style.opacity = "1";
        if (resendTimerInterval) {
            clearInterval(resendTimerInterval);
            resendTimerInterval = null;
        }
    } else {
        const remaining = COOLDOWN_MS - elapsed;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        btn.disabled = true;
        btn.innerText = `Resend Email (${minutes}:${seconds.toString().padStart(2, '0')})`;
        btn.style.opacity = "0.5";
        
        if (!resendTimerInterval) {
            resendTimerInterval = setInterval(updateResendTimerUI, 1000);
        }
    }
}

function showEmailVerifyModal(email) {
    const modal = document.getElementById('email-verify-modal');
    const emailEl = document.getElementById('verify-modal-email');
    if (emailEl) emailEl.innerText = email || '';
    
    // Automatically start 3-minute resend timer when verify email pop-up first appears
    if (!localStorage.getItem('verification_resend_time')) {
        localStorage.setItem('verification_resend_time', Date.now());
    }
    
    if (modal) {
        openModal(modal);
        updateResendTimerUI();
    }
}

function closeEmailVerifyModal() {
    closeModal(document.getElementById('email-verify-modal'));
    if (resendTimerInterval) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
    }
}

function checkEmailVerification() {
    const user = firebase.auth().currentUser;
    const errorEl = document.getElementById('verify-error-msg');
    if (errorEl) errorEl.innerText = "";
    
    if (!user) {
        showToast("Please sign in");
        closeEmailVerifyModal();
        return;
    }
    user.reload().then(() => {
        if (user.emailVerified) {
            showToast("Email verified!");
            applyUserAuthSuccess(user);
        } else {
            if (errorEl) {
                errorEl.innerText = "Email not verified yet. Please check your inbox.";
            } else {
                showToast("Email not verified yet");
            }
        }
    }).catch(err => {
        console.error("Reload user error:", err);
        if (errorEl) {
            errorEl.innerText = "Failed to verify. Please try again.";
        }
    });
}

function resendVerificationEmail() {
    const user = firebase.auth().currentUser;
    const errorEl = document.getElementById('verify-error-msg');
    if (errorEl) errorEl.innerText = "";
    
    if (!user) return;
    
    const btn = document.getElementById('resend-verify-btn');
    if (btn && btn.disabled) return;
    
    showToast("Sending email...");
    
    // Dispatch via zero-spam Gmail SMTP
    sendCustomAuthEmail({
        email: user.email,
        type: 'verify-email',
        name: user.displayName || 'Friend'
    }).catch(() => {});

    user.sendEmailVerification().then(() => {
        showToast("Email sent! Check inbox");
        if (errorEl) errorEl.innerText = "Email sent! Check your inbox.";
        localStorage.setItem('verification_resend_time', Date.now());
        updateResendTimerUI();
    }).catch(err => {
        console.error("Resend verification error:", err);
        let msg = "Failed to send email.";
        if (err && err.code === 'auth/too-many-requests') {
            msg = "Too many requests. Please wait.";
            localStorage.setItem('verification_resend_time', Date.now());
            updateResendTimerUI();
        } else if (err && err.message) {
            msg = err.message;
        }
        if (errorEl) {
            errorEl.innerText = msg;
        } else {
            showToast(msg);
        }
    });
}

function enableNameEditMode() {
    const nameEl = document.getElementById('user-modal-name');
    if (!nameEl || nameEl.isEditing) return;
    
    const currentName = nameEl.innerText.trim();
    nameEl.isEditing = true;
    
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.id = 'inline-name-input';
    inputEl.value = currentName;
    inputEl.style.cssText = 'font-size: 1.2rem; font-family: var(--font-main); color: var(--text-color); background: rgba(0,0,0,0.1); border: 1px solid var(--accent); border-radius: 6px; padding: 2px 8px; text-align: center; width: 100%; box-sizing: border-box; outline: none;';
    nameEl.innerHTML = '';
    nameEl.appendChild(inputEl);
    inputEl.focus();
    inputEl.setSelectionRange(0, inputEl.value.length);
    
    const saveFn = () => {
        if (!nameEl.isEditing) return;
        nameEl.isEditing = false;
        
        let newName = inputEl.value.replace(/[^A-Za-z\s]/g, '').trim();
        if (!newName) {
            newName = currentName;
            showToast("Letters only (A-Z)");
        }
        
        nameEl.innerHTML = '';
        nameEl.innerText = newName;
        
        if (newName !== currentName) {
            const user = firebase.auth().currentUser;
            if (user) {
                showToast("Updating name...");
                user.updateProfile({ displayName: newName }).then(() => {
                    applyUserAuthSuccess(user);
                    showToast("Name updated");
                }).catch(err => {
                    console.error("Name update error:", err);
                    showToast("Update failed");
                    nameEl.innerText = currentName;
                });
            }
        }
    };
    
    inputEl.addEventListener('blur', saveFn);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveFn();
        else if (e.key === 'Escape') {
            nameEl.isEditing = false;
            nameEl.innerHTML = '';
            nameEl.innerText = currentName;
        }
    });
}

function cancelEmailVerification() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
    }
    closeEmailVerifyModal();
}

let currentAuthMode = 'signin';

function openEmailAuthModal(tab = 'signin') {
    switchAuthTab(tab);
    openModal(document.getElementById('email-auth-modal'));
}

function closeEmailAuthModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('email-auth-modal'));
    clearAuthErrorMsg();
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    clearAuthErrorMsg();
    const btnSignin = document.getElementById('auth-tab-signin');
    const btnSignup = document.getElementById('auth-tab-signup');
    const nameContainer = document.getElementById('auth-name-container');
    const confirmContainer = document.getElementById('auth-confirm-container');
    const googleContainer = document.getElementById('auth-google-container');
    const submitBtn = document.getElementById('auth-submit-btn');
    const forgotContainer = document.getElementById('auth-forgot-password-container');

    if (mode === 'signin') {
        if (btnSignin) btnSignin.classList.add('active');
        if (btnSignup) btnSignup.classList.remove('active');
        if (nameContainer) nameContainer.style.display = 'none';
        if (confirmContainer) confirmContainer.style.display = 'none';
        if (googleContainer) googleContainer.style.display = 'flex';
        if (forgotContainer) forgotContainer.style.display = 'block';
        if (submitBtn) submitBtn.innerText = 'Sign In';
    } else {
        if (btnSignup) btnSignup.classList.add('active');
        if (btnSignin) btnSignin.classList.remove('active');
        if (nameContainer) nameContainer.style.display = 'flex';
        if (confirmContainer) confirmContainer.style.display = 'flex';
        if (googleContainer) googleContainer.style.display = 'none';
        if (forgotContainer) forgotContainer.style.display = 'none';
        if (submitBtn) submitBtn.innerText = 'Sign Up';
    }
}

function showAuthErrorMsg(msg, isInfo = false) {
    const errorEl = document.getElementById('auth-error-msg');
    if (errorEl) {
        errorEl.innerText = msg || '';
        errorEl.style.color = isInfo ? 'var(--accent)' : '#ff4757';
    }
}

function formatFirebaseAuthError(error) {
    if (!error) return "An error occurred. Please try again.";
    const code = error.code || '';
    const message = error.message || '';

    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
            return "Incorrect email or password. Please check your details.";
        case 'auth/user-not-found':
            return "No account found with this email. Switch to Sign Up above.";
        case 'auth/email-already-in-use':
            return "An account already exists with this email. If this is your email, switch to Sign In & click 'Forgot Password'.";
        case 'auth/invalid-email':
            return "Please enter a valid email address.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters long.";
        case 'auth/too-many-requests':
            return "Too many failed attempts. Please wait a moment and try again.";
        case 'auth/network-request-failed':
            return "Network error. Please check your internet connection.";
        case 'auth/user-disabled':
            return "This user account has been disabled.";
        default:
            return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/i, '') || "Authentication error.";
    }
}

function clearAuthErrorMsg() {
    showAuthErrorMsg('');
}

function submitAuthForm() {
    if (currentAuthMode === 'signin') {
        handleEmailSignIn();
    } else {
        handleEmailSignUp();
    }
}

function handleEmailSignIn() {
    clearAuthErrorMsg();
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    if (!emailEl || !passEl) return;
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) {
        showAuthErrorMsg("Please enter email and password");
        return;
    }
    showAuthErrorMsg("Signing in...", true);
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((result) => {
            if (result && result.user) {
                if (!result.user.emailVerified) {
                    closeEmailAuthModal();
                    showEmailVerifyModal(result.user.email);
                    showToast("Please verify email");
                } else {
                    applyUserAuthSuccess(result.user);
                    showToast("Signed in");
                }
            }
        })
        .catch((error) => {
            console.error("Email Sign In Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

async function sendCustomAuthEmail(payload) {
    if (window.AppSigner && typeof window.AppSigner.sendAuthEmail === 'function') {
        try {
            window.AppSigner.sendAuthEmail(
                payload.email || '',
                payload.type || '',
                payload.name || '',
                payload.code || '',
                payload.actionUrl || ''
            );
            return { success: true, native: true };
        } catch(nativeErr) {
            console.warn("Native SMTP bridge error:", nativeErr);
        }
    }

    try {
        const response = await fetch('/.netlify/functions/send-auth-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn("Custom email delivery fallback:", e);
    }
    return null;
}

function resetPassword() {
    clearAuthErrorMsg();
    const emailEl = document.getElementById('auth-email');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
        showAuthErrorMsg("Please enter your email to reset password.");
        return;
    }
    showAuthErrorMsg("Sending reset link...", true);
    
    // Send via custom zero-spam Gmail SMTP if available, with native Firebase fallback
    sendCustomAuthEmail({
        email: email,
        type: 'reset-password'
    }).catch(() => {});

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            showAuthErrorMsg("Password reset link sent! Check your inbox.", true);
        })
        .catch((error) => {
            console.error("Reset Password Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

function handleEmailSignUp() {
    clearAuthErrorMsg();
    const nameEl = document.getElementById('auth-name');
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const confirmPassEl = document.getElementById('auth-confirm-password');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passEl ? passEl.value : '';
    const confirmPassword = confirmPassEl ? confirmPassEl.value : '';

    if (!name) { showAuthErrorMsg("Please enter your name"); return; }
    if (!email || !password) { showAuthErrorMsg("Please enter email & password"); return; }
    if (password.length < 6) { showAuthErrorMsg("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { showAuthErrorMsg("Passwords do not match"); return; }

    showAuthErrorMsg("Creating account...", true);

    window.localStorage.setItem('emailForSignIn', email);
    if (name) window.localStorage.setItem('nameForSignUp', name);
    if (password) window.localStorage.setItem('passwordToSetOnVerify', password);

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((result) => {
            if (result && result.user) {
                if (name && result.user.updateProfile) {
                    result.user.updateProfile({ displayName: name }).catch(() => {});
                }
                // Send luxury zero-spam verification email via Gmail SMTP
                sendCustomAuthEmail({
                    email: email,
                    type: 'verify-email',
                    name: name
                }).catch(() => {});

                result.user.sendEmailVerification().then(() => {
                    localStorage.setItem('verification_resend_time', Date.now());
                    closeEmailAuthModal();
                    showEmailVerifyModal(email);
                }).catch((err) => {
                    console.error("Error sending email verification:", err);
                    localStorage.setItem('verification_resend_time', Date.now());
                    closeEmailAuthModal();
                    showEmailVerifyModal(email);
                });
            }
        })
        .catch((error) => {
            console.error("Email Sign Up Error:", error);
            showAuthErrorMsg(formatFirebaseAuthError(error));
        });
}

let isGooglePopupOpen = false;

function toggleGoogleAuth() {
    const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (googleUser || user) {
        openUserProfileModal();
    } else {
        openEmailAuthModal('signin');
    }
}

async function signInWithGoogle() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        showToast("Firebase loading, please try again in a moment...");
        return;
    }
    
    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    
    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
        const FA = window.Capacitor.Plugins.FirebaseAuthentication;
        
        async function processNativeResult(res) {
            if (!res) return false;
            const idToken = (res.credential && res.credential.idToken) || res.idToken || (res.user && res.user.idToken);
            if (idToken) {
                const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
                const userCred = await firebase.auth().signInWithCredential(cred);
                applyUserAuthSuccess(userCred.user);
            } else if (res.user) {
                applyUserAuthSuccess({
                    uid: res.user.uid,
                    displayName: res.user.displayName || res.user.name,
                    email: res.user.email,
                    photoURL: res.user.photoUrl
                });
            } else {
                return false;
            }
            closeEmailAuthModal();
            showToast("Signed in as " + ((res.user && (res.user.displayName || res.user.name)) || (res.user && res.user.email) || 'User'));
            return true;
        }
        
        function isCancelError(errStr) {
            return errStr.includes('12501') || errStr.includes('cancel') || errStr.includes('dismiss') || errStr.includes('closed');
        }
        
        function isError10(errStr) {
            return errStr.includes('10:') || errStr.includes('developer_error') || errStr.includes('apiexception: 10');
        }
        
        // Attempt 1: Legacy GoogleSignIn (useCredentialManager: false)
        try {
            showToast("Signing in with Google...");
            await FA.signOut().catch(() => {});
            const res = await FA.signInWithGoogle({ useCredentialManager: false, skipNativeAuth: true });
            if (await processNativeResult(res)) return;
        } catch (err1) {
            console.error("Legacy GoogleSignIn Error:", JSON.stringify(err1), err1);
            const errStr1 = (err1 && (err1.message || err1.code || JSON.stringify(err1) || String(err1))).toLowerCase();
            if (isCancelError(errStr1)) return;
            
            if (isError10(errStr1)) {
                // Attempt 2: Credential Manager (useCredentialManager: true)
                try {
                    console.log("Legacy failed with error 10, trying Credential Manager...");
                    const res2 = await FA.signInWithGoogle({ useCredentialManager: true, skipNativeAuth: true });
                    if (await processNativeResult(res2)) return;
                } catch (err2) {
                    console.error("Credential Manager Error:", JSON.stringify(err2), err2);
                    const errStr2 = (err2 && (err2.message || err2.code || JSON.stringify(err2) || String(err2))).toLowerCase();
                    if (isCancelError(errStr2)) return;
                }
                
                showToast("Sign in failed. Please check your internet connection.");
                return;
            }
            
            showToast("Google Login Error: " + (err1.message || "Failed"));
            return;
        }
    }
    
    // Web / Popup Fallback (Only runs if NOT native)
    try {
        isGooglePopupOpen = true;
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await firebase.auth().signInWithPopup(provider);
        if (result && result.user) {
            applyUserAuthSuccess(result.user);
            closeEmailAuthModal();
            showToast("Signed in successfully!");
        }
    } catch (error) {
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return;
        }
        console.error("Google Sign In Error:", error);
        showToast("Sign in error: " + (error ? (error.message || "Failed") : "Failed"));
    } finally {
        isGooglePopupOpen = false;
    }
}

function sanitizeForFirestore(obj) {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForFirestore).filter(v => v !== undefined);
    }
    const cleaned = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val !== undefined) {
            cleaned[key] = sanitizeForFirestore(val);
        }
    }
    return cleaned;
}

function getLocalState() {
    const rawSaved = JSON.parse(localStorage.getItem('savedVerses') || '[]');
    const compactSaved = rawSaved.map(s => {
        if (!s) return null;
        const item = {
            book: s.book || '',
            chapter: s.chapter !== undefined && s.chapter !== null ? s.chapter : '',
            verse: s.verse !== undefined && s.verse !== null ? s.verse : '',
            religion: s.religion || '',
            album: s.album || 'All',
            text: s.text || ''
        };
        if (s.id) item.id = s.id;
        if (s.author) item.author = s.author;
        if (s.translation) item.translation = s.translation;
        if (s.time) item.time = s.time;
        return item;
    }).filter(Boolean);

    const state = {
        savedVerses: compactSaved,
        createdAlbums: JSON.parse(localStorage.getItem('createdAlbums') || '[]'),
        bookMarkedVerse: JSON.parse(localStorage.getItem('bookMarkedVerse') || '{}'),
        selectedVoice: localStorage.getItem('selectedVoice') || 'en_GB-alan-medium',
        ttsAnnounceSource: localStorage.getItem('ttsAnnounceSource') === 'true',
        ttsRandomVoice: localStorage.getItem('ttsRandomVoice') === 'true',
        updatedAt: Date.now()
    };

    // Only save custom topic selection if user is premium
    if (typeof isPremiumUser !== 'undefined' && isPremiumUser) {
        const customRels = localStorage.getItem('globalSelectedRels');
        if (customRels) {
            try {
                state.globalSelectedRels = JSON.parse(customRels);
            } catch(e){}
        }
    }

    return sanitizeForFirestore(state);
}

let firestoreUnsubscribe = null;
let isSavingToFirestore = false;

function applyRemoteFirestoreData(remoteData) {
    if (!remoteData || typeof remoteData !== 'object') return;
    if (isBookmarkEcho(remoteData)) return;

    const prevRestoring = isRestoringState;
    isRestoringState = true;

    try {
        let needSavedRefresh = false;
        let needSettingsRefresh = false;

        // 1. Sync savedVerses from cloud
        if (Array.isArray(remoteData.savedVerses)) {
            const incoming = remoteData.savedVerses.filter(v => v && v.text);
            if (getBookmarkSnapshotFromData({ savedVerses: incoming, createdAlbums: createdAlbums }) !== getLocalBookmarkSnapshot()) {
                savedVerses = incoming;
                localStorage.setItem('savedVerses', JSON.stringify(savedVerses));
                needSavedRefresh = true;
            }
        }

        // 2. Sync createdAlbums from cloud
        if (Array.isArray(remoteData.createdAlbums)) {
            const incomingAlbums = remoteData.createdAlbums.filter(a => typeof a === 'string' && a.trim());
            if (getBookmarkSnapshotFromData({ savedVerses: savedVerses, createdAlbums: incomingAlbums }) !== getLocalBookmarkSnapshot()) {
                createdAlbums = incomingAlbums;
                localStorage.setItem('createdAlbums', JSON.stringify(createdAlbums));
                needSavedRefresh = true;
            }
        }

        // 3. Sync bookmarks directly from cloud
        if (remoteData.bookMarkedVerse && typeof remoteData.bookMarkedVerse === 'object') {
            if (JSON.stringify(bookMarkedVerse) !== JSON.stringify(remoteData.bookMarkedVerse)) {
                bookMarkedVerse = remoteData.bookMarkedVerse;
                localStorage.setItem('bookMarkedVerse', JSON.stringify(bookMarkedVerse));
            }
        }

        // 4. Update seenVersesHistory
        if (Array.isArray(remoteData.seenVersesHistory)) {
            seenVersesList = remoteData.seenVersesHistory.slice(-1000);
            seenVersesSet = new Set(seenVersesList);
            localStorage.setItem('seenVersesHistory', JSON.stringify(seenVersesList));
        }

        // 5. Preferences
        if (Array.isArray(remoteData.globalSelectedRels) && remoteData.globalSelectedRels.length > 0) {
            const incomingRels = remoteData.globalSelectedRels.filter(r => ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Sikhism', 'Judaism', 'Philosophy'].includes(r));
            if (JSON.stringify(globalSelectedRels) !== JSON.stringify(incomingRels)) {
                globalSelectedRels = incomingRels;
                localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
                needSettingsRefresh = true;
            }
        }
        
        if (remoteData.selectedVoice && selectedVoice !== remoteData.selectedVoice) {
            selectedVoice = remoteData.selectedVoice;
            localStorage.setItem('selectedVoice', selectedVoice);
            if (typeof syncVoiceWheelToCurrent === 'function') syncVoiceWheelToCurrent();
        }
        if (typeof remoteData.currentMusicTrack !== 'undefined') {
            localStorage.setItem('currentMusicTrack', remoteData.currentMusicTrack);
        }
        if (typeof remoteData.musicVolume !== 'undefined') {
            localStorage.setItem('musicVolume', remoteData.musicVolume);
            if (typeof audio !== 'undefined' && audio) {
                audio.volume = parseFloat(remoteData.musicVolume);
            }
            const slider = document.getElementById('music-volume-slider');
            if (slider) slider.value = remoteData.musicVolume;
        }
        
        updateTogglesUI();
        if (needSettingsRefresh && typeof buildSettings === 'function') {
            const isSettingsActive = document.getElementById('settings') && document.getElementById('settings').classList.contains('active-section');
            if (isSettingsActive) buildSettings();
        }
        if (needSavedRefresh && typeof showSavedVerses === 'function') {
            const isSavedActive = document.getElementById('saved-verses') && document.getElementById('saved-verses').classList.contains('active-section');
            if (isSavedActive) suppressFlash(() => showSavedVerses(true));
        }
    } finally {
        isRestoringState = prevRestoring;
    }
}

function setupFirestoreRealtimeSync(uid) {
    if (!db || !uid) return;
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e){}
        firestoreUnsubscribe = null;
    }
    try {
        const docRef = db.collection('users').doc(uid);
        firestoreUnsubscribe = docRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            if (doc.metadata && doc.metadata.hasPendingWrites) return;
            const remoteData = doc.data();
            if (isBookmarkEcho(remoteData)) return;
            if (isSavingToFirestore) return;
            applyRemoteFirestoreData(remoteData);
        }, (err) => {
            console.warn("Firestore onSnapshot error:", err);
        });
    } catch(err) {
        console.warn("Setup Firestore realtime sync failed:", err);
    }
}

async function saveUserDataToFirestore(uid) {
    if (!db || !uid || uid === 'guest') return;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.auth === 'function') {
            const curUser = firebase.auth().currentUser;
            if (!curUser) return;
        }
        isSavingToFirestore = true;
        markLocalBookmarkMutation();
        const payloadToSave = getLocalState();
        await db.collection('users').doc(uid).set(payloadToSave, { merge: true });
    } catch(err) {
        console.warn("Firestore sync paused (offline or unauthenticated):", err.message || err);
    } finally {
        setTimeout(() => {
            isSavingToFirestore = false;
        }, 3000);
    }
}

async function loadUserDataFromFirestore(uid) {
    if (!db || !uid || uid === 'guest') return;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && typeof firebase.auth === 'function') {
            const curUser = firebase.auth().currentUser;
            if (!curUser) return;
        }
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const remoteData = doc.data();
            applyRemoteFirestoreData(remoteData);
        } else {
            saveUserDataToFirestore(uid);
        }
        setupFirestoreRealtimeSync(uid);
    } catch(err) {
        console.warn("Firestore load note:", err.message || err);
    }
}



function openUserProfileModal() {
    const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!googleUser && !user) {
        openEmailAuthModal('signin');
        return;
    }
    if (typeof cancelNameEditMode === 'function') cancelNameEditMode();
    const modal = document.getElementById('user-profile-modal');
    const nameEl = document.getElementById('user-modal-name');
    const emailEl = document.getElementById('user-modal-email');
    const imgEl = document.getElementById('user-modal-avatar-img');
    const txtEl = document.getElementById('user-modal-avatar-text');
    
    const name = (googleUser && googleUser.name) || (user && (user.displayName || user.email)) || 'User';
    const email = (googleUser && googleUser.email) || (user && user.email) || '';
    const picture = (googleUser && googleUser.picture) || (user && user.photoURL) || localStorage.getItem('customUserAvatar') || '';

    if (nameEl) nameEl.innerText = name;
    if (emailEl) emailEl.innerText = email;
    
    if (imgEl && txtEl) {
        if (picture) {
            imgEl.src = picture;
            imgEl.style.display = 'block';
            txtEl.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            txtEl.style.display = 'inline';
            txtEl.innerText = name ? name.charAt(0).toUpperCase() : 'U';
        }
    }
    
    openModal(modal);
}

function closeUserProfileModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('user-profile-modal'));
}

function confirmSignOut() {
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e){}
        firestoreUnsubscribe = null;
    }
    const doCleanup = () => {
        googleUser = null;
        try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e){}
        googleAccessToken = null;
        switchProfile('guest');
        closeUserProfileModal();
        updateUserUI();
        if (typeof showSavedVerses === 'function') {
            showSavedVerses(true);
        }
    };

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
        try { window.Capacitor.Plugins.FirebaseAuthentication.signOut(); } catch(e){}
    }

    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        firebase.auth().signOut().then(doCleanup).catch((err) => {
            console.error("Firebase SignOut Error:", err);
            doCleanup();
        });
    } else {
        doCleanup();
    }
}

let lastDeleteProfileTapTime = 0;
let deleteProfileToastTimer = null;

function handleDeleteProfileBtnClick() {
    const now = Date.now();
    if (now - lastDeleteProfileTapTime < 300) {
        lastDeleteProfileTapTime = 0;
        clearTimeout(deleteProfileToastTimer);
        clearTimeout(toastHideTimeout);
        const toast = document.getElementById('global-toast');
        if (toast) toast.classList.remove('show');
        openDeleteAccountModal();
    } else {
        lastDeleteProfileTapTime = now;
        clearTimeout(deleteProfileToastTimer);
        deleteProfileToastTimer = setTimeout(() => {
            showToast("Double-tap to Delete", 1500);
        }, 300);
    }
}

let lastDeleteConfirmTapTime = 0;
let deleteConfirmToastTimer = null;

function handleDeleteConfirmBtnClick() {
    const now = Date.now();
    if (now - lastDeleteConfirmTapTime < 300) {
        lastDeleteConfirmTapTime = 0;
        clearTimeout(deleteConfirmToastTimer);
        clearTimeout(toastHideTimeout);
        const toast = document.getElementById('global-toast');
        if (toast) toast.classList.remove('show');
        executeDeleteAccount();
    } else {
        lastDeleteConfirmTapTime = now;
        clearTimeout(deleteConfirmToastTimer);
        deleteConfirmToastTimer = setTimeout(() => {
            showToast("Double-tap to Delete", 1500);
        }, 300);
    }
}

function openDeleteAccountModal() {
    openModal(document.getElementById('delete-account-confirm-modal'));
}

function closeDeleteAccountModal(e) {
    if (e && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('delete-account-confirm-modal'));
}

function executeDeleteAccount() {
    if (!googleUser) return;
    closeDeleteAccountModal();

    const userSub = googleUser.sub;
    const profileKey = 'account_' + userSub;

    const finalizeDeletion = () => {
        // Clear all account-specific keys from localStorage
        STATE_KEYS.forEach(k => {
            try { originalRemoveItem.call(localStorage, `pf_${profileKey}_${k}`); } catch(e) {}
        });
        googleUser = null;
        try { originalRemoveItem.call(localStorage, 'googleUser'); } catch(e) {}
        googleAccessToken = null;
        switchProfile('guest');
        closeUserProfileModal();
        updateUserUI();
        if (typeof showSavedVerses === 'function') {
            showSavedVerses(true);
        }
        showToast('Account deleted');
    };

    // 1. Delete from Firestore if available
    let dbPromise = Promise.resolve();
    if (typeof firebase !== 'undefined' && firebase.firestore && userSub) {
        try {
            const db = firebase.firestore();
            dbPromise = db.collection('users').doc(userSub).delete().catch(err => {
                console.warn("Firestore user deletion warning:", err);
            });
        } catch(e) {}
    }

    dbPromise.then(() => {
        // 2. Delete Firebase Auth user if authenticated
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
            firebase.auth().currentUser.delete().then(() => {
                finalizeDeletion();
            }).catch(err => {
                console.warn("Firebase Auth deletion warning:", err);
                firebase.auth().signOut().catch(() => {});
                finalizeDeletion();
            });
        } else {
            finalizeDeletion();
        }
    });
}

function updateUserUI() {
    const btn = document.getElementById('user-google-btn');
    const svg = document.getElementById('google-icon-svg');
    const txt = document.getElementById('google-avatar-text');
    const img = document.getElementById('google-avatar-img');
    if (!btn || !svg || !txt) return;
    
    if (googleUser) {
        svg.classList.add('hidden');
        
        if (googleUser.picture && img) {
            img.src = googleUser.picture;
            img.classList.remove('hidden');
            img.style.display = 'block';
            txt.classList.add('hidden');
        } else {
            if (img) {
                img.classList.add('hidden');
                img.style.display = 'none';
            }
            txt.classList.remove('hidden');
            txt.innerText = googleUser.name ? googleUser.name.charAt(0).toUpperCase() : 'U';
        }
    } else {
        svg.classList.remove('hidden');
        txt.classList.add('hidden');
        if (img) {
            img.classList.add('hidden');
            img.style.display = 'none';
        }
    }
}

// --- Premium Modal Logic (RevenueCat) ---
var isPremiumUser = false;
var rcPackages = [];
var selectedPlanType = 'annual'; // 'monthly' or 'annual'
var isPurchasingInProgress = false;

async function initRevenueCat() {
    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            await Purchases.configure({ apiKey: 'goog_oaXBzDwHBvBaJzSuIZbFuuvwkLM' });
            
            // Check existing customer info
            try {
                const customerInfo = await Purchases.getCustomerInfo();
                const hasActive = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && Object.keys(customerInfo.entitlements.active).length > 0;
                if (hasActive) {
                    isPremiumUser = true;
                    localStorage.setItem('isPremiumUser', 'true');
                }
            } catch (custErr) {
                console.warn("CustomerInfo check error:", custErr);
            }
            
            // Fetch offerings in background
            try {
                const offerings = await Purchases.getOfferings();
                if (offerings && offerings.current && offerings.current.availablePackages) {
                    rcPackages = offerings.current.availablePackages;
                    if (document.getElementById('premium-packages')) {
                        renderPremiumPackages();
                    }
                }
            } catch (offErr) {
                console.warn("Offerings fetch error:", offErr);
            }
        }
    } catch (e) {
        console.error("RevenueCat Init Error:", e);
    }
}



let _premiumModalLastOpened = 0;
async function openPremiumModal() {
    const now = Date.now();
    if (now - _premiumModalLastOpened < 1500) return; // Cooldown: prevent double-open
    _premiumModalLastOpened = now;
    const modal = document.getElementById('premium-modal');
    if (modal) {
        isPurchasingInProgress = false; // Reset stuck state
        openModal(modal);
        renderPremiumPackages();
        
        // Fetch fresh offerings if empty
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases && (!rcPackages || rcPackages.length === 0)) {
            try {
                const offerings = await Purchases.getOfferings();
                if (offerings && offerings.current && offerings.current.availablePackages) {
                    rcPackages = offerings.current.availablePackages;
                    renderPremiumPackages();
                }
            } catch (e) {
                console.warn("Modal offerings fetch notice:", e);
            }
        }
    }
}


function closePremiumModal(e) {
    if (e && e.target && e.currentTarget && e.target !== e.currentTarget) return;
    closeModal(document.getElementById('premium-modal'));
}

function selectPremiumPlan(planType) {
    selectedPlanType = planType;
    renderPremiumPackages();
}

function renderPremiumPackages() {
    const container = document.getElementById('premium-packages');
    if (!container) return;

    const annualPrice = "$14.99";
    const annualPerMonth = "$1.25";
    const monthlyPrice = "$1.99";

    container.innerHTML = `
        <div class="premium-plans-grid">
            <div class="premium-plan-card ${selectedPlanType === 'annual' ? 'selected' : ''}" onclick="selectPremiumPlan('annual')">
                <span class="plan-badge">Save 37%</span>
                <span class="plan-name">Annual</span>
                <span class="plan-price">${annualPrice}</span>
                <span class="plan-subtext">${annualPerMonth}/mo billed yearly</span>
            </div>
            <div class="premium-plan-card ${selectedPlanType === 'monthly' ? 'selected' : ''}" onclick="selectPremiumPlan('monthly')">
                <span class="plan-name">Monthly</span>
                <span class="plan-price">${monthlyPrice}</span>
                <span class="plan-subtext">/ month</span>
            </div>
        </div>
    `;

    const buyBtnText = document.querySelector('.premium-buy-pill-text');
    if (buyBtnText && !isPurchasingInProgress) {
        if (selectedPlanType === 'annual') {
            buyBtnText.innerText = `Get Annual`;
        } else {
            buyBtnText.innerText = `Get Monthly`;
        }
    }
}

async function handlePremiumSubscribeClick(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    const activeProfile = getActiveProfileId();
    const currentUid = getFirebaseCurrentUid();
    if (!currentUid || activeProfile === 'guest') {
        closePremiumModal();
        openEmailAuthModal('signin');
        showToast("Sign in for Premium");
        return;
    }
    if (isPurchasingInProgress) {
        return;
    }
    isPurchasingInProgress = true;
    
    const buyBtnText = document.querySelector('.premium-buy-pill-text');
    if (buyBtnText) buyBtnText.innerText = "Opening Google Play...";

    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            // Ensure configured
            try {
                await Purchases.configure({ apiKey: 'goog_oaXBzDwHBvBaJzSuIZbFuuvwkLM' });
            } catch (cfgErr) {}

            // Try fetching offerings if not yet cached
            if (!rcPackages || rcPackages.length === 0) {
                try {
                    const offerings = await Purchases.getOfferings();
                    if (offerings && offerings.current && offerings.current.availablePackages) {
                        rcPackages = offerings.current.availablePackages;
                    } else if (offerings && offerings.all) {
                        const allKeys = Object.keys(offerings.all);
                        if (allKeys.length > 0 && offerings.all[allKeys[0]].availablePackages) {
                            rcPackages = offerings.all[allKeys[0]].availablePackages;
                        }
                    }
                } catch (fetchErr) {
                    console.warn("Offerings fetch on click warning:", fetchErr);
                }
            }

            if (rcPackages && rcPackages.length > 0) {
                let targetPkg = null;
                if (selectedPlanType === 'annual') {
                    targetPkg = rcPackages.find(p => p.packageType === 'ANNUAL' || (p.identifier && (p.identifier.toLowerCase().includes('annual') || p.identifier.toLowerCase().includes('yearly')))) || rcPackages[0];
                } else {
                    targetPkg = rcPackages.find(p => p.packageType === 'MONTHLY' || (p.identifier && p.identifier.toLowerCase().includes('monthly'))) || rcPackages[0];
                }

                if (targetPkg) {
                    const doPurchase = async () => {
                        try {
                            return await Purchases.purchasePackage({ aPackage: targetPkg });
                        } catch (pkgErr) {
                            console.warn("purchasePackage error, trying subscriptionOption:", pkgErr);
                            const opt = (targetPkg.product && (targetPkg.product.defaultOption || (targetPkg.product.subscriptionOptions && targetPkg.product.subscriptionOptions[0]))) || targetPkg.subscriptionOption;
                            if (opt) {
                                return await Purchases.purchaseSubscriptionOption({ subscriptionOption: opt });
                            }
                            throw pkgErr;
                        }
                    };

                    const result = await doPurchase();
                    const customerInfo = result && (result.customerInfo || result);
                    if (customerInfo) {
                        isPremiumUser = true;
                        localStorage.setItem('isPremiumUser', 'true');
                        closePremiumModal();
                        updateTogglesUI();
                        buildSettings();
                        return;
                    }
                }
            }
        }
    } catch (e) {
        if (e && (e.userCancelled || (e.message && e.message.toLowerCase().includes('cancel')))) {
            // User cancelled — do nothing silently
        } else {
            console.error("Purchase error:", e);
        }
    } finally {
        isPurchasingInProgress = false;
        renderPremiumPackages();
    }
}

async function restorePurchases() {
    try {
        const Purchases = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || window.Purchases;
        if (Purchases) {
            const customerInfo = await Purchases.restorePurchases();
            const hasActiveEntitlement = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && Object.keys(customerInfo.entitlements.active).length > 0;
            if (hasActiveEntitlement) {
                isPremiumUser = true;
                localStorage.setItem('isPremiumUser', 'true');
                closePremiumModal();
                updateTogglesUI();
                buildSettings();
            }
        }
    } catch (e) {
        console.error("Restore purchases error:", e);
    }
}

window.addEventListener('load', async () => {
    await initRevenueCat();
});


// --- Direct Google Drive Redirect & Offline Auto Guest ---

// Auto Guest login when offline
window.addEventListener('offline', () => {
    if (googleUser) {
        saveStateToProfile('account_' + googleUser.sub);
        googleUser = null;
        loadStateFromProfile('guest');
        updateUserUI();
        showToast('Offline: Guest mode');
    }
});

function preloadPiperVoices() {
    if ('caches' in window) {
        const cacheName = 'religion-app-v20';
        caches.open(cacheName).then(cache => {
            const voiceUrls = [
                './libs/piper/piper-bundle.js',
                './libs/piper/piper_phonemize.data',
                './libs/piper/piper_phonemize.wasm',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx.json',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx',
                'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json'
            ];
            voiceUrls.forEach(url => {
                cache.match(url, { ignoreSearch: true }).then(res => {
                    if (!res) cache.add(url).catch(e => {});
                });
            });
        });
    }
}

// PC (Ctrl+C) and Mac (Cmd+C) Shortcut: Copy current active verse card to clipboard
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selection = window.getSelection() ? window.getSelection().toString() : '';
        if (selection && selection.trim().length > 0) return;
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
        
        let curVerse = null;
        if (typeof verseBatches !== 'undefined' && verseBatches.general && verseBatches.general[currentVerseIndex.general]) {
            curVerse = verseBatches.general[currentVerseIndex.general];
        }
        if (curVerse) {
            const formatted = formatVerseForShare(curVerse);
            navigator.clipboard.writeText(formatted).then(() => {
                showToast('Verse copied to clipboard!');
            }).catch(console.error);
        }
    }
});
