import os
import re

html_path = 'c:/Users/ASUS/Desktop/religion app/index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = re.sub(r'<div class="modal-header">\s*<h3>Create</h3>\s*</div>', '', html)
html = re.sub(r'<div class="modal-header">\s*<h3>Rename Album</h3>\s*<button class="close-btn" onclick="closeRenameModal\(\)">&times;</button>\s*</div>', '', html)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

css_path = 'c:/Users/ASUS/Desktop/religion app/style_v5.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

if '.book-verse {' in css:
    css = css.replace('.book-verse {', '.book-verse {\n    user-select: none;\n    -webkit-user-select: none;')
else:
    css += '\n.book-verse {\n    user-select: none;\n    -webkit-user-select: none;\n}\n'

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print('Updated index.html and style_v5.css')
