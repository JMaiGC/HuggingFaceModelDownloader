// Copyright 2025
// SPDX-License-Identifier: Apache-2.0

// Package smartdl provides intelligent repository analysis and download assistance
// for HuggingFace Hub repositories.
//
// The Smart Downloader analyzes repositories to determine their type (GGUF, Transformers,
// Diffusers, LoRA, etc.) and presents users with intelligent download options based on
// the repository structure.
//
// Example usage:
//
//	analyzer := smartdl.NewAnalyzer(smartdl.AnalyzerOptions{
//	    Token:    os.Getenv("HF_TOKEN"),
//	    Endpoint: "https://huggingface.co",
//	})
//
//	info, err := analyzer.Analyze(ctx, "TheBloke/Mistral-7B-GGUF", false)
//	if err != nil {
//	    log.Fatal(err)
//	}
//
//	fmt.Printf("Type: %s\n", info.Type)
//	if info.Type == smartdl.TypeGGUF {
//	    gguf := info.GGUF
//	    for _, q := range gguf.Quantizations {
//	        fmt.Printf("  %s: %s (%s RAM)\n", q.Name, q.File.SizeHuman, q.EstimatedRAMHuman)
//	    }
//	}
package smartdl

import "time"

// RepoType identifies the type of HuggingFace repository.
type RepoType string

const (
	// TypeGGUF indicates a GGUF quantized model (llama.cpp, Ollama, vLLM).
	TypeGGUF RepoType = "gguf"

	// TypeTransformers indicates a standard transformers model (safetensors/bin).
	TypeTransformers RepoType = "transformers"

	// TypeDiffusers indicates a diffusers pipeline model (Stable Diffusion, SDXL, Flux).
	TypeDiffusers RepoType = "diffusers"

	// TypeLoRA indicates a LoRA/PEFT adapter.
	TypeLoRA RepoType = "lora"

	// TypeGPTQ indicates a GPTQ quantized model.
	TypeGPTQ RepoType = "gptq"

	// TypeAWQ indicates an AWQ quantized model.
	TypeAWQ RepoType = "awq"

	// TypeONNX indicates an ONNX model.
	TypeONNX RepoType = "onnx"

	// TypeDataset indicates a HuggingFace dataset.
	TypeDataset RepoType = "dataset"

	// TypeAudio indicates an audio model (ASR, TTS, etc.).
	TypeAudio RepoType = "audio"

	// TypeVision indicates a vision model (classification, detection, etc.).
	TypeVision RepoType = "vision"

	// TypeMultimodal indicates a multimodal model (VLM, etc.).
	TypeMultimodal RepoType = "multimodal"

	// TypeGeneric indicates an unknown or generic repository type.
	TypeGeneric RepoType = "generic"
)

// String returns the string representation of a RepoType.
func (t RepoType) String() string {
	return string(t)
}

// Description returns a human-readable description of the repo type.
func (t RepoType) Description() string {
	switch t {
	case TypeGGUF:
		return "GGUF quantized model (llama.cpp, Ollama)"
	case TypeTransformers:
		return "Transformers model (safetensors)"
	case TypeDiffusers:
		return "Diffusers pipeline (Stable Diffusion, SDXL, Flux)"
	case TypeLoRA:
		return "LoRA/PEFT adapter"
	case TypeGPTQ:
		return "GPTQ quantized model"
	case TypeAWQ:
		return "AWQ quantized model"
	case TypeONNX:
		return "ONNX model"
	case TypeDataset:
		return "HuggingFace dataset"
	case TypeAudio:
		return "Audio model (ASR, TTS)"
	case TypeVision:
		return "Vision model"
	case TypeMultimodal:
		return "Multimodal model (VLM)"
	default:
		return "Generic repository"
	}
}

// FileInfo represents a file in the repository.
type FileInfo struct {
	// Path is the relative path within the repository.
	Path string `json:"path"`

	// Name is the filename (basename of path).
	Name string `json:"name"`

	// Size is the file size in bytes.
	Size int64 `json:"size"`

	// SizeHuman is the human-readable size (e.g., "4.1 GB").
	SizeHuman string `json:"size_human"`

	// IsLFS indicates if the file is stored in Git LFS.
	IsLFS bool `json:"is_lfs"`

	// SHA256 is the file hash (for LFS files).
	SHA256 string `json:"sha256,omitempty"`

	// Directory is the parent directory path.
	Directory string `json:"directory,omitempty"`
}

