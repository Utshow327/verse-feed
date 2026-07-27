import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
css_path = os.path.join(root_dir, 'style_v5.css')
html_path = os.path.join(root_dir, 'index.html')

# 1. Update style_v5.css to hide #loading completely
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

old_css_loading = '''#loading {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--bg-color-main);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: opacity 0.8s ease;
    overflow: hidden;
}'''

new_css_loading = '''#loading {
    display: none !important;
}'''

if old_css_loading in css:
    css = css.replace(old_css_loading, new_css_loading)
    print("Disabled #loading in style_v5.css")
else:
    # Fallback
    css = "#loading { display: none !important; }\n" + css
    print("Prepended #loading hidden to style_v5.css")

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update index.html to remove #loading div
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_html_loading = '''    <div id="loading">
        <div class="disk-waveform">
            <div class="disk-layer"></div>
            <div class="disk-layer"></div>
            <div class="disk-layer"></div>
        </div>
    </div>'''

if old_html_loading in html:
    html = html.replace(old_html_loading, '')
    print("Removed #loading div from index.html")

# Bump version to v=67
html = html.replace('script_v14.js?v=66', 'script_v14.js?v=67')
html = html.replace('style_v5.css?v=66', 'style_v5.css?v=67')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version in index.html to v=67")


# 3. Update script_v14.js: cleanText optimization and clean initApp
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Optimize cleanText
old_clean_text = '''function cleanText(text) {
    if (!text) return '';
    return text.replace(/\\(\\(may peace be upon him\\)\\)/gi, '(pbuh)')
               .replace(/\\(may peace be upon him\\)/gi, '(pbuh)')
               .replace(/may peace be upon him/gi, '(pbuh)')
               .replace(/\\(\\(peace be upon him\\)\\)/gi, '(pbuh)')
               .replace(/\\(peace be upon him\\)/gi, '(pbuh)')
               .replace(/peace be upon him/gi, '(pbuh)')
               .replace(/\\(\\(pbuh\\)\\)/gi, '(pbuh)')
               .replace(/\\ufdfa/g, '(pbuh)')
               .replace(/[{}[\\]\\@#*_+=~0-9]/g, '')
               .replace(/\\s+/g, ' ')
               .replace(/^[\\s\\-.,:;]+/, '') // clean leading punctuation left over from numbers
               .trim();
}'''

new_clean_text = '''function cleanText(text) {
    if (!text) return '';
    if (text.includes('peace') || text.includes('pbuh') || text.includes('\\ufdfa')) {
        text = text.replace(/\\(\\(may peace be upon him\\)\\)/gi, '(pbuh)')
                   .replace(/\\(may peace be upon him\\)/gi, '(pbuh)')
                   .replace(/may peace be upon him/gi, '(pbuh)')
                   .replace(/\\(\\(peace be upon him\\)\\)/gi, '(pbuh)')
                   .replace(/\\(peace be upon him\\)/gi, '(pbuh)')
                   .replace(/peace be upon him/gi, '(pbuh)')
                   .replace(/\\(\\(pbuh\\)\\)/gi, '(pbuh)')
                   .replace(/\\ufdfa/g, '(pbuh)');
    }
    return text.replace(/[{}[\\]\\@#*_+=~0-9]/g, '')
               .replace(/\\s+/g, ' ')
               .replace(/^[\\s\\-.,:;]+/, '')
               .trim();
}'''

if old_clean_text in js:
    js = js.replace(old_clean_text, new_clean_text)
    print("Optimized cleanText function")
else:
    print("WARN: Could not find old_clean_text")

# Clean initApp
start_init = 'async function initApp() {'
end_init = '    // Pre-load Piper TTS in background so first play is instant\n    initPiper();\n}'

pos1 = js.find(start_init)
pos2 = js.find(end_init, pos1) + len(end_init)

if pos1 != -1 and pos2 != -1:
    new_init_app = '''async function initApp() {
    applyAutoSpeed(selectedVoice);
    try {
        addSelectionListeners();

        const darkToggle = document.getElementById('dark-mode-toggle');
        updateDarkModeIcon(darkModeEnabled);
        darkToggle.addEventListener('click', () => {
            darkModeEnabled = !darkModeEnabled;
            localStorage.setItem('darkModeEnabled', darkModeEnabled);
            updateDarkModeIcon(darkModeEnabled);
            if (darkModeEnabled) {
                document.body.setAttribute('data-theme', 'dark');
            } else {
                document.body.removeAttribute('data-theme');
            }
        });
        if (darkModeEnabled) {
            document.body.setAttribute('data-theme', 'dark');
        }

        audio = document.getElementById('audio');
        audio.volume = 0.5;
        audio.src = musicTracks[currentTrack];
        audio.addEventListener('ended', nextTrack);
        if (globalSelectedRels === null) {
            globalSelectedRels = [...religions];
            localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
        }

        await loadSelectedData();

        setupGestures();
        setupWheelListeners();
        
        goTo('verse-feed');
        initializeVerseFeed();

        loadUnselectedDataInBackground();
    } catch (error) {
        console.error('Initialization error:', error);
    }
    initPiper();
}'''
    js = js[:pos1] + new_init_app + js[pos2:]
    print("Cleaned initApp function")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 4. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    shutil.copy(css_path, os.path.join(www_dir, 'style_v5.css'))
    print("Synced all to www")

print("All Done!")
