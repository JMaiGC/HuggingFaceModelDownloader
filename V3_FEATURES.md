# HuggingFace Model Downloader v3.0 — Feature Documentation

> **Internal Document** — Source material for README and release notes

---

## Breaking Change: HuggingFace Cache Compatibility

v3.0 adopts the **official HuggingFace Hub cache structure** as the default storage method. This enables full interoperability with Python libraries (transformers, diffusers, datasets).

**Before (v2.x):**
```
Models/TheBloke/Mistral-7B-GGUF/
  └── mistral-7b.Q4_K_M.gguf
```

**After (v3.0):**
```
~/.cache/huggingface/
├── hub/models--TheBloke--Mistral-7B-GGUF/   # HF Cache (Python compatible)
│   ├── blobs/3a7bd3e2...                     # Actual files by SHA256
│   ├── refs/main                             # Branch → commit mapping
│   └── snapshots/a1b2c3.../                  # Symlinks with original names
└── models/TheBloke/Mistral-7B-GGUF/          # Friendly view (human readable)
    └── mistral-7b.Q4_K_M.gguf → ../hub/.../snapshots/...
```

---

## Architecture: Dual-Layer Design

### Layer 1: HF Cache (`hub/`)
- **Purpose**: Standard HuggingFace Hub cache for Python compatibility
- **Structure**: `models--{owner}--{repo}/` with `blobs/`, `refs/`, `snapshots/`
- **Benefits**:
  - Python libraries read directly (`AutoModel.from_pretrained()` just works)
  - Blob deduplication across revisions
  - Resume support with `.incomplete` files

### Layer 2: Friendly View (`models/`, `datasets/`)
- **Purpose**: Human-readable paths for browsing
- **Structure**: `{owner}/{repo}/{filename}` with optional filter subdirs
- **Benefits**:
  - Easy to navigate in file manager
  - Optional organization by quantization (`q4_k_m/`, `q5_k_m/`)

---

## Core Features (Phase 1)

### HF Cache Structure
| Feature | Description | Flag/Config |
|---------|-------------|-------------|
| Blob storage | Files stored by SHA256 hash in `blobs/` | Automatic |
| Refs management | Branch → commit mapping in `refs/main` | Automatic |
| Snapshots | Symlinks preserving original filenames | Automatic |
| Resume support | `.incomplete` + `.incomplete.meta` files | Automatic |
| Stale timeout | Detect abandoned incomplete downloads | `--stale-timeout` |
| Custom cache dir | Override default cache location | `--cache-dir` |
| Environment vars | `HF_HOME`, `HF_HUB_CACHE` support | Automatic |

### Friendly View
| Feature | Description | Flag/Config |
|---------|-------------|-------------|
| Models directory | `models/{owner}/{repo}/` symlinks | Automatic |
| Datasets directory | `datasets/{owner}/{repo}/` symlinks | `--dataset` |
| Filter subdirs | Organize by filter (`q4_k_m/`) | `--append-filter-subdir` |
| Rebuild command | Regenerate symlinks from cache | `hfdownloader rebuild` |
| Clean orphans | Remove stale symlinks | `rebuild --clean` |
| Manifest files | `hfd.yaml` per repo with metadata | Automatic |
| Standalone script | `rebuild.sh` for Python-only users | Generated |

### Download Verification
| Feature | Description | Flag/Config |
|---------|-------------|-------------|
| SHA256 verification | LFS files verified by hash | Automatic |
| Size verification | Non-LFS files checked by size | `--verify size` |
| ETag verification | HTTP ETag matching | `--verify etag` |
| Concurrent protection | Lock files prevent corruption | Automatic |

---

## Mirror Feature

Sync HuggingFace caches between machines for airgapped deployments or backups.

### Target Management
```bash
# Add named targets
hfdownloader mirror target add office /mnt/nas/hfcache
hfdownloader mirror target add usb /media/usb/hfcache -d "USB for airgapped"

# List targets
hfdownloader mirror target list

# Remove target
hfdownloader mirror target remove office
```