// RepoInfo contains analyzed information about a HuggingFace repository.
type RepoInfo struct {
	// Repo is the repository ID in "owner/name" format.
	Repo string `json:"repo"`

	// IsDataset indicates if this is a dataset repository.
	IsDataset bool `json:"is_dataset"`

	// Type is the detected repository type.
	Type RepoType `json:"type"`

	// TypeDescription is a human-readable description of the type.
	TypeDescription string `json:"type_description"`

	// Files is the list of all files in the repository.
	Files []FileInfo `json:"files"`

	// TotalSize is the sum of all file sizes in bytes.
	TotalSize int64 `json:"total_size"`

	// TotalSizeHuman is the human-readable total size.
	TotalSizeHuman string `json:"total_size_human"`

	// FileCount is the number of files.
	FileCount int `json:"file_count"`

	// Commit is the resolved commit SHA.
	Commit string `json:"commit,omitempty"`

	// Branch is the branch/revision name.
	Branch string `json:"branch,omitempty"`

	// AnalyzedAt is when the analysis was performed.
	AnalyzedAt time.Time `json:"analyzed_at"`

	// Metadata contains raw parsed metadata from config files.
	// Keys depend on repo type (e.g., "config.json", "model_index.json").
	Metadata map[string]interface{} `json:"metadata,omitempty"`

	// Type-specific information (only one will be populated based on Type)
	GGUF       *GGUFInfo       `json:"gguf,omitempty"`
	Diffusers  *DiffusersInfo  `json:"diffusers,omitempty"`
	LoRA       *LoRAInfo       `json:"lora,omitempty"`
	Quantized  *QuantizedInfo  `json:"quantized,omitempty"`
	Dataset    *DatasetInfo    `json:"dataset,omitempty"`
	Audio      *AudioInfo      `json:"audio,omitempty"`
	Vision     *VisionInfo     `json:"vision,omitempty"`
	Multimodal *MultimodalInfo `json:"multimodal,omitempty"`
	ONNX       *ONNXInfo       `json:"onnx,omitempty"`
}

// GGUFInfo contains GGUF-specific analysis results.
type GGUFInfo struct {
	// ModelName is the base model name extracted from filenames.
	ModelName string `json:"model_name,omitempty"`

	// ParameterCount is the detected parameter count (e.g., "7B", "13B").
	ParameterCount string `json:"parameter_count,omitempty"`

	// Quantizations is the list of available quantizations.
	Quantizations []GGUFQuantization `json:"quantizations"`
}

// GGUFQuantization represents a single GGUF quantization option.
type GGUFQuantization struct {
	// Name is the quantization name (e.g., "Q4_K_M").
	Name string `json:"name"`

	// File is the file info for this quantization.
	File FileInfo `json:"file"`

	// Quality is the quality rating (1-5 stars).
	Quality int `json:"quality"`

	// QualityStars is the star representation (e.g., "★★★★☆").
	QualityStars string `json:"quality_stars"`

	// EstimatedRAM is the estimated RAM needed in bytes.
	EstimatedRAM int64 `json:"estimated_ram"`

	// EstimatedRAMHuman is the human-readable RAM estimate.
	EstimatedRAMHuman string `json:"estimated_ram_human"`

	// Description is a human-readable description of this quantization level.
	Description string `json:"description,omitempty"`

	// Recommended indicates if this quantization is recommended for the user's system.
	Recommended bool `json:"recommended,omitempty"`
}

// DiffusersInfo contains Diffusers-specific analysis results.
type DiffusersInfo struct {
	// PipelineType is the pipeline class name (e.g., "StableDiffusionXLPipeline").
	PipelineType string `json:"pipeline_type"`

	// PipelineDescription is a human-readable description of the pipeline.
	PipelineDescription string `json:"pipeline_description,omitempty"`

	// DiffusersVersion is the diffusers library version from model_index.json.
	DiffusersVersion string `json:"diffusers_version,omitempty"`

	// Components is the list of pipeline components.
	Components []DiffusersComponent `json:"components"`

	// Variants is the list of available precision variants (fp16, fp32, bf16).
	Variants []string `json:"variants,omitempty"`

	// Precisions is the list of detected model precisions.
	Precisions []string `json:"precisions,omitempty"`
}

// DiffusersComponent represents a component in a diffusers pipeline.
type DiffusersComponent struct {
	// Name is the component name (e.g., "unet", "vae").
	Name string `json:"name"`

	// Library is the source library (e.g., "diffusers", "transformers").
	Library string `json:"library,omitempty"`

	// ClassName is the component class (e.g., "UNet2DConditionModel").
	ClassName string `json:"class_name,omitempty"`

	// Size is the total size of this component's files.
	Size int64 `json:"size"`

	// SizeHuman is the human-readable size.
	SizeHuman string `json:"size_human"`

	// Files is the list of files belonging to this component.
	Files []FileInfo `json:"files,omitempty"`

	// Required indicates if this component is required for the pipeline.
	Required bool `json:"required"`
}

