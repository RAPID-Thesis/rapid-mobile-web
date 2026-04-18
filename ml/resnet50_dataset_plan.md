# ResNet50 Image Classifier — Alternative Dataset Plan

Since local-government RDANA photo data was not acquired, the ResNet50 model will be
fine-tuned using publicly available earthquake damage imagery. This document maps PRD
requirements to specific open datasets, defines the label schema, and outlines the
training pipeline.

## PRD Requirements Recap

From `PRD-RAPID-MVP.md` §4.1 and §10:

| Requirement | Value |
|---|---|
| Architecture | ResNet50 (transfer learning) |
| Input | Multi-angle building photographs |
| Detects | Shear cracks, spalling, crushing, leaning, partial collapse |
| Pre-EQ labels | Low / Moderate / High visual risk |
| Post-EQ labels | SAFE / RESTRICTED / UNSAFE |
| F1 target | ≥ 0.85 (macro, on validation set) |

## Recommended Open Datasets

### 1. PEER Hub ImageNet (PHI-Net) — *primary*

- **Source:** Pacific Earthquake Engineering Research Center (UC Berkeley)
- **URL:** <https://apps.peer.berkeley.edu/phi-net/>
- **Size:** ~36,000 images across structural component types and damage states
- **Labels:** Damage severity (undamaged / minor / moderate / severe / collapse) per component
- **Why:** Purpose-built for structural damage recognition; includes cracks, spalling, partial collapse. 
  Directly aligned with FEMA / ATC damage categories.
- **License:** Research use

### 2. QLCR Earthquake Damage Image Dataset (Kaggle)

- **Source:** Kaggle — "Earthquake Damage Images" datasets
- **URL:** <https://www.kaggle.com/datasets> (search "earthquake damage buildings")
- **Size:** 5,000–10,000 images (varies by collection)
- **Labels:** Typically binary (damaged / undamaged) or three-class
- **Why:** Easy to download; supplements PHI-Net with real-world earthquake field photos

### 3. AIDER (Aerial Image Dataset for Emergency Response)

- **Source:** IEEE DataPort
- **URL:** <https://ieee-dataport.org/open-access/aider-aerial-image-dataset-emergency-response>
- **Size:** ~4,000 annotated aerial images
- **Labels:** Collapsed building, fire/smoke, flood, traffic incident, normal
- **Why:** Aerial perspective complements ground-level photos; useful for the "collapse"
  class that ground-level datasets underrepresent

### 4. CrackForest / Concrete Crack Images

- **Source:** Multiple (Mendeley Data, Kaggle)
- **URL:** <https://data.mendeley.com/datasets/5y9wdsg2zt/2> (Concrete Crack Images)
- **Size:** ~40,000 images (crack / no-crack)
- **Why:** Strengthens the model's ability to detect fine surface cracks in concrete,
  a key indicator in FEMA P-154 screening

### 5. xBD (xView2 Building Damage)

- **Source:** DIUx / xView2 Challenge
- **URL:** <https://xview2.org/>
- **Size:** ~850,000 building annotations from satellite imagery (pre and post-disaster pairs)
- **Labels:** No damage / Minor / Major / Destroyed (Joint Damage Scale)
- **Why:** Largest labeled building damage dataset; satellite view provides a different
  perspective that boosts generalization. Can filter to earthquake-only events.

## Label Mapping

All datasets will be unified into the RAPID three-class schema. The mapping converts
each source's native labels into the labels used by the RAPID system.

### Pre-EQ Mode (Vulnerability Screening)

| Unified Label | PHI-Net | Crack Images | Kaggle | xBD |
|---|---|---|---|---|
| **Low** | Undamaged | No crack | Undamaged | No damage |
| **Moderate** | Minor / Moderate | Crack (mild) | Light damage | Minor |
| **High** | Severe / Collapse | Crack (severe) | Heavy damage | Major / Destroyed |

### Post-EQ Mode (Safety Triage)

| Unified Label | PHI-Net | Crack Images | Kaggle | xBD |
|---|---|---|---|---|
| **SAFE** | Undamaged / Minor | No crack | Undamaged | No damage / Minor |
| **RESTRICTED** | Moderate | Crack (mild) | Light damage | Major (partial) |
| **UNSAFE** | Severe / Collapse | Crack (severe) | Heavy damage | Major (full) / Destroyed |

## Recommended Download Priority

For the MVP, start with **PHI-Net + Concrete Crack Images** — together they cover
the full severity spectrum with enough volume (~50k+ images after augmentation) to
fine-tune ResNet50 effectively.

| Priority | Dataset | Approx. Size | Download Effort |
|---|---|---|---|
| 1 | PHI-Net | ~36k images | Registration required |
| 2 | Concrete Crack Images | ~40k images | Direct download from Mendeley |
| 3 | Kaggle EQ Damage | ~5–10k images | Kaggle account + `kaggle datasets download` |
| 4 | xBD (EQ subset) | ~50k buildings | Large download (~30 GB); filter to EQ events |
| 5 | AIDER | ~4k images | IEEE DataPort account |

## Training Pipeline Overview

```
ml/
├── data/
│   └── images/
│       ├── train/
│       │   ├── low/          (or SAFE/)
│       │   ├── moderate/     (or RESTRICTED/)
│       │   └── high/         (or UNSAFE/)
│       └── val/
│           ├── low/
│           ├── moderate/
│           └── high/
├── scripts/
│   ├── download_phinet.py          # fetch + unzip PHI-Net
│   ├── unify_image_labels.py       # remap source labels -> RAPID schema
│   └── train_resnet50.py           # transfer learning script
├── train_resnet50.py               # (or keep in scripts/)
└── requirements_image.txt          # tensorflow, pillow, albumentations
```

### Training Steps (to be implemented)

1. **Download** PHI-Net and Concrete Crack Images into `ml/data/images/raw/`.
2. **Remap labels** using `unify_image_labels.py` → copy/symlink into
   `train/{low,moderate,high}` and `val/{low,moderate,high}` with an 80/20 split.
3. **Fine-tune ResNet50** via `tf.keras.applications.ResNet50(weights="imagenet")`:
   - Freeze base layers, train new classification head (3 classes).
   - Unfreeze top ~30 layers, fine-tune with low learning rate (1e-5).
   - Image size: 224 × 224, augmentation: rotation, flip, brightness, Gaussian blur.
4. **Evaluate** on validation set — target ≥ 0.85 macro F1.
5. **Export** SavedModel to `ml/artifacts/resnet50_pre/` and `resnet50_post/`.

## Data Augmentation Strategy

Because some damage classes are rare, augmentation is critical:

- Random horizontal flip
- Random rotation (±15°)
- Random brightness/contrast shift
- Random crop (90–100% of original)
- Gaussian blur (σ 0–1.5)
- CutMix / MixUp (for inter-class regularization)

Target: ≥ 3,000 images per class after augmentation for both train and validation splits.