### Diff Command
```bash
# Compare local cache with target
hfdownloader mirror diff office
hfdownloader mirror diff office --repo Mistral  # Filter by name

# Output:
# STATUS      TYPE     REPO                              SIZE
# ----------  -------  ----------------------------------------  ----------
# missing     model    TheBloke/Mistral-7B-GGUF          4.1 GiB
# extra       model    old/deprecated-model              512 MiB
```

### Push/Pull Commands
```bash
# Push to target (local → target)
hfdownloader mirror push office
hfdownloader mirror push office --repo Mistral   # Filter
hfdownloader mirror push office --dry-run        # Preview only
hfdownloader mirror push office --verify         # Verify after copy
hfdownloader mirror push office --delete         # Remove extra repos
hfdownloader mirror push office --force          # Re-copy incomplete

# Pull from target (target → local)
hfdownloader mirror pull office
hfdownloader mirror pull office --force          # Fix corrupted repos
```

### Edge Case Handling
| Feature | Description | Flag |
|---------|-------------|------|
| Incomplete detection | Detect repos missing blobs/refs/snapshots | Automatic |
| Broken symlink detection | Find symlinks pointing to missing blobs | Automatic |
| Force re-copy | Re-copy incomplete or outdated repos | `--force` |
| Integrity comparison | Compare blob counts between source/dest | `--force` |

---

## CLI Commands

### Download (default command)
```bash
hfdownloader TheBloke/Mistral-7B-GGUF
hfdownloader TheBloke/Mistral-7B-GGUF:q4_k_m    # With filter
hfdownloader -r owner/repo -F q4_k_m,q5_k_m     # Multiple filters
hfdownloader -r owner/repo -E fp16,.md          # Exclude patterns
hfdownloader -r owner/repo --dataset            # Download dataset
hfdownloader -r owner/repo --dry-run            # Plan only
```

### List Command
```bash
hfdownloader list                    # List from manifests
hfdownloader list --scan             # Scan cache structure
hfdownloader list --type model       # Filter by type
hfdownloader list --sort size        # Sort by size
hfdownloader list --format json      # JSON output
```

### Info Command
```bash
hfdownloader info TheBloke/Mistral-7B-GGUF
hfdownloader info Mistral            # Partial match
hfdownloader info --format json ...  # JSON output
```

### Rebuild Command
```bash
hfdownloader rebuild                 # Rebuild friendly view
hfdownloader rebuild --clean         # Remove orphaned symlinks
hfdownloader rebuild --write-manifest # Generate missing manifests
```

---

## Manifest File (`hfd.yaml`)

Each downloaded repo gets a manifest file for tracking:

```yaml
# HuggingFace model: TheBloke/Mistral-7B-GGUF
# Downloaded: 2026-01-24T18:06:24Z
# Generated by hfdownloader

version: "1.0"
type: model
repo: TheBloke/Mistral-7B-GGUF
branch: main
commit: a1b2c3d4e5f6...
repo_path: hub/models--TheBloke--Mistral-7B-GGUF
started_at: 2026-01-24T18:06:24Z
completed_at: 2026-01-24T18:06:30Z
command: hfdownloader TheBloke/Mistral-7B-GGUF -F q4_k_m
total_size: 4370000000
total_files: 5
files:
  - name: config.json
    blob: blobs/9f86d081...
    size: 1234
    lfs: false
  - name: mistral-7b.Q4_K_M.gguf
    blob: blobs/3a7bd3e2...
    size: 4369998766
    lfs: true
```

**Use cases:**
- Track what was downloaded and when
- Reproduce downloads with saved command
- Automation scripts can read file locations

---

## Configuration

### Config File
Location: `~/.config/hfdownloader.yaml` (or `.json`)

```yaml
connections: 8
max-active: 3
verify: size
endpoint: https://hf-mirror.com  # Custom mirror
```

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `HF_HOME` | Override `~/.cache/huggingface` root |
| `HF_HUB_CACHE` | Override `hub/` directory specifically |
| `HF_TOKEN` | Authentication token |

---

## Global Flags

| Flag | Description |
|------|-------------|
| `-t, --token` | HuggingFace access token |
| `--json` | Machine-readable JSON output |
| `-q, --quiet` | Minimal output |
| `-v, --verbose` | Debug output |
| `--config` | Path to config file |
| `--log-file` | Write logs to file |
| `--log-level` | Log level: debug, info, warn, error |