// LoRAInfo contains LoRA/adapter-specific analysis results.
type LoRAInfo struct {
	// AdapterType is the adapter type (e.g., "lora", "qlora", "ia3").
	AdapterType string `json:"adapter_type"`

	// AdapterDescription is a human-readable description of the adapter type.
	AdapterDescription string `json:"adapter_description,omitempty"`

	// BaseModel is the base model this adapter is trained for.
	BaseModel string `json:"base_model,omitempty"`

	// Rank is the LoRA rank (r parameter).
	Rank int `json:"rank,omitempty"`

	// Alpha is the LoRA alpha scaling factor.
	Alpha float64 `json:"alpha,omitempty"`

	// Dropout is the LoRA dropout rate.
	Dropout float64 `json:"dropout,omitempty"`

	// TargetModules is the list of targeted module names.
	TargetModules []string `json:"target_modules,omitempty"`

	// Bias is the bias training mode ("none", "all", "lora_only").
	Bias string `json:"bias,omitempty"`

	// TaskType is the PEFT task type (e.g., "CAUSAL_LM").
	TaskType string `json:"task_type,omitempty"`

	// FanInFanOut indicates if fan_in_fan_out is enabled.
	FanInFanOut bool `json:"fan_in_fan_out,omitempty"`

	// InitLoraWeights indicates if LoRA weights are initialized.
	InitLoraWeights bool `json:"init_lora_weights,omitempty"`

	// QuantType is the quantization type for QLoRA (e.g., "nf4").
	QuantType string `json:"quant_type,omitempty"`
}

// QuantizedInfo contains GPTQ/AWQ-specific analysis results.
type QuantizedInfo struct {
	// Method is the quantization method (e.g., "gptq", "awq", "exl2").
	Method string `json:"method"`

	// MethodDescription is a human-readable description of the method.
	MethodDescription string `json:"method_description,omitempty"`

	// Bits is the quantization bit width.
	Bits int `json:"bits"`

	// GroupSize is the quantization group size.
	GroupSize int `json:"group_size,omitempty"`

	// DescAct indicates if GPTQ desc_act is enabled.
	DescAct bool `json:"desc_act,omitempty"`

	// Symmetric indicates if symmetric quantization is used.
	Symmetric bool `json:"symmetric,omitempty"`

	// ZeroPoint indicates if zero-point quantization is used (AWQ).
	ZeroPoint bool `json:"zero_point,omitempty"`

	// Version is the quantization format version.
	Version string `json:"version,omitempty"`

	// BitsPerWeight is the EXL2 bits per weight.
	BitsPerWeight float64 `json:"bits_per_weight,omitempty"`

	// ExcludedModules is the list of modules not quantized.
	ExcludedModules []string `json:"excluded_modules,omitempty"`

	// Backends is the list of compatible inference backends.
	Backends []string `json:"backends,omitempty"`

	// ModelArchitecture is the base model architecture.
	ModelArchitecture string `json:"model_architecture,omitempty"`

	// BaseModel is the base model this was quantized from.
	BaseModel string `json:"base_model,omitempty"`

	// EstimatedVRAM is the estimated VRAM needed for inference.
	EstimatedVRAM int64 `json:"estimated_vram,omitempty"`

	// EstimatedVRAMHuman is the human-readable VRAM estimate.
	EstimatedVRAMHuman string `json:"estimated_vram_human,omitempty"`
}

// DatasetInfo contains dataset-specific analysis results.
type DatasetInfo struct {
	// Splits is the list of available splits.
	Splits []DatasetSplit `json:"splits"`

	// Configs is the list of available configurations/subsets.
	Configs []string `json:"configs,omitempty"`

	// Formats is the list of file formats found.
	Formats []string `json:"formats,omitempty"`

	// PrimaryFormat is the recommended format to download.
	PrimaryFormat string `json:"primary_format,omitempty"`
}

// DatasetSplit represents a dataset split (train, test, etc.).
type DatasetSplit struct {
	// Name is the split name (e.g., "train", "test", "validation").
	Name string `json:"name"`

	// Files is the list of files in this split.
	Files []FileInfo `json:"files,omitempty"`

	// FileCount is the number of files in this split.
	FileCount int `json:"file_count"`

	// Size is the total size of this split.
	Size int64 `json:"size"`

	// SizeHuman is the human-readable size.
	SizeHuman string `json:"size_human"`
}

