// Copyright 2025
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/bodaay/HuggingFaceModelDownloader/pkg/hfdownloader"
	"github.com/bodaay/HuggingFaceModelDownloader/pkg/smartdl"
)

func newAnalyzeCmd(ctx context.Context, ro *RootOpts) *cobra.Command {
	var (
		isDataset bool
		endpoint  string
		formatOut string
	)

	cmd := &cobra.Command{
		Use:   "analyze <repo>",
		Short: "Analyze a HuggingFace repository to determine its type and structure",
		Long: `Analyze a HuggingFace repository to detect its type (GGUF, Transformers,
Diffusers, LoRA, etc.) and provide detailed information about available options.

This command fetches the repository file tree and metadata without downloading
any files, then presents intelligent analysis based on the detected type.

Examples:
  # Analyze a GGUF model
  hfdownloader analyze TheBloke/Mistral-7B-GGUF

  # Analyze a diffusers model
  hfdownloader analyze stabilityai/stable-diffusion-xl-base-1.0

  # Analyze a dataset
  hfdownloader analyze --dataset HuggingFaceFW/fineweb

  # Get JSON output for scripting
  hfdownloader analyze --format json TheBloke/Mistral-7B-GGUF`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			repo := args[0]

			// Validate repo format
			if !hfdownloader.IsValidModelName(repo) {
				return fmt.Errorf("invalid repo id %q (expected owner/name)", repo)
			}

			// Get token
			token := strings.TrimSpace(ro.Token)
			if token == "" {
				token = strings.TrimSpace(os.Getenv("HF_TOKEN"))
			}

			// Create analyzer
			opts := smartdl.AnalyzerOptions{
				Token:    token,
				Endpoint: endpoint,
			}
			analyzer := smartdl.NewAnalyzer(opts)

			// Analyze
			info, err := analyzer.Analyze(ctx, repo, isDataset)
			if err != nil {
				return fmt.Errorf("analysis failed: %w", err)
			}

			// Output
			if formatOut == "json" || ro.JSONOut {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(info)
			}

			// Human-readable output
			printAnalysis(info)
			return nil
		},
	}

	cmd.Flags().BoolVar(&isDataset, "dataset", false, "Analyze as a dataset repository")
	cmd.Flags().StringVar(&endpoint, "endpoint", "", "Custom HuggingFace endpoint URL (e.g. https://hf-mirror.com)")
	cmd.Flags().StringVar(&formatOut, "format", "text", "Output format: text, json")

	return cmd
}

func printAnalysis(info *smartdl.RepoInfo) {
	fmt.Printf("Repository: %s\n", info.Repo)
	fmt.Printf("Type:       %s (%s)\n", info.Type, info.TypeDescription)
	fmt.Printf("Files:      %d\n", info.FileCount)
	fmt.Printf("Total Size: %s\n", info.TotalSizeHuman)
	fmt.Println()

	switch info.Type {
	case smartdl.TypeGGUF:
		printGGUFAnalysis(info)
	case smartdl.TypeDiffusers:
		printDiffusersAnalysis(info)
	case smartdl.TypeLoRA:
		printLoRAAnalysis(info)
	case smartdl.TypeGPTQ, smartdl.TypeAWQ:
		printQuantizedAnalysis(info)
	case smartdl.TypeDataset:
		printDatasetAnalysis(info)
	case smartdl.TypeAudio:
		printAudioAnalysis(info)
	case smartdl.TypeVision:
		printVisionAnalysis(info)
	case smartdl.TypeMultimodal:
		printMultimodalAnalysis(info)
	case smartdl.TypeONNX:
		printONNXAnalysis(info)
	default:
		printGenericAnalysis(info)
	}
}