---

## Download Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --repo` | Repository ID (owner/name) | - |
| `--dataset` | Treat repo as dataset | false |
| `-b, --revision` | Branch/revision to download | main |
| `-F, --filters` | Include patterns (comma-separated) | - |
| `-E, --exclude` | Exclude patterns (comma-separated) | - |
| `--append-filter-subdir` | Create filter subdirectories | false |
| `--cache-dir` | Override cache directory | ~/.cache/huggingface |
| `--stale-timeout` | Timeout for stale incomplete files | 5m |
| `-c, --connections` | Per-file concurrent connections | 8 |
| `--max-active` | Max files downloading at once | 3 |
| `--multipart-threshold` | Min size for multipart download | 32MiB |
| `--verify` | Verification: none, size, etag, sha256 | size |
| `--retries` | Max retry attempts | 4 |
| `--endpoint` | Custom HuggingFace endpoint | - |
| `--no-manifest` | Don't write hfd.yaml | false |
| `--no-friendly` | Don't create friendly view | false |
| `--legacy` | Use v2.x flat structure | false |
| `--dry-run` | Plan only, don't download | false |

---

## Python Interoperability

After downloading with hfdownloader, Python libraries work automatically:

```python
from transformers import AutoModel, AutoTokenizer

# No additional setup needed - reads from ~/.cache/huggingface/hub/
model = AutoModel.from_pretrained("TheBloke/Mistral-7B-GGUF")
tokenizer = AutoTokenizer.from_pretrained("TheBloke/Mistral-7B-GGUF")
```

---

## HuggingFace Content Types Reference

Comprehensive reference of all content types, formats, and structures on HuggingFace Hub.

### File Formats

| Format | Extension | Purpose | Security | Notes |
|--------|-----------|---------|----------|-------|
| **Safetensors** | `.safetensors` | Default HF format | ✅ Safe | Zero-copy, fast loading, no code execution |
| **PyTorch** | `.bin`, `.pt`, `.pth` | Legacy PyTorch | ⚠️ Pickle | Can contain malicious code |
| **GGUF** | `.gguf` | llama.cpp inference | ✅ Safe | CPU-optimized, quantized |
| **GGML** | `.ggml` | Legacy llama.cpp | ✅ Safe | Deprecated, use GGUF |
| **ONNX** | `.onnx` | Cross-platform | ✅ Safe | Framework-agnostic, includes compute graph |
| **TensorRT** | `.engine` | NVIDIA optimized | ✅ Safe | GPU-specific, fastest inference |
| **Checkpoint** | `.ckpt` | Stable Diffusion | ⚠️ Pickle | Legacy SD format, prefer safetensors |
| **DDUF** | `.dduf` | Diffusers format | ✅ Safe | New diffusers-specific format |

### GGUF Quantization Levels

For CPU/hybrid inference with llama.cpp, Ollama, vLLM:

| Quant | Bits | Quality | Use Case |
|-------|------|---------|----------|
| `Q2_K` | 2-bit | ★★☆☆☆ | Extreme compression, significant quality loss |
| `Q3_K_S` | 3-bit | ★★★☆☆ | Small footprint, noticeable quality loss |
| `Q3_K_M` | 3-bit | ★★★☆☆ | Balanced 3-bit |
| `Q4_0` | 4-bit | ★★★☆☆ | Basic 4-bit, fast |
| `Q4_K_S` | 4-bit | ★★★★☆ | Small 4-bit variant |
| `Q4_K_M` | 4-bit | ★★★★☆ | **Most popular** - best quality/size ratio |
| `Q5_0` | 5-bit | ★★★★☆ | Basic 5-bit |
| `Q5_K_S` | 5-bit | ★★★★☆ | Small 5-bit variant |
| `Q5_K_M` | 5-bit | ★★★★★ | High quality, reasonable size |
| `Q6_K` | 6-bit | ★★★★★ | Near-original quality |
| `Q8_0` | 8-bit | ★★★★★ | Minimal quality loss |
| `F16` | 16-bit | ★★★★★ | Full half-precision |
| `F32` | 32-bit | ★★★★★ | Full precision (rarely used) |