// AudioInfo contains audio model-specific analysis results.
type AudioInfo struct {
	// Task is the audio task (e.g., "automatic-speech-recognition", "text-to-speech").
	Task string `json:"task"`

	// TaskDescription is a human-readable description of the task.
	TaskDescription string `json:"task_description,omitempty"`

	// FeatureExtractorType is the feature extractor class name.
	FeatureExtractorType string `json:"feature_extractor_type,omitempty"`

	// SampleRate is the expected audio sample rate in Hz.
	SampleRate int `json:"sample_rate,omitempty"`

	// NumMelBins is the number of mel filterbank bins (for speech models).
	NumMelBins int `json:"num_mel_bins,omitempty"`

	// MaxLength is the maximum audio length in samples or seconds.
	MaxLength int `json:"max_length,omitempty"`

	// Languages is the list of supported languages (for multilingual models).
	Languages []string `json:"languages,omitempty"`

	// Framework is the model framework (e.g., "transformers", "speechbrain").
	Framework string `json:"framework,omitempty"`
}

// VisionInfo contains vision model-specific analysis results.
type VisionInfo struct {
	// Task is the vision task (e.g., "image-classification", "object-detection").
	Task string `json:"task"`

	// TaskDescription is a human-readable description of the task.
	TaskDescription string `json:"task_description,omitempty"`

	// ImageProcessorType is the image processor class name.
	ImageProcessorType string `json:"image_processor_type,omitempty"`

	// ImageSize is the expected input image size.
	ImageSize ImageSize `json:"image_size,omitempty"`

	// NumChannels is the number of input channels (typically 3 for RGB).
	NumChannels int `json:"num_channels,omitempty"`

	// NumLabels is the number of output classes (for classification).
	NumLabels int `json:"num_labels,omitempty"`

	// Normalization contains mean and std for image normalization.
	Normalization *ImageNormalization `json:"normalization,omitempty"`

	// Framework is the model framework.
	Framework string `json:"framework,omitempty"`
}

// ImageSize represents image dimensions.
type ImageSize struct {
	Height int `json:"height"`
	Width  int `json:"width"`
}

// ImageNormalization contains normalization parameters.
type ImageNormalization struct {
	Mean []float64 `json:"mean"`
	Std  []float64 `json:"std"`
}

// MultimodalInfo contains multimodal model-specific analysis results.
type MultimodalInfo struct {
	// Task is the multimodal task (e.g., "visual-question-answering", "image-to-text").
	Task string `json:"task"`

	// TaskDescription is a human-readable description of the task.
	TaskDescription string `json:"task_description,omitempty"`

	// Modalities is the list of supported modalities (e.g., ["text", "image"]).
	Modalities []string `json:"modalities"`

	// ProcessorType is the processor class name.
	ProcessorType string `json:"processor_type,omitempty"`

	// VisionEncoder is info about the vision encoder component.
	VisionEncoder string `json:"vision_encoder,omitempty"`

	// TextEncoder is info about the text encoder component.
	TextEncoder string `json:"text_encoder,omitempty"`

	// ImageSize is the expected input image size.
	ImageSize ImageSize `json:"image_size,omitempty"`

	// MaxTextLength is the maximum text input length.
	MaxTextLength int `json:"max_text_length,omitempty"`

	// Framework is the model framework.
	Framework string `json:"framework,omitempty"`
}

// ONNXInfo contains ONNX model-specific analysis results.
type ONNXInfo struct {
	// Models is the list of ONNX model files.
	Models []ONNXModel `json:"models"`

	// Optimized indicates if optimized versions are available.
	Optimized bool `json:"optimized,omitempty"`

	// Quantized indicates if quantized versions are available.
	Quantized bool `json:"quantized,omitempty"`

	// Runtimes is the list of compatible runtimes.
	Runtimes []string `json:"runtimes,omitempty"`
}

// ONNXModel represents a single ONNX model file.
type ONNXModel struct {
	// Path is the file path.
	Path string `json:"path"`

	// Name is the model name extracted from the path.
	Name string `json:"name"`

	// Size is the file size in bytes.
	Size int64 `json:"size"`

	// SizeHuman is the human-readable size.
	SizeHuman string `json:"size_human"`

	// Variant indicates the model variant (e.g., "fp32", "fp16", "int8").
	Variant string `json:"variant,omitempty"`

	// Optimized indicates if this is an optimized model.
	Optimized bool `json:"optimized,omitempty"`
}
