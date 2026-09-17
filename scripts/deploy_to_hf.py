import os
import sys
from huggingface_hub import HfApi

TOKEN = os.environ.get('HF_TOKEN')
REPO_ID = 'pavanbadempet/movie-rec-api'

if not TOKEN:
    print('HF_TOKEN environment variable is not set.')
    sys.exit(1)

ignore_patterns = [
    '.git/*',
    '.github/*',
    '.hypothesis/*',
    '.mypy_cache/*',
    '.pytest_cache/*',
    '.ruff_cache/*',
    '.wrangler/*',
    '.agents/*',
    '.kiro/*',
    'node_modules/*',
    'frontend/node_modules/*',
    'frontend/coverage/*',
    'dist/*',
    'target/*',
    '*/target/*',
    'backend/rust_core/target/*',
    'services/engine-rs/target/*',
    'tests/*',
    'tests/**/*',
    '**/*.pyc',
    '**/__pycache__/*',
    '*.onnx',
    '*.onnx.data',
    '*.tq',
    '*.npy',
    '*.joblib*',
    '*.index',
    '*.gpickle',
    '*.parquet',
    '*.bin',
    'models/*',
    'models/**/*',
    'backend/models/*',
    'backend/models/**/*',
    'backend/data/*',
    'backend/data/**/*',
    'data/processed/*',
    'data/bronze/*',
    'data/silver/*',
    'data/gold/*',
    'data/manifests/*',
    'data/quality/*',
    '.hadoop/*',
    '*.sqlite3*',
    '*.log',
    '*.err',
    '*.tmp'
]

def main():
    print(f'Connecting to Hugging Face Space {REPO_ID}...')
    api = HfApi(token=TOKEN)

    with open('README.md', 'r', encoding='utf-8') as f:
        content = f.read()

    if not content.startswith('---'):
        frontmatter = '---\\ntitle: Movie Recommendation System\\nemoji: 🎬\\ncolorFrom: blue\\ncolorTo: indigo\\nsdk: docker\\npinned: false\\n---\\n\\n'
        with open('README.md', 'w', encoding='utf-8') as f:
            f.write(frontmatter + content)

    print('Uploading folder with comprehensive ignore patterns...')
    commit_info = api.upload_folder(
        folder_path='.',
        repo_id=REPO_ID,
        repo_type='space',
        ignore_patterns=ignore_patterns,
        commit_message='feat(ui): deploy interactive cinema trailers and SOTA Lakehouse watchlist'
    )
    print('Upload succeeded!')
    print(commit_info)

if __name__ == '__main__':
    main()
