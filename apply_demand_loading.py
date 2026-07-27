import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update toggleGlobalReligion to load missing religion on-demand
old_toggle_rel = '''function toggleGlobalReligion(rel) {
    if (!globalSelectedRels) globalSelectedRels = [];
    if (globalSelectedRels.includes(rel)) {
        globalSelectedRels = globalSelectedRels.filter(r => r !== rel);
    } else {
        globalSelectedRels.push(rel);
    }
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    buildSettings();
    updateBatchesAfterSettings();
    if (typeof showReligions === "function" && document.getElementById('library-home') && !document.getElementById('library-home').classList.contains('hidden')) {
        showReligions();
    }
}'''

new_toggle_rel = '''async function toggleGlobalReligion(rel) {
    if (!globalSelectedRels) globalSelectedRels = [];
    if (globalSelectedRels.includes(rel)) {
        globalSelectedRels = globalSelectedRels.filter(r => r !== rel);
    } else {
        globalSelectedRels.push(rel);
        if (!loadedReligions.has(rel)) {
            await loadReligionData(rel);
        }
    }
    localStorage.setItem('globalSelectedRels', JSON.stringify(globalSelectedRels));
    buildSettings();
    updateBatchesAfterSettings();
    if (typeof showReligions === "function" && document.getElementById('library-home') && !document.getElementById('library-home').classList.contains('hidden')) {
        showReligions();
    }
}'''

if old_toggle_rel in js:
    js = js.replace(old_toggle_rel, new_toggle_rel)
    print("Updated toggleGlobalReligion for on-demand loading")
else:
    print("WARN: Could not find old_toggle_rel")

# 2. Remove loadUnselectedDataInBackground call or definition
old_bg_load = '''async function loadUnselectedDataInBackground() {
    await new Promise(r => setTimeout(r, 1500)); // Delay initial background loading to ensure smooth startup
    const relsToLoad = religions.filter(r => !loadedReligions.has(r));
    for (const rel of relsToLoad) {
        await new Promise(r => setTimeout(r, 500)); // Spread out heavy parsing
        await loadReligionData(rel);
        await new Promise(r => setTimeout(r, 1000)); // Yield aggressively for bg loading
    }
}'''

new_bg_load = '''async function loadUnselectedDataInBackground() {
    // Unselected religions are now loaded strictly on-demand when enabled in settings
}'''

if old_bg_load in js:
    js = js.replace(old_bg_load, new_bg_load)
    print("Updated loadUnselectedDataInBackground to no-op")
else:
    print("WARN: Could not find old_bg_load")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Bump version in index.html to v=69
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=68', 'script_v14.js?v=69')
html = html.replace('style_v5.css?v=68', 'style_v5.css?v=69')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version in index.html to v=69")

# 4. Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced all to www")

print("All done!")