func printGGUFAnalysis(info *smartdl.RepoInfo) {
	if info.GGUF == nil {
		return
	}

	gguf := info.GGUF
	if gguf.ModelName != "" {
		fmt.Printf("Model:      %s\n", gguf.ModelName)
	}
	if gguf.ParameterCount != "" {
		fmt.Printf("Parameters: %s\n", gguf.ParameterCount)
	}
	fmt.Println()

	fmt.Println("Available Quantizations:")
	fmt.Printf("  %-12s  %12s  %12s  %s  %s\n", "QUANT", "SIZE", "RAM", "QUALITY", "DESCRIPTION")
	fmt.Printf("  %-12s  %12s  %12s  %s  %s\n", "------------", "------------", "------------", "-------", "-----------")

	for _, q := range gguf.Quantizations {
		stars := strings.Repeat("★", q.Quality) + strings.Repeat("☆", 5-q.Quality)
		ramHuman := humanSize(q.EstimatedRAM)
		fmt.Printf("  %-12s  %12s  %12s  %s  %s\n",
			q.Name,
			q.File.SizeHuman,
			ramHuman,
			stars,
			q.Description,
		)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s -F <quant>  # e.g., -F q4_k_m\n", info.Repo)
}

func printDiffusersAnalysis(info *smartdl.RepoInfo) {
	if info.Diffusers == nil {
		return
	}

	diff := info.Diffusers
	fmt.Printf("Pipeline:   %s\n", diff.PipelineType)
	if diff.PipelineDescription != "" {
		fmt.Printf("            %s\n", diff.PipelineDescription)
	}
	if diff.DiffusersVersion != "" {
		fmt.Printf("Version:    diffusers %s\n", diff.DiffusersVersion)
	}
	fmt.Println()

	if len(diff.Variants) > 0 {
		fmt.Printf("Variants:   %s\n", strings.Join(diff.Variants, ", "))
		fmt.Println()
	}

	fmt.Println("Components:")
	fmt.Printf("  %-20s  %12s  %10s  %s\n", "NAME", "SIZE", "REQUIRED", "CLASS")
	fmt.Printf("  %-20s  %12s  %10s  %s\n", "--------------------", "------------", "----------", "-----")

	for _, c := range diff.Components {
		required := ""
		if c.Required {
			required = "yes"
		}
		fmt.Printf("  %-20s  %12s  %10s  %s\n", c.Name, c.SizeHuman, required, c.ClassName)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s                    # Download all\n", info.Repo)
	fmt.Printf("  hfdownloader download %s -F fp16           # Download fp16 variant\n", info.Repo)
}

func printLoRAAnalysis(info *smartdl.RepoInfo) {
	if info.LoRA == nil {
		return
	}

	lora := info.LoRA
	fmt.Printf("Adapter:    %s\n", lora.AdapterType)
	if lora.AdapterDescription != "" {
		fmt.Printf("            %s\n", lora.AdapterDescription)
	}
	fmt.Println()

	if lora.BaseModel != "" {
		fmt.Printf("Base Model: %s\n", lora.BaseModel)
		fmt.Println()
		fmt.Println("⚠️  This adapter requires the base model to be downloaded separately.")
	}

	if lora.Rank > 0 {
		fmt.Printf("Rank (r):   %d\n", lora.Rank)
	}
	if lora.Alpha > 0 {
		fmt.Printf("Alpha:      %.1f\n", lora.Alpha)
	}
	if len(lora.TargetModules) > 0 {
		fmt.Printf("Targets:    %s\n", strings.Join(lora.TargetModules, ", "))
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s\n", info.Repo)
	if lora.BaseModel != "" {
		fmt.Printf("  hfdownloader download %s  # Base model\n", lora.BaseModel)
	}
}

func printQuantizedAnalysis(info *smartdl.RepoInfo) {
	if info.Quantized == nil {
		return
	}

	q := info.Quantized
	fmt.Printf("Method:     %s", strings.ToUpper(q.Method))
	if q.MethodDescription != "" {
		fmt.Printf(" - %s", q.MethodDescription)
	}
	fmt.Println()

	fmt.Printf("Bits:       %d-bit\n", q.Bits)
	if q.GroupSize > 0 {
		fmt.Printf("Group Size: %d\n", q.GroupSize)
	}
	if q.EstimatedVRAM > 0 {
		fmt.Printf("Est. VRAM:  %s\n", humanSize(q.EstimatedVRAM))
	}
	fmt.Println()

	if len(q.Backends) > 0 {
		fmt.Printf("Backends:   %s\n", strings.Join(q.Backends, ", "))
	}

	if q.DescAct {
		fmt.Println("Note:       desc_act=True (may be slower but more accurate)")
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s\n", info.Repo)
}

func printDatasetAnalysis(info *smartdl.RepoInfo) {
	if info.Dataset == nil {
		return
	}

	ds := info.Dataset
	if len(ds.Formats) > 0 {
		fmt.Printf("Formats:    %s\n", strings.Join(ds.Formats, ", "))
	}
	if ds.PrimaryFormat != "" {
		fmt.Printf("Recommended: %s\n", ds.PrimaryFormat)
	}
	if len(ds.Configs) > 0 {
		fmt.Printf("Configs:    %s\n", strings.Join(ds.Configs, ", "))
	}
	fmt.Println()

	fmt.Println("Splits:")
	fmt.Printf("  %-20s  %10s  %12s\n", "NAME", "FILES", "SIZE")
	fmt.Printf("  %-20s  %10s  %12s\n", "--------------------", "----------", "------------")

	for _, s := range ds.Splits {
		fmt.Printf("  %-20s  %10d  %12s\n", s.Name, s.FileCount, s.SizeHuman)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download --dataset %s             # Download all\n", info.Repo)
	fmt.Printf("  hfdownloader download --dataset %s -F train   # Download train split only\n", info.Repo)
}

func printGenericAnalysis(info *smartdl.RepoInfo) {
	fmt.Println("Files:")
	fmt.Printf("  %-50s  %12s  %s\n", "NAME", "SIZE", "LFS")
	fmt.Printf("  %-50s  %12s  %s\n", strings.Repeat("-", 50), "------------", "---")

	// Show up to 20 files
	limit := 20
	for i, f := range info.Files {
		if i >= limit {
			fmt.Printf("  ... and %d more files\n", len(info.Files)-limit)
			break
		}
		name := f.Path
		if len(name) > 50 {
			name = "..." + name[len(name)-47:]
		}
		lfs := ""
		if f.IsLFS {
			lfs = "yes"
		}
		fmt.Printf("  %-50s  %12s  %s\n", name, f.SizeHuman, lfs)
	}

	fmt.Println()
	fmt.Println("Usage:")
	if info.IsDataset {
		fmt.Printf("  hfdownloader download --dataset %s\n", info.Repo)
	} else {
		fmt.Printf("  hfdownloader download %s\n", info.Repo)
	}
}

func printAudioAnalysis(info *smartdl.RepoInfo) {
	if info.Audio == nil {
		printGenericAnalysis(info)
		return
	}

	audio := info.Audio
	fmt.Printf("Task:       %s\n", audio.Task)
	if audio.TaskDescription != "" {
		fmt.Printf("            %s\n", audio.TaskDescription)
	}
	fmt.Println()

	if audio.FeatureExtractorType != "" {
		fmt.Printf("Feature Extractor: %s\n", audio.FeatureExtractorType)
	}
	if audio.SampleRate > 0 {
		fmt.Printf("Sample Rate:       %d Hz\n", audio.SampleRate)
	}
	if audio.NumMelBins > 0 {
		fmt.Printf("Mel Bins:          %d\n", audio.NumMelBins)
	}
	if len(audio.Languages) > 0 {
		fmt.Printf("Languages:         %s\n", strings.Join(audio.Languages, ", "))
	}
	if audio.Framework != "" {
		fmt.Printf("Framework:         %s\n", audio.Framework)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s\n", info.Repo)
}

func printVisionAnalysis(info *smartdl.RepoInfo) {
	if info.Vision == nil {
		printGenericAnalysis(info)
		return
	}

	vision := info.Vision
	fmt.Printf("Task:       %s\n", vision.Task)
	if vision.TaskDescription != "" {
		fmt.Printf("            %s\n", vision.TaskDescription)
	}
	fmt.Println()

	if vision.ImageProcessorType != "" {
		fmt.Printf("Image Processor: %s\n", vision.ImageProcessorType)
	}
	if vision.ImageSize.Height > 0 && vision.ImageSize.Width > 0 {
		fmt.Printf("Input Size:      %dx%d\n", vision.ImageSize.Width, vision.ImageSize.Height)
	}
	if vision.NumChannels > 0 {
		fmt.Printf("Channels:        %d\n", vision.NumChannels)
	}
	if vision.NumLabels > 0 {
		fmt.Printf("Classes:         %d\n", vision.NumLabels)
	}
	if vision.Normalization != nil && len(vision.Normalization.Mean) > 0 {
		fmt.Printf("Normalization:   mean=%v, std=%v\n", vision.Normalization.Mean, vision.Normalization.Std)
	}
	if vision.Framework != "" {
		fmt.Printf("Framework:       %s\n", vision.Framework)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s\n", info.Repo)
}

func printMultimodalAnalysis(info *smartdl.RepoInfo) {
	if info.Multimodal == nil {
		printGenericAnalysis(info)
		return
	}

	mm := info.Multimodal
	fmt.Printf("Task:       %s\n", mm.Task)
	if mm.TaskDescription != "" {
		fmt.Printf("            %s\n", mm.TaskDescription)
	}
	fmt.Println()

	if len(mm.Modalities) > 0 {
		fmt.Printf("Modalities:    %s\n", strings.Join(mm.Modalities, ", "))
	}
	if mm.ProcessorType != "" {
		fmt.Printf("Processor:     %s\n", mm.ProcessorType)
	}
	if mm.VisionEncoder != "" {
		fmt.Printf("Vision Enc:    %s\n", mm.VisionEncoder)
	}
	if mm.TextEncoder != "" {
		fmt.Printf("Text Enc:      %s\n", mm.TextEncoder)
	}
	if mm.ImageSize.Height > 0 && mm.ImageSize.Width > 0 {
		fmt.Printf("Image Size:    %dx%d\n", mm.ImageSize.Width, mm.ImageSize.Height)
	}
	if mm.MaxTextLength > 0 {
		fmt.Printf("Max Text Len:  %d tokens\n", mm.MaxTextLength)
	}
	if mm.Framework != "" {
		fmt.Printf("Framework:     %s\n", mm.Framework)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s\n", info.Repo)
}

func printONNXAnalysis(info *smartdl.RepoInfo) {
	if info.ONNX == nil {
		printGenericAnalysis(info)
		return
	}

	onnx := info.ONNX
	if onnx.Optimized {
		fmt.Println("Optimized:  Yes (optimized models available)")
	}
	if onnx.Quantized {
		fmt.Println("Quantized:  Yes (quantized models available)")
	}
	if len(onnx.Runtimes) > 0 {
		fmt.Printf("Runtimes:   %s\n", strings.Join(onnx.Runtimes, ", "))
	}
	fmt.Println()

	fmt.Println("ONNX Models:")
	fmt.Printf("  %-40s  %12s  %s\n", "NAME", "SIZE", "VARIANT")
	fmt.Printf("  %-40s  %12s  %s\n", strings.Repeat("-", 40), "------------", "-------")

	for _, m := range onnx.Models {
		name := m.Name
		if len(name) > 40 {
			name = "..." + name[len(name)-37:]
		}
		variant := m.Variant
		if m.Optimized {
			variant += " (opt)"
		}
		fmt.Printf("  %-40s  %12s  %s\n", name, m.SizeHuman, variant)
	}

	fmt.Println()
	fmt.Println("Usage:")
	fmt.Printf("  hfdownloader download %s             # Download all\n", info.Repo)
	fmt.Printf("  hfdownloader download %s -F fp16    # Download fp16 variant only\n", info.Repo)
}
