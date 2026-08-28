# SpatialLM 部署指南（后续加分项 · 本阶段不执行安装）

> 日期：2026-08-28  
> 依据：`docs/SpatialLM_白盒报告.md` §5–§6、官方 `SpatialLM/README.md` / `FINETUNE.md`  
> 本文件是**部署蓝图**。当前保主线策略下 **不装环境、不下权重、不跑推理**。  
> 代码仓在 `SpatialLM/`（未跟踪，不入库）。权重与数据集 **不要** 写入 git。

---

## 0. 何时才需要部署

- demo 主链路已用 GT `scene_graph.json`，**不依赖本指南即可交付**。
- 仅当 48h 有富余、且 PI 法务确认 **CC-BY-NC-4.0** 可用于赛事时，再按本文在 **Linux/WSL2** 上搭推理机。

---

## 1. 环境

| 项 | 要求 | 备注 |
|---|---|---|
| OS | **Linux 或 WSL2 (Ubuntu)** | Windows 原生大概率编不过 CUDA 扩展（白盒报告 §5.2） |
| GPU | NVIDIA，驱动支持 CUDA 12.x | 推理显存官方未写死；微调官方约 **60GB**；社区有 8GB 笔记本跑 Qwen-0.5B 个例，**待实测** |
| CUDA toolkit | **12.4**（与 README 实测一致） | `conda install -y -c nvidia/label/cuda-12.4.0 cuda-toolkit` |
| Python | **3.11**（Poetry 约束 3.10–3.12） | 单独 conda 环境，勿与 backend 混装 |
| PyTorch | **2.4.1 + cu124** | 官方 `pyproject.toml` pin |

不建议在本机 Windows PowerShell 里 `poetry install` SpatialLM1.1。

---

## 2. 依赖安装顺序（1.1 / Qwen-0.5B）

在已 clone/解压的 `SpatialLM/` 目录：

```bash
conda create -n spatiallm python=3.11
conda activate spatiallm
conda install -y -c nvidia/label/cuda-12.4.0 cuda-toolkit conda-forge::sparsehash

pip install poetry && poetry config virtualenvs.create false --local
poetry install
```

然后 **按顺序** 补 1.1 推理扩展（`pyproject.toml` 的 `poe install-sonata`）：

1. **torch / torchvision / torchaudio（cu124）**  
   已由 Poetry 的 pytorch 源拉取。先验证：
   `python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.version.cuda)"`
2. **transformers**（Poetry：`>=4.41.2,<=4.46.1`）+ **safetensors** + **huggingface_hub**
3. **open3d / einops / addict / timm / numpy / scipy**（Poetry 已列）
4. **1.1 必需 CUDA 扩展**（编译慢、易失败）：
   - `poe install-flash-attn` → `pip install ninja flash-attn --no-build-isolation`
   - `poe install-torch-scatter` → `pip install torch-scatter -f https://data.pyg.org/whl/torch-2.4.0+cu124.html`
   - `poe install-spconv` → `pip install timm spconv-cu120`  
     **待确认**：包名是 `spconv-cu120` 而 torch 为 cu124，官方如此写；若导入失败再按 spconv 文档换 CUDA 轮子，不要混装多份 torch。
5. 再次确认：`python -c "import flash_attn, spconv, torch_scatter, open3d; print('ok')"`

**不要装（本路线）**：

- `poe install-torchsparse`：仅 SpatialLM **1.0** / SceneScript
- `poe install-training`：仅微调（omegaconf / datasets / accelerate / wandb）

**编译坑（已知，不编新结论）**：

- `flash-attn` 要匹配当前 torch 的 CUDA，编译可耗时数十分钟；需 `nvcc` 在 PATH。
- 实验室若无 `wget`，用 `curl -L`；`pip install git+https://...` 失败则 zip 源码本地装（见《外网受限环境_克隆与权重下载指南》）。
- NumPy 2.x 与部分扩展冲突：Poetry 约束 `numpy ^1.26`，不要擅自升 2.x。

---

## 3. 权重下载（本阶段不下）