### GPU Quantization Methods

For GPU inference with transformers, vLLM, TGI:

| Method | Bits | Calibration | Best For |
|--------|------|-------------|----------|
| **Bitsandbytes** | INT8/INT4 | No | Fine-tuning (QLoRA), quick inference |
| **GPTQ** | 2-8 bit | Yes (~20min) | GPU inference, text generation |
| **AWQ** | 4-bit | Yes (~10min) | Edge deployment, fastest inference |
| **EXL2** | Variable | Yes | Exllama2, flexible bit allocation |

### Model Categories by Pipeline Tag

**Text Generation & Understanding:**
| Tag | Description | Example Models |
|-----|-------------|----------------|
| `text-generation` | Causal LLMs | Llama, Mistral, Qwen, Phi |
| `text2text-generation` | Seq2seq models | T5, BART, Flan-T5 |
| `text-classification` | Sentiment, topics | BERT, RoBERTa |
| `token-classification` | NER, POS tagging | BERT-NER |
| `question-answering` | Extractive QA | DistilBERT-QA |
| `summarization` | Text summarization | BART, Pegasus |
| `translation` | Machine translation | MarianMT, NLLB |
| `fill-mask` | Masked LM | BERT, RoBERTa |
| `feature-extraction` | Embeddings | Sentence-transformers |

**Vision:**
| Tag | Description | Example Models |
|-----|-------------|----------------|
| `image-classification` | Classify images | ViT, ResNet, ConvNeXT |
| `object-detection` | Detect objects | DETR, YOLO, RT-DETR |
| `image-segmentation` | Pixel classification | SAM, Mask2Former |
| `image-to-text` | Captioning, OCR | BLIP, Pix2Struct |
| `text-to-image` | Image generation | Stable Diffusion, SDXL, Flux |
| `image-to-image` | Image transformation | ControlNet, IP-Adapter |
| `depth-estimation` | Depth maps | DPT, Depth Anything |
| `zero-shot-image-classification` | Open-vocab classification | CLIP, SigLIP |

**Audio:**
| Tag | Description | Example Models |
|-----|-------------|----------------|
| `automatic-speech-recognition` | Speech-to-text | Whisper, Wav2Vec2 |
| `text-to-speech` | Speech synthesis | Bark, XTTS, Coqui |
| `audio-classification` | Sound classification | Audio Spectrogram Transformer |
| `text-to-audio` | Audio generation | MusicGen, AudioLDM |

**Multimodal:**
| Tag | Description | Example Models |
|-----|-------------|----------------|
| `visual-question-answering` | VQA | LLaVA, InternVL |
| `document-question-answering` | Document QA | LayoutLM, Donut |
| `image-text-to-text` | Vision LLMs | Phi-4-multimodal, Qwen-VL |
| `video-text-to-text` | Video understanding | Video-LLaVA |

### Diffusers Pipeline Types

For image/video generation models:

| Pipeline | Components | Example Models |
|----------|------------|----------------|
| `StableDiffusionPipeline` | unet, vae, text_encoder, tokenizer, scheduler | SD 1.5, SD 2.1 |
| `StableDiffusionXLPipeline` | unet, vae, text_encoder, text_encoder_2, tokenizer, tokenizer_2, scheduler | SDXL |
| `FluxPipeline` | transformer, vae, text_encoder, text_encoder_2, tokenizer, tokenizer_2, scheduler | Flux.1 |
| `KandinskyPipeline` | unet, movq, text_encoder | Kandinsky 2/3 |
| `StableVideoDiffusionPipeline` | unet, vae, image_encoder, scheduler | SVD |

**Diffusers Components:**
| Component | Purpose | Typical Size |
|-----------|---------|--------------|
| `unet` | Core diffusion model | 2-10 GB |
| `transformer` | Flux/DiT architecture | 5-24 GB |
| `vae` | Image encode/decode | 80-335 MB |
| `text_encoder` | CLIP ViT-L | 246 MB |
| `text_encoder_2` | CLIP ViT-bigG (SDXL) | 1.4 GB |
| `scheduler` | Noise scheduler | <1 KB (config) |
| `tokenizer` | Text tokenization | <1 KB (config) |

