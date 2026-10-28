"""Resume the existing CRNN on its original, hash-separated training split.

Validation selects the checkpoint. The existing test split is evaluated once at
the end; it is a regression benchmark, not evidence of clinical performance.
"""
import argparse
import hashlib
import importlib.util
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=24)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('original_crnn', args.source / 'training/train_ocr.py')
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    random.seed(73); np.random.seed(73); torch.manual_seed(73); torch.set_num_threads(4)
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    source = args.source / 'model_registry/rxhandbd-crnn-v2/best.pt'
    checkpoint = torch.load(source, map_location='cpu', weights_only=True)
    characters = checkpoint['characters']; vocabulary = {c: i + 1 for i, c in enumerate(characters)}
    model = original.CRNN(len(characters) + 1).to(device); model.load_state_dict(checkpoint['state_dict'])
    records = json.loads((args.source / 'data/processed/rxhandbd/splits.json').read_text())
    train_hashes = {r['digest'] for r in records['train']}
    assert not train_hashes.intersection(r['digest'] for r in records['validation'] + records['test'])
    def loader(split, shuffle=False):
        return DataLoader(original.Words(records[split]), batch_size=64, shuffle=shuffle, collate_fn=original.collate, generator=torch.Generator().manual_seed(73))
    training, validation = loader('train', True), loader('validation')
    baseline = original.evaluate(model, validation, device, characters)
    args.output.mkdir(parents=True, exist_ok=True)
    best = baseline['cer']; best_epoch = 0; stale = 0
    torch.save(checkpoint, args.output / 'best.pt')
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0002, weight_decay=0.0001)
    criterion = nn.CTCLoss(blank=0, zero_infinity=True)
    report = {'status': 'TRAINING', 'started_at': datetime.now(timezone.utc).isoformat(), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'source': str(source), 'dataset': 'RxHandBD', 'dataset_url': 'https://zenodo.org/records/18478741', 'seed': 73, 'device': str(device), 'splits': {k: len(v) for k,v in records.items()}, 'baseline_validation': baseline, 'learning_rate': 0.0002, 'augmentation': 'Gaussian pixel noise sigma=0.025 on training only', 'history': [], 'clinical_validation': False}
    def persist():
        (args.output / 'status.json').write_text(json.dumps(report, indent=2))
    persist(); print(json.dumps({'baseline_validation_cer': best, 'device': str(device)}), flush=True)
    for epoch in range(1, args.epochs + 1):
        model.train(); losses=[]; tick=time.monotonic()
        for images, labels in training:
            images = (images + torch.randn_like(images) * .025).clamp(-1, 1)
            targets = torch.tensor([vocabulary[c] for label in labels for c in label], dtype=torch.long)
            lengths = torch.tensor([len(label) for label in labels], dtype=torch.long)
            output = model(images.to(device))
            loss = criterion(output.cpu(), targets, torch.full((len(labels),), output.shape[0], dtype=torch.long), lengths)
            if not torch.isfinite(loss): raise RuntimeError('Non-finite loss')
            optimizer.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(),5); optimizer.step(); losses.append(loss.item())
        measured = original.evaluate(model, validation, device, characters)
        row = {'epoch': epoch, 'train_loss': sum(losses)/len(losses), 'validation_cer': measured['cer'], 'validation_exact_match': measured['exact_match'], 'seconds': time.monotonic()-tick}
        if measured['cer'] < best:
            best=measured['cer']; best_epoch=epoch; stale=0
            torch.save({'state_dict': {k:v.cpu() for k,v in model.state_dict().items()}, 'characters':characters, 'epoch':epoch, 'parent_epoch':checkpoint['epoch']}, args.output / 'best.pt')
        else: stale+=1
        report['history'].append(row); report.update(best_validation_cer=best, selected_epoch=best_epoch); persist(); print(json.dumps(row),flush=True)
        if stale >= 7: break
    selected = torch.load(args.output / 'best.pt', map_location='cpu', weights_only=True); model.load_state_dict(selected['state_dict'])
    report.update(status='COMPLETED_EXPERIMENTAL', completed_at=datetime.now(timezone.utc).isoformat(), improved_validation=best_epoch > 0, test=original.evaluate(model,loader('test'),device,characters), limitations=['Word crops only; full-page extraction is separately tested', 'Unknown writer independence', 'Test split was used in earlier evaluation', 'All decoded medicine details require human confirmation'])
    persist(); print(json.dumps({'status':report['status'],'selected_epoch':best_epoch,'test':report['test']}),flush=True)

if __name__ == '__main__': main()
