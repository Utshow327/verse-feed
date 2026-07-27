import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update initApp loader handling
old_init_part = '''        const loaderEl = document.getElementById('loading');
        if (loaderEl) {
            loaderEl.classList.add('loaded');
        }

        // Defer heavy UI generation to allow paint
        setTimeout(() => {
            initializeVerseFeed();
        }, 50);

        // Fast track the screen expansion animation
        await new Promise(r => setTimeout(r, 400));

        // Fade out loading screen quickly
        if (loaderEl) {
            loaderEl.style.opacity = '0';
            setTimeout(() => {
                loaderEl.style.display = 'none';
                loaderEl.classList.remove('loaded');
            }, 300);
        }'''

new_init_part = '''        const loaderEl = document.getElementById('loading');
        if (loaderEl) {
            loaderEl.classList.add('loaded');
            loaderEl.style.pointerEvents = 'none';
            loaderEl.style.opacity = '0';
            setTimeout(() => {
                loaderEl.style.display = 'none';
            }, 200);
        }

        initializeVerseFeed();'''

if old_init_part in js:
    js = js.replace(old_init_part, new_init_part)
    print("Successfully replaced initApp loader section!")
else:
    print("ERROR: old_init_part not found!")

# 2. Update slots.map in generateBatch to use getFilteredPool(r)
target_block_start = '    return slots.map(r => {'
idx_start = js.find(target_block_start)
if idx_start != -1:
    target_block_end = '        return selectedVerse;\n    });'
    idx_end = js.find(target_block_end, idx_start)
    if idx_end != -1:
        full_old_block = js[idx_start:idx_end + len(target_block_end)]
        new_map_block = '''    return slots.map(r => {
        let pool = getFilteredPool(r);

        if (!pool || pool.length === 0) {
            return { text: "Debug: Pool is empty for religion " + r + ".", religion: 'System', book: 'Debug', chapter: '1', verse: '1' };
        }
        let availablePool = pool.filter(v => v && v.text && !allVersesUsed.general.has(v.text));
        if (availablePool.length === 0) {
            availablePool = pool;
        }
        const idx = Math.floor(Math.random() * availablePool.length);
        const selectedVerse = availablePool[idx];
        
        if (selectedVerse && selectedVerse.text) {
            allVersesUsed.general.add(selectedVerse.text);
            if (allVersesUsed.general.size > 200) {
                const oldestVerse = allVersesUsed.general.values().next().value;
                allVersesUsed.general.delete(oldestVerse);
            }
        }
        
        return selectedVerse;
    });'''
        js = js.replace(full_old_block, new_map_block)
        print("Successfully updated generateBatch slots.map!")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Bump index.html to v=66
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=65', 'script_v14.js?v=66')
html = html.replace('style_v5.css?v=65', 'style_v5.css?v=66')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=66")

# Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced to www")