**Precision Variants:**
| Variant | Description | Size Reduction |
|---------|-------------|----------------|
| `fp32` | Full precision | Baseline |
| `fp16` | Half precision | ~50% smaller |
| `bf16` | Brain float | ~50% smaller, training-friendly |

### Adapters & Extensions

| Type | Format | Size | Use |
|------|--------|------|-----|
| **LoRA** | `adapter_model.safetensors` + `adapter_config.json` | 10-200 MB | Fine-tuning, style transfer |
| **PEFT** | Same as LoRA | 10-200 MB | Parameter-efficient fine-tuning |
| **ControlNet** | `diffusion_pytorch_model.safetensors` | 700 MB - 1.5 GB | Conditional image generation |
| **IP-Adapter** | Multiple safetensors | 40-100 MB | Image prompting |
| **Textual Inversion** | `.pt` or `.safetensors` | 10-100 KB | New concepts/styles |
| **VAE** | `diffusion_pytorch_model.safetensors` | 80-335 MB | Alternative image decoder |

### Dataset Formats

| Format | Extension | Streaming | Best For |
|--------|-----------|-----------|----------|
| **Parquet** | `.parquet` | ✅ Yes | Large datasets, columnar queries |
| **Arrow** | `.arrow` | ✅ Yes | In-memory processing |
| **JSON/JSONL** | `.json`, `.jsonl` | ✅ Yes (JSONL) | Flexible structure |
| **CSV** | `.csv` | ✅ Yes | Tabular data |
| **Text** | `.txt` | ✅ Yes | Plain text corpora |
| **WebDataset** | `.tar` | ✅ Yes | Large-scale image/audio |

**Dataset Splits:**
- `train` - Training data (largest)
- `validation` / `dev` - Validation data
- `test` - Test data (often held out)

### Model Sharding

Large models are split across multiple files:

| Pattern | Example | Notes |
|---------|---------|-------|
| Transformers sharding | `model-00001-of-00005.safetensors` | Auto-loaded by transformers |
| Index file | `model.safetensors.index.json` | Maps layers to shards |
| GGUF splits | `model-00001-of-00003.gguf` | For very large GGUF |

---

## Smart Downloader (Phase 3)

Interactive wizard that analyzes repos and presents intelligent download options. Outputs the same CLI flags power users type manually.

### Supported Repo Types

| Type | Detection | Wizard Features |
|------|-----------|-----------------|
| **GGUF** | `*.gguf` files | Quantization selection (Q2-Q8), RAM-based recommendations |
| **Safetensors/Transformers** | `*.safetensors` + `config.json` | Precision (fp16/fp32), shard selection |
| **Diffusers** | `model_index.json` | Component selection, precision variants, pipeline-aware |
| **LoRA/Adapters** | `adapter_config.json` | Show base model requirement, adapter info |
| **GPTQ/AWQ** | `quantize_config.json` | Show quantization info, GPU requirements |
| **ONNX** | `*.onnx` + `config.json` | Show runtime compatibility |
| **Datasets** | Dataset card markers | Split selection, subset/config choice, format preference |
| **Audio** | `preprocessor_config.json` + audio pipeline | Show supported formats, sample rate |
| **Vision** | `preprocessor_config.json` + vision pipeline | Show image requirements |
| **Multimodal** | Multiple modality configs | Show modality requirements |
| **Generic** | Fallback | Include/exclude patterns with file browser |

### GGUF Example Flow

```
$ hfdownloader TheBloke/Mistral-7B-GGUF

Detected: GGUF quantized model
Available quantizations:

  QUANT        SIZE      QUALITY   RAM NEEDED
  ─────────────────────────────────────────────
  Q2_K         2.8 GB    ★★☆☆☆     ~5 GB
  Q3_K_S       3.2 GB    ★★★☆☆     ~6 GB
  Q4_K_M       4.1 GB    ★★★★☆     ~7 GB    ← Recommended
  Q5_K_M       4.8 GB    ★★★★☆     ~8 GB
  Q6_K         5.5 GB    ★★★★★     ~9 GB
  Q8_0         7.2 GB    ★★★★★     ~10 GB

Select quantization(s): [Q4_K_M]

Include extras?
  [x] config.json (1 KB)
  [x] README.md (5 KB)

Download now? [Y/n]

Equivalent CLI:
  hfdownloader TheBloke/Mistral-7B-GGUF -F q4_k_m
```

