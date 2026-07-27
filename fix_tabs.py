import os

html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the tabs HTML
old_tabs = '''                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button id="tab-create-album" class="album-create-btn" style="flex: 1; background: var(--accent); color: var(--bg-grad-1);" onclick="setCreateModalTab('album')">New Album</button>
                    <button id="tab-create-verse" class="album-select-btn" style="flex: 1;" onclick="setCreateModalTab('verse')">New Verse</button>
                </div>'''

new_tabs = '''                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button id="tab-create-album" class="modal-tab-btn active" onclick="setCreateModalTab('album')">New Album</button>
                    <button id="tab-create-verse" class="modal-tab-btn" onclick="setCreateModalTab('verse')">New Verse</button>
                </div>'''

html = html.replace(old_tabs, new_tabs)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

css_path = 'c:/Users/ASUS/Desktop/religion app/style_v5.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

css += '''
.modal-tab-btn {
    flex: 1;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--card-bg);
    color: var(--text-color);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.3s;
}
.modal-tab-btn.active {
    background: var(--accent);
    color: var(--bg-grad-1);
    border-color: var(--accent);
}
'''
with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

js_path = 'c:/Users/ASUS/Desktop/religion app/script_v14.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_js = '''function setCreateModalTab(tab) {
    const albumTab = document.getElementById('tab-create-album');
    const verseTab = document.getElementById('tab-create-verse');
    const albumForm = document.getElementById('form-create-album');
    const verseForm = document.getElementById('form-create-verse');
    
    if (tab === 'album') {
        if (albumTab) { albumTab.style.background = 'var(--accent)'; albumTab.style.color = 'var(--bg-grad-1)'; }
        if (verseTab) { verseTab.style.background = 'var(--card-bg)'; verseTab.style.color = 'var(--text-color)'; }
        if (albumForm) albumForm.classList.remove('hidden');
        if (verseForm) verseForm.classList.add('hidden');
    } else {
        if (verseTab) { verseTab.style.background = 'var(--accent)'; verseTab.style.color = 'var(--bg-grad-1)'; }
        if (albumTab) { albumTab.style.background = 'var(--card-bg)'; albumTab.style.color = 'var(--text-color)'; }
        if (verseForm) verseForm.classList.remove('hidden');
        if (albumForm) albumForm.classList.add('hidden');
    }
}'''

new_js = '''function setCreateModalTab(tab) {
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

js = js.replace(old_js, new_js)
with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print('Updated tabs')
