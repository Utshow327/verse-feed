import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

start_marker = '    return slots.map(r => {\n        let fullPool = religionVerses[r] || [];'
end_marker = '        return selectedVerse;\n    }).filter(v => v !== null);'

if start_marker in js and end_marker in js:
    start_pos = js.find(start_marker)
    end_pos = js.find(end_marker, start_pos) + len(end_marker)
    
    new_code = '''    return slots.map(r => {
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
    }).filter(v => v !== null);'''

    js = js[:start_pos] + new_code + js[end_pos:]
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js)
    print("Successfully replaced generateBatch slots map!")
else:
    print("ERROR: Markers not found!")

# Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced script_v14.js to www")
