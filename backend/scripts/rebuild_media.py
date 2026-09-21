"""One-off tool: rebuild every catalogue image/video from its original source, without MongoDB.

Not part of the running app. It runs the original seed scripts unchanged but swaps their
two dependencies:
  * pymongo      -> an in-process `catalog_assets` collection saved to manifest.json
  * media_store  -> a local folder instead of the retired Emergent object store
Output: backend/.media_build/<files> + manifest.json (key -> path, content type).
Idempotent: keys already in the manifest are skipped by the seed scripts themselves.
"""
import json, os, runpy, sys, threading, types, traceback
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / '.media_build'
MANIFEST = OUT / 'manifest.json'
os.environ.setdefault('MONGO_URL', 'local-manifest')
os.environ.setdefault('DB_NAME', 'local')
sys.path.insert(0, str(BACKEND))
OUT.mkdir(exist_ok=True)
_lock = threading.Lock()
_assets = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def _save():
    MANIFEST.write_text(json.dumps(_assets, indent=1, sort_keys=True))


class _Assets:
    def find_one(self, query, projection=None):
        with _lock:
            doc = _assets.get(query.get('id'))
            return dict(doc) if doc else None

    def update_one(self, query, update, upsert=False):
        with _lock:
            doc = _assets.setdefault(query['id'], {'id': query['id']})
            doc.update(update.get('$set', {}))
            _save()


class _DB:
    catalog_assets = _Assets()


fake_pymongo = types.ModuleType('pymongo')
fake_pymongo.MongoClient = lambda *a, **k: {os.environ['DB_NAME']: _DB()}
fake_pymongo.ReturnDocument = types.SimpleNamespace(AFTER=True, BEFORE=False)
sys.modules['pymongo'] = fake_pymongo


def put_object(path, data, content_type):
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {'path': path, 'size': len(data), 'content_type': content_type}


def get_object(path):
    key = next((k for k, v in _assets.items() if v.get('storage_path') == path), None)
    return (OUT / path).read_bytes(), (_assets.get(key) or {}).get('content_type', 'application/octet-stream')


fake_store = types.ModuleType('media_store')
fake_store.put_object, fake_store.get_object = put_object, get_object
fake_store.init_storage = lambda: 'local'
# server_old.py (imported for its legacy photo map) mounts media_store.router.
from fastapi import APIRouter
fake_store.router = APIRouter()
sys.modules['media_store'] = fake_store

# Order matters: later scripts derive assets (cut-outs, tiles, reels, WebM) from earlier ones.
STEPS = ['seed_media.py', 'legacy', 'seed_city_media.py', 'seed_store_assets.py',
         'seed_motion_assets.py', 'seed_festival_refresh.py', 'transcode_reels.py']

if __name__ == '__main__':
    only = set(sys.argv[1:])
    for step in STEPS:
        if only and step not in only:
            continue
        print(f'==== {step}', flush=True)
        try:
            if step == 'legacy':
                # seed_legacy_media.py imports the map from server.py, which no longer has it.
                from concurrent.futures import ThreadPoolExecutor
                from seed_media import upload
                from server_old import LEGACY_MEDIA_SOURCES
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(upload, LEGACY_MEDIA_SOURCES.items()))
            else:
                runpy.run_path(str(BACKEND / step), run_name='__main__')
        except Exception:
            print(f'STEP FAILED {step}:\n{traceback.format_exc()}', flush=True)
    print(f'==== manifest: {len(_assets)} assets -> {MANIFEST}', flush=True)
