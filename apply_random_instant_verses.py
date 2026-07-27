import os
import shutil

root_dir = r'c:\Users\ASUS\Desktop\religion app'
js_path = os.path.join(root_dir, 'script_v14.js')
html_path = os.path.join(root_dir, 'index.html')

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Expanded pool of instant starter verses
new_instant_pool = '''const INITIAL_INSTANT_VERSES = [
    { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.", book: "Jeremiah", chapter: "29", verse: "11", religion: "Christianity" },
    { text: "So remember Me; I will remember you. And be grateful to Me and do not deny Me.", book: "Quran", chapter: "2", verse: "152", religion: "Islam" },
    { text: "You have the right to work, but never to the fruit of work. You should never engage in action for the sake of reward.", book: "Bhagavad Gita", chapter: "2", verse: "47", religion: "Hinduism" },
    { text: "The mind is everything. What you think you become.", book: "Dhammapada", chapter: "1", verse: "1", religion: "Buddhism" },
    { text: "Recognize the whole human race as one.", book: "Guru Granth Sahib", chapter: "1", verse: "1", religion: "Sikhism" },
    { text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud.", book: "Corinthians", chapter: "13", verse: "4", religion: "Christianity" },
    { text: "God does not burden any soul beyond what it can bear.", book: "Quran", chapter: "2", verse: "286", religion: "Islam" },
    { text: "When meditation is mastered, the mind is unwavering like the flame of a lamp in a windless place.", book: "Bhagavad Gita", chapter: "6", verse: "19", religion: "Hinduism" },
    { text: "Peace comes from within. Do not seek it without.", book: "Dhammapada", chapter: "2", verse: "5", religion: "Buddhism" },
    { text: "Truth is the highest virtue, but higher still is truthful living.", book: "Sri Guru Granth Sahib", chapter: "1", verse: "62", religion: "Sikhism" },
    { text: "Happiness depends upon ourselves.", book: "Nicomachean Ethics", chapter: "1", verse: "8", religion: "Philosophy" },
    { text: "He who has a why to live can bear almost any how.", book: "Twilight of the Idols", chapter: "1", verse: "12", religion: "Philosophy" },
    { text: "Out of your vulnerabilities will come your strength.", book: "Psychoanalysis", chapter: "1", verse: "4", religion: "Psychology" },
    { text: "Everything can be taken from a man but one thing: the last of the human freedoms to choose one's attitude.", book: "Man's Search for Meaning", chapter: "1", verse: "10", religion: "Psychology" }
];

function getShuffledInstantVerses() {
    let pool = [...INITIAL_INSTANT_VERSES];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
}'''

# Replace old INITIAL_INSTANT_VERSES definition
old_instant_def = '''const INITIAL_INSTANT_VERSES = [
    { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.", book: "Jeremiah", chapter: "29", verse: "11", religion: "Christianity" },
    { text: "So remember Me; I will remember you. And be grateful to Me and do not deny Me.", book: "Quran", chapter: "2", verse: "152", religion: "Islam" },
    { text: "You have the right to work, but never to the fruit of work. You should never engage in action for the sake of reward.", book: "Bhagavad Gita", chapter: "2", verse: "47", religion: "Hinduism" },
    { text: "The mind is everything. What you think you become.", book: "Dhammapada", chapter: "1", verse: "1", religion: "Buddhism" },
    { text: "Recognize the whole human race as one.", book: "Guru Granth Sahib", chapter: "1", verse: "1", religion: "Sikhism" }
];'''

if old_instant_def in js:
    js = js.replace(old_instant_def, new_instant_pool)
    print("Replaced INITIAL_INSTANT_VERSES definition with expanded shuffled pool")
else:
    print("WARN: Could not find old_instant_def")

# Replace verseBatches.general = [...INITIAL_INSTANT_VERSES]; with getShuffledInstantVerses()
old_batch_set = 'verseBatches.general = [...INITIAL_INSTANT_VERSES];'
new_batch_set = 'verseBatches.general = getShuffledInstantVerses();'

if old_batch_set in js:
    js = js.replace(old_batch_set, new_batch_set)
    print("Updated initApp to use getShuffledInstantVerses()")
else:
    print("WARN: Could not find old_batch_set")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Bump version in index.html to v=71
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('script_v14.js?v=70', 'script_v14.js?v=71')
html = html.replace('style_v5.css?v=70', 'style_v5.css?v=71')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Bumped version in index.html to v=71")

# Sync to www
www_dir = os.path.join(root_dir, 'www')
if os.path.exists(www_dir):
    shutil.copy(html_path, os.path.join(www_dir, 'index.html'))
    shutil.copy(js_path, os.path.join(www_dir, 'script_v14.js'))
    print("Synced all to www")

print("All Done!")
