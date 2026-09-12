import os
import json

def build_chunks():
    data_dir = 'data'
    core_path = os.path.join(data_dir, 'verse_explanations.json')
    epics_path = os.path.join(data_dir, 'explanations_epics.json')
    active_ranks_path = os.path.join(data_dir, 'active_rankings.json')
    
    if not os.path.exists(core_path):
        print(f'[build_chunks] Core path {core_path} does not exist.')
        return []

    with open(core_path, 'r', encoding='utf-8') as f:
        all_data = json.load(f)

    if os.path.exists(epics_path):
        try:
            with open(epics_path, 'r', encoding='utf-8') as f:
                all_data.update(json.load(f))
        except Exception as e:
            print(f'[build_chunks] Warning loading epics: {e}')

    # 1. Feed Chunk (1.6 MB)
    feed_data = {}
    if os.path.exists(active_ranks_path):
        try:
            with open(active_ranks_path, 'r', encoding='utf-8') as f:
                ar = json.load(f)
                for k in ar.keys():
                    if k in all_data:
                        feed_data[k] = all_data[k]
        except Exception as e:
            print(f'[build_chunks] Warning loading active rankings: {e}')

    feed_file = os.path.join(data_dir, 'explanations_feed.json')
    with open(feed_file + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(feed_data, f, separators=(',', ':'), ensure_ascii=False)
    if os.path.exists(feed_file):
        os.remove(feed_file)
    os.rename(feed_file + '.tmp', feed_file)

    chunk_files = [feed_file]

    # 2. Religion Chunks
    religions = ['islam', 'christianity', 'judaism', 'hinduism', 'buddhism', 'sikhism', 'philosophy']
    by_rel = {}
    for k, v in all_data.items():
        prefix = k.split('_')[0].lower()
        matched = False
        for r in religions:
            if prefix == r or k.startswith(r + '_'):
                by_rel.setdefault(r, {})[k] = v
                matched = True
                break
        if not matched:
            kl = k.lower()
            if 'mahabharata' in kl or 'ramayana' in kl:
                by_rel.setdefault('epics', {})[k] = v
            else:
                by_rel.setdefault('misc', {})[k] = v

    for rel, rdata in by_rel.items():
        if rel == 'epics':
            continue # already saved in explanations_epics.json
        c_path = os.path.join(data_dir, f'explanations_{rel}.json')
        with open(c_path + '.tmp', 'w', encoding='utf-8') as f:
            json.dump(rdata, f, separators=(',', ':'), ensure_ascii=False)
        if os.path.exists(c_path):
            os.remove(c_path)
        os.rename(c_path + '.tmp', c_path)
        chunk_files.append(c_path)

    # 3. Ensure www/data and android assets have empty stubs (keeps APK ~10MB instead of ~80MB)
    stubs = [
        os.path.join('www', 'data', 'verse_explanations.json'),
        os.path.join('www', 'data', 'explanations_epics.json'),
        os.path.join('android', 'app', 'src', 'main', 'assets', 'public', 'data', 'verse_explanations.json'),
        os.path.join('android', 'app', 'src', 'main', 'assets', 'public', 'data', 'explanations_epics.json')
    ]
    for stub in stubs:
        try:
            os.makedirs(os.path.dirname(stub), exist_ok=True)
            with open(stub, 'w', encoding='utf-8') as f:
                f.write('{}')
        except Exception:
            pass

    print(f'[build_chunks] Successfully built {len(chunk_files)} modular explanation chunks.')
    return chunk_files

if __name__ == '__main__':
    build_chunks()
