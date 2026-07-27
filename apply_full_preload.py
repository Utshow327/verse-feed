import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update loadSelectedData to load ALL selected religions before returning
old_load_sel = '''async function loadSelectedData() {
    const relsToLoad = globalSelectedRels ? globalSelectedRels : religions;
    if (relsToLoad.length > 0) {
        await loadReligionData(relsToLoad[0]);
    }
    
    // Load the rest asynchronously in the background so app responds instantly
    if (relsToLoad.length > 1) {
        setTimeout(async () => {
            for (let i = 1; i < relsToLoad.length; i++) {
                await loadReligionData(relsToLoad[i]);
                await new Promise(r => setTimeout(r, 100)); // Yield heavily
            }
        }, 100);
    }
}'''

new_load_sel = '''async function loadSelectedData() {
    const relsToLoad = globalSelectedRels ? globalSelectedRels : religions;
    for (const rel of relsToLoad) {
        await loadReligionData(rel);
    }
}'''

if old_load_sel in js:
    js = js.replace(old_load_sel, new_load_sel)
    print("Updated loadSelectedData to load all selected religions before completion")
else:
    print("WARN: Could not find old_load_sel")

# 2. Update initApp so everything (data + TTS) finishes FIRST, and THEN verse feed is initialized
start_init = 'async function initApp() {'
end_init = 'function updateDarkModeIcon(isDark) {'

pos1 = js.find(start_init)
pos2 = js.find(end_init, pos1)

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

        // 1. Load all data completely first
        await loadSelectedData();

        // 2. Pre-load Piper TTS worker completely first
        try {
            await initPiper(selectedVoice);
        } catch(e) {}

        // 3. Setup event handlers
        setupGestures();
        setupWheelListeners();
        
        // 4. FINALLY render verses so app is 100% idle and instant when verses appear
        goTo('verse-feed');
        initializeVerseFeed();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}\n'''
    js = js[:pos1] + new_init_app + js[pos2:]
    print("Updated initApp function sequence")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Bump version in index.html to v=68
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=67', 'script_v14.js?v=68')
html = html.replace('style_v5.css?v=67', 'style_v5.css?v=68')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version in index.html to v=68")

# 4. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced all to www")

print("All done!")