推荐模型：[`manycore-research/SpatialLM1.1-Qwen-0.5B`](https://huggingface.co/manycore-research/SpatialLM1.1-Qwen-0.5B)

| 项 | 值 |
|---|---|
| gated | **否**（HF API 2026-08-28） |
| 主文件 | `model.safetensors` **2,414,130,784 B ≈ 2.25 GB** |
| 许可 | **cc-by-nc-4.0**（待 PI 法务） |
| 另有 | tokenizer / config.json 等小文件 |

**单源、可续传**（与《外网受限环境_克隆与权重下载指南》一致）：

```bash
export HF_ENDPOINT=https://hf-mirror.com
export HF_HOME=/path/on/datadisk/.hf   # 不要写系统盘
huggingface-cli download manycore-research/SpatialLM1.1-Qwen-0.5B \
  --local-dir /path/on/datadisk/weights/SpatialLM1.1-Qwen-0.5B
```

或对 **同一个** resolve URL 用 `wget -c` / `curl -C -` 只拉 `model.safetensors`。  
**禁止** 对同一文件在 huggingface.co 与 hf-mirror 之间混用断点续传。

下载后校验字节数 = `2414130784`。若只有几 KB，多半是 HTML 错误页，删了重下。

`config.json` 里的 `point_backbone` / `projector` / `point_config.num_bins`：**待权重落地后核对**（白盒阶段直连 HF 超时，未读到）。

---

## 4. Smoke test（有权重、有 GPU 之后）

官方示例（README）：

```bash
# 可选：拉 Testset 一条 ply（体积远小于 Dataset，仍不要进 git）
huggingface-cli download manycore-research/SpatialLM-Testset \
  pcd/scene0000_00.ply --repo-type dataset --local-dir .

cd SpatialLM
python inference.py \
  --point_cloud pcd/scene0000_00.ply \
  --output scene0000_00.txt \
  --model_path /path/on/datadisk/weights/SpatialLM1.1-Qwen-0.5B
```

通过标准：

- 进程能 `model.to("cuda")`，无缺扩展报错
- 终端打印 `Generating layout...` 后写出 txt
- txt 中出现 `wall_` / `bbox_` 行（具体 F1 不在 smoke 范围）

可视化（可选）：`python visualize.py --point_cloud ... --layout scene0000_00.txt --save out.rrd && rerun out.rrd`

**不要** 把 0330 的 SuperSplat `3dgs_compressed.ply` 直接喂 `inference.py`。先跑 `scripts/convert_supersplat_to_ply.py` 得到 `3dgs_standard.ply`（见接入方案）。

---

## 5. Windows 说明

| 步骤 | Windows 原生 | WSL2/Linux |
|---|---|---|
| 读 header / 转标准 ply | 可以（本机已转 0330） | 可以 |
| 装 flash-attn / spconv | **基本不行** | 按 §2 |
| `inference.py` | `model.to("cuda")` 无 CPU 回退 | 目标环境 |

结论：转换脚本可在 Windows 跑；**推理必须 Linux/WSL + GPU**。

---

## 6. 待确认

- [ ] NC 许可是否允许本赛事使用 Qwen/Sonata 权重
- [ ] `spconv-cu120` 与 CUDA 12.4 的实际兼容
- [ ] 本机/服务器推理显存（Qwen-0.5B + Sonata + 77 万点下采样后）
- [ ] 1.1 权重 `config.json` 的 projector 是 `linear` 还是 `mlp`

---

## 附录：笔记本环境（RTX 4060 / 8GB / WSL）部署踩坑（2026-08-28 实测）

> 结论：笔记本（8GB 显存 + 共享内存）跑 SpatialLM 1.1 的 **flash-attn 源码编译不可行**（OOM/超时），且 sm_89 无官方预编译 wheel。建议用 Linux 服务器（≥16GB）或跳过 flash-attn。

### 环境
- WSL2 Ubuntu 24.04；RTX 4060 Laptop 8GB（sm_89）；torch 2.4.1+cu124（`cuda.is_available=True`）
- 权重 `SpatialLM1.1-Qwen-0.5B`（2.25GB）hf-mirror 单源校验通过；官方 Testset `scene0000_00.ply` 已下

### flash-attn 三次失败
1. GitHub 预编译 wheel 对 sm_89 **404**
2. 源码编译挂起，`.whl` 非法（半成品）
3. `nvcc` **exit 137（OOM）**：默认编 sm_80+sm_90，4060 是 sm_89；另有网络超时

### 绕过的坑（以后别再走 poetry 死等）
- 无 `poetry.lock` 时 `poetry install` 会在 pytorch 源挂很久 → **改 pip 装 cu124 的 torch**
- poetry 不落 transformers → **按 pyproject 用 pip 装其余依赖**
- 隔离构建找不到 setuptools → 用 **`PYTHONPATH`**，不装 editable

### 建议
- 有 Linux 服务器（≥16GB）再回填；或尝试 `TORCH_CUDA_ARCH_LIST=8.9 MAX_JOBS=1`（仍可能 30-60min + OOM）
- 环境/权重已存档 `/home/zangy/spatiallm-s0/`（不删）

