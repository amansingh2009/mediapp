"""Launch with this project's environment, without shell-specific export steps."""
import os
from pathlib import Path

import uvicorn

for line in Path(__file__).with_name('.env').read_text().splitlines() if Path(__file__).with_name('.env').exists() else []:
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())
if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=8102, app_dir=str(Path(__file__).parent))
