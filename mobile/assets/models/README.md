# On-device ML model files (not committed — too large)

Place exported artifacts here after training:

```bash
pip install -r ml/requirements-export.txt
python ml/scripts/export_mobile_models.py --copy-to-mobile
```

Expected files:

- `mobile_manifest.json` (updated by export)
- `resnet50_pre.tflite`, `resnet50_post.tflite`
- `rf_pre.onnx`, `rf_post.onnx`

Without these files the app falls back to the rule-based heuristic offline predictor.
