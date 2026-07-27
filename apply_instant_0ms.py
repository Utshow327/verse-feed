import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Define INITIAL_INSTANT_VERSES and update initApp
instant_verses_code = '''const INITIAL_INSTANT_VERSES = [
    { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.", book: "Jeremiah", chapter: "29", verse: "11", religion: "Christianity" },
    { text: "So remember Me; I will remember you. And be grateful to Me and do not deny Me.", book: "Quran", chapter: "2", verse: "152", religion: "Islam" },
    { text: "You have the right to work, but never to the fruit of work. You should never engage in action for the sake of reward.", book: "Bhagavad Gita", chapter: "2", verse: "47", religion: "Hinduism" },
    { text: "The mind is everything. What you think you become.", book: "Dhammapada", chapter: "1", verse: "1", religion: "Buddhism" },
    { text: "Recognize the whole human race as one.", book: "Guru Granth Sahib", chapter: "1", verse: "1", religion: "Sikhism" }
];

async function initApp() {
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

        setupGestures();
        setupWheelListeners();
        
        // Render 0ms instant feed immediately
        verseBatches.general = [...INITIAL_INSTANT_VERSES];
        goTo('verse-feed');
        renderFeedCard(0);

        // Load datasets & TTS engine in background after paint
        setTimeout(async () => {
            await loadSelectedData();
            try {
                initPiper(selectedVoice);
            } catch(e) {}
        }, 50);

    } catch (error) {
        console.error('Initialization error:', error);
    }
}'''

start_init = 'async function initApp() {'
end_init = 'function updateDarkModeIcon(isDark) {'

pos1 = js.find(start_init)
pos2 = js.find(end_init, pos1)

if pos1 != -1 and pos2 != -1:
    js = js[:pos1] + instant_verses_code + '\n' + js[pos2:]
    print("Updated initApp for 0ms instant render")

# 2. Update generateBatch fallback for unloaded state
old_gen_fallback = '''    const rels = (globalSelectedRels || []).filter(r => religionVerses[r] && religionVerses[r].length > 0);
    if (rels.length === 0) {
        return [{ text: "Debug: No religions selected or loaded yet. rels is empty.", religion: 'System', book: 'Debug', chapter: '1', verse: '1' }];
    }'''

new_gen_fallback = '''    const rels = (globalSelectedRels || []).filter(r => religionVerses[r] && religionVerses[r].length > 0);
    if (rels.length === 0) {
        return INITIAL_INSTANT_VERSES.slice(0, 5);
    }'''

if old_gen_fallback in js:
    js = js.replace(old_gen_fallback, new_gen_fallback)
    print("Updated generateBatch fallback to instant verses")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Bump version in index.html to v=70
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=69', 'script_v14.js?v=70')
html = html.replace('style_v5.css?v=69', 'style_v5.css?v=70')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version in index.html to v=70")

# 4. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced all to www")

print("All done!")
