import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
css_path = os.path.join(root_dir, 'style_v5.css')
html_path = os.path.join(root_dir, 'index.html')

# 1. Update style_v5.css to add pointer-events: none !important to #loading.loaded
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

old_css_loading = '''#loading.loaded {
    background-color: transparent;
}'''

new_css_loading = '''#loading.loaded {
    background-color: transparent;
    pointer-events: none !important;
}'''

if old_css_loading in css:
    css = css.replace(old_css_loading, new_css_loading)
    print("Updated style_v5.css #loading.loaded pointer-events")
else:
    print("WARN: Could not find old_css_loading in style_v5.css")

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update script_v14.js for fast startup & filtered pool caching
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Update loader hide logic in initApp
old_init_loader = '''        const loaderEl = document.getElementById('loading');
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
            }, 400);
        }'''

new_init_loader = '''        const loaderEl = document.getElementById('loading');
        if (loaderEl) {
            loaderEl.classList.add('loaded');
            loaderEl.style.pointerEvents = 'none';
            loaderEl.style.opacity = '0';
            setTimeout(() => {
                loaderEl.style.display = 'none';
            }, 300);
        }

        initializeVerseFeed();'''

if old_init_loader in js:
    js = js.replace(old_init_loader, new_init_loader)
    print("Updated initApp loader logic")
else:
    print("WARN: Could not find old_init_loader")

# Add filtered pool caching and optimize generateBatch
old_gen_batch = '''    return slots.map(r => {
        let fullPool = religionVerses[r] || [];

        const filteredPool = fullPool.filter(v => {
            if (v.text.length < MIN_CHAR_LIMIT || v.text.length > maxCharLimit) return false;
            if (v.text.trim() === '') return false;

            const textLower = v.text.toLowerCase();
            const hasNegative = negativeWords.some(word => textLower.includes(word));
            if (hasNegative) return false;

            const hasPositive = positiveWords.some(word => textLower.includes(word));
            if (!hasPositive) return false;

            if (textLower.startsWith('and ') || textLower.startsWith('but ') || textLower.startsWith('then ') || textLower.startsWith('therefore ') || textLower.startsWith('for ')) {
                return false;
            }
            return true;
        });
        let pool = filteredPool.length > 0 ? filteredPool : fullPool.filter(v => {
            return v.text.length >= MIN_CHAR_LIMIT && v.text.length <= maxCharLimit && v.text.trim() !== '';
        });

        if (pool.length === 0) {
            return { text: "Debug: Pool is empty for religion " + r + ".", religion: 'System', book: 'Debug', chapter: '1', verse: '1' };
        }
        let availablePool = pool.filter(v => !allVersesUsed.general.has(v.text));
        if (availablePool.length === 0) {
            // If this specific religion has exhausted its valid unread verses,
            // fall back to the full pool (accepting duplicates) rather than clearing the global cache.
            availablePool = pool;
        }
        const idx = Math.floor(Math.random() * availablePool.length);
        const selectedVerse = availablePool[idx];
        
        allVersesUsed.general.add(selectedVerse.text);
        if (allVersesUsed.general.size > 200) {
            const oldestVerse = allVersesUsed.general.values().next().value;
            allVersesUsed.general.delete(oldestVerse);
        }
        
        return selectedVerse;
    });'''

new_gen_batch = '''    return slots.map(r => {
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

if old_gen_batch in js:
    js = js.replace(old_gen_batch, new_gen_batch)
    print("Updated generateBatch mapping")
else:
    print("WARN: Could not find old_gen_batch")

# Insert getFilteredPool cache function right before generateBatch
cache_func = '''const filteredPoolCache = {};

function getFilteredPool(rel) {
    if (filteredPoolCache[rel]) return filteredPoolCache[rel];
    const fullPool = religionVerses[rel] || [];
    if (fullPool.length === 0) return [];
    
    const filteredPool = fullPool.filter(v => {
        if (!v || !v.text) return false;
        if (v.text.length < MIN_CHAR_LIMIT || v.text.length > maxCharLimit) return false;
        if (v.text.trim() === '') return false;

        const textLower = v.text.toLowerCase();
        const hasNegative = negativeWords.some(word => textLower.includes(word));
        if (hasNegative) return false;

        const hasPositive = positiveWords.some(word => textLower.includes(word));
        if (!hasPositive) return false;

        if (textLower.startsWith('and ') || textLower.startsWith('but ') || textLower.startsWith('then ') || textLower.startsWith('therefore ') || textLower.startsWith('for ')) {
            return false;
        }
        return true;
    });
    
    const finalPool = filteredPool.length > 0 ? filteredPool : fullPool.filter(v => {
        return v && v.text && v.text.length >= MIN_CHAR_LIMIT && v.text.length <= maxCharLimit && v.text.trim() !== '';
    });
    
    filteredPoolCache[rel] = finalPool;
    return finalPool;
}

function generateBatch(type, lastRels = []) {'''

js = js.replace('function generateBatch(type, lastRels = []) {', cache_func)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Update index.html to v=66
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=65', 'script_v14.js?v=66')
html = html.replace('style_v5.css?v=65', 'style_v5.css?v=66')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version to v=66")

# 4. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    shutil.copy(css_path, os.path.join(www_dir, 'style_v5.css'))
    print("Synced to www")