### Diffusers Example Flow

```
$ hfdownloader stabilityai/stable-diffusion-xl-base-1.0

Detected: Diffusers pipeline (StableDiffusionXLPipeline)
Total size: ~6.9 GB

Components:
                          SIZE      REQUIRED
  ───────────────────────────────────────────
  [x] unet                5.1 GB    Yes
  [x] vae                 335 MB    Yes
  [x] text_encoder        246 MB    Yes
  [x] text_encoder_2      1.4 GB    Yes (SDXL)
  [ ] scheduler           <1 KB     Config only
  [ ] tokenizer           <1 KB     Config only

Precision:
  ( ) fp32 - Full precision (6.9 GB)
  (•) fp16 - Half precision (3.2 GB) ← Recommended for inference

Selected: 4 components, fp16 → 3.2 GB

Download now? [Y/n]

Equivalent CLI:
  hfdownloader stabilityai/stable-diffusion-xl-base-1.0 \
    -F "unet,vae,text_encoder*" --variant fp16
```

### LoRA/Adapter Example Flow

```
$ hfdownloader teknium/OpenHermes-2.5-Mistral-7B-LoRA

Detected: LoRA Adapter (PEFT)
Base model: mistralai/Mistral-7B-v0.1

Adapter info:
  Type:        LoRA
  Rank (r):    64
  Alpha:       16
  Target:      q_proj, v_proj, k_proj, o_proj
  Size:        162 MB

⚠️  This adapter requires the base model to be downloaded separately.

Download adapter? [Y/n]

Equivalent CLI:
  hfdownloader teknium/OpenHermes-2.5-Mistral-7B-LoRA
```

### GPTQ/AWQ Quantized Model Example Flow

```
$ hfdownloader TheBloke/Mistral-7B-v0.1-AWQ

Detected: AWQ Quantized Model
Base model: mistralai/Mistral-7B-v0.1

Quantization info:
  Method:      AWQ
  Bits:        4-bit
  Group size:  128
  GPU Memory:  ~5 GB (inference)

Files:
  [x] model.safetensors (4.1 GB)
  [x] config.json
  [x] tokenizer files

Download now? [Y/n]

Equivalent CLI:
  hfdownloader TheBloke/Mistral-7B-v0.1-AWQ
```

### Dataset Example Flow

```
$ hfdownloader --dataset squad

Detected: Dataset (Question Answering)
Configurations available: plain_text

Splits:
  [x] train (87,599 examples, 30 MB)
  [x] validation (10,570 examples, 4 MB)

Format: parquet

Download now? [Y/n]

Equivalent CLI:
  hfdownloader --dataset squad
```

---

## New Files in v3.0

| File | Purpose |
|------|---------|
| `pkg/hfdownloader/hfcache.go` | HF cache structure management |
| `pkg/hfdownloader/manifest.go` | Manifest types and generation |
| `pkg/hfdownloader/rebuild_script.go` | Embedded shell script |
| `pkg/hfdownloader/sync.go` | Friendly view synchronization |
| `pkg/hfdownloader/targets.go` | Mirror target configuration |
| `internal/cli/rebuild.go` | Rebuild command |
| `internal/cli/list.go` | List command |
| `internal/cli/info.go` | Info command |
| `internal/cli/mirror.go` | Mirror commands |

---

## Migration from v2.x

1. **Automatic**: New downloads use HF cache structure
2. **Legacy mode**: `--legacy` flag for v2.x behavior (flat directories)
3. **Existing downloads**: Not migrated automatically (use both structures)

**Recommendation**: Let old downloads remain, new downloads will use v3 structure.

---

*Document Version: 1.2*
*Last Updated: Added comprehensive HuggingFace content types reference*
