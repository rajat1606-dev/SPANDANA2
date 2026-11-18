# ============================================================================
#  SPANDANA - run the research pipeline from the VS Code terminal
#
#  Usage:
#    .\run_training.ps1 download      # fetch PTB-XL (resumable, no duplicates)
#    .\run_training.ps1 inspect       # dataset structure + missing values
#    .\run_training.ps1 labels        # extract LVH cohort + control group
#    .\run_training.ps1 splits        # patient-wise train/val/test splits
#    .\run_training.ps1 preprocess    # decode 100 Hz waveforms -> signals.npy
#    .\run_training.ps1 features      # voltage features + SL/Cornell criteria
#    .\run_training.ps1 perceptron    # train + evaluate the Perceptron
#    .\run_training.ps1 cnn           # train the 1D CNN (-Epochs 40 default)
#    .\run_training.ps1 cnn-eval      # evaluate the CNN + tune its threshold
#    .\run_training.ps1 evaluate      # 4-method comparison on the test set
#    .\run_training.ps1 pipeline      # inspect -> labels -> splits -> features
#    .\run_training.ps1 all           # the full research workflow
#
#  Extra CNN switches: -Epochs 30 -BatchSize 128 -Device cuda -Resume
# ============================================================================
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("download", "inspect", "labels", "splits", "preprocess",
                 "features", "perceptron", "cnn", "cnn-eval", "evaluate",
                 "pipeline", "all")]
    [string]$Stage,

    [int]$Epochs = 40,
    [int]$BatchSize = 64,
    [string]$Device = "auto",
    [switch]$Resume,
    [switch]$MetadataOnly
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path "$root\.venv\Scripts\python.exe")) {
    Write-Host ".venv not found - run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}
$py = "$root\.venv\Scripts\python.exe"
Set-Location $root

function Run([string]$script, [string[]]$extra = @()) {
    Write-Host "==> python training/$script $($extra -join ' ')" -ForegroundColor Cyan
    & $py "training\$script" @extra
    if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $script" -ForegroundColor Red; exit $LASTEXITCODE }
}

switch ($Stage) {
    "download" {
        $extra = @()
        if ($MetadataOnly) { $extra += "--metadata-only" }
        Run "download_dataset.py" $extra
    }
    "inspect"   { Run "inspect_dataset.py" }
    "labels"    { Run "extract_lvh.py" }
    "splits"    { Run "create_splits.py" }
    "preprocess"{ Run "preprocess_ecg.py" }
    "features"  { Run "extract_features.py" }
    "perceptron" {
        Run "train_perceptron.py"
        Run "evaluate_perceptron.py"
    }
    "cnn" {
        $extra = @("--epochs", "$Epochs", "--batch-size", "$BatchSize", "--device", $Device)
        if ($Resume) { $extra += "--resume" }
        Run "train_cnn.py" $extra
        Run "evaluate_cnn.py"
    }
    "cnn-eval"  { Run "evaluate_cnn.py" }
    "evaluate"  { Run "evaluate_all.py" }
    "pipeline"  {
        Run "inspect_dataset.py"
        Run "extract_lvh.py"
        Run "create_splits.py"
        Run "preprocess_ecg.py"
        Run "extract_features.py"
    }
    "all" {
        Run "download_dataset.py"
        Run "inspect_dataset.py"
        Run "extract_lvh.py"
        Run "create_splits.py"
        Run "preprocess_ecg.py"
        Run "extract_features.py"
        Run "train_perceptron.py"
        Run "evaluate_perceptron.py"
        Run "train_cnn.py" @("--epochs", "$Epochs", "--batch-size", "$BatchSize", "--device", $Device)
        Run "evaluate_cnn.py"
        Run "evaluate_all.py"
    }
}

Write-Host ""
Write-Host "Stage '$Stage' finished." -ForegroundColor Green
