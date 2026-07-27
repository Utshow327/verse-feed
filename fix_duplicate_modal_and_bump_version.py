import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
html_path = os.path.join(root_dir, 'index.html')
js_path = os.path.join(root_dir, 'script_v14.js')

# 1. Clean index.html
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Bump cache-buster version
html = html.replace('script_v14.js?v=54', 'script_v14.js?v=60')
html = html.replace('style_v5.css?v=29', 'style_v5.css?v=60')

# Remove duplicate rename-album-modal
dup_modal = '''    <!-- Rename Album Modal -->
    <div id="rename-album-modal" class="modal-overlay hidden" onclick="if(event.target===this) { this.classList.add('hidden'); }">
        <div class="modal-content" style="text-align: center;">
            <input type="text" id="rename-album-input" class="modern-input" placeholder="Enter new name" style="margin-bottom: 20px;">
            <button class="modern-btn" onclick="confirmRenameAlbum()">Rename</button>
        </div>
    </div>'''

if dup_modal in html:
    html = html.replace(dup_modal, '')
    print("Removed duplicate rename-album-modal from index.html")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated index.html cache busters to v=60")

# 2. Update script_v14.js
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Add alias if confirmRenameAlbum is not defined
if 'function confirmRenameAlbum' not in js:
    js += '\nfunction confirmRenameAlbum() { submitRenameAlbum(); }\n'
    print("Added confirmRenameAlbum alias in script_v14.js")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Sync to www directory if it exists
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    css_path = os.path.join(root_dir, 'style_v5.css')
    if os.path.exists(css_path):
        shutil.copy(css_path, os.path.join(www_dir, 'style_v5.css'))
    print("Synced www directory with v=60")

print("All done!")
