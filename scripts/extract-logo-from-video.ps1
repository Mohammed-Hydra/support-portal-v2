# Extract a frame from video as PNG (logo export)
# Usage: .\extract-logo-from-video.ps1 -VideoPath "C:\path\to\video.mp4" [-Timestamp "00:00:01"] [-Output "logo.png"]

param(
    [Parameter(Mandatory=$true)]
    [string]$VideoPath,
    [string]$Timestamp = "00:00:01",
    [string]$Output = "logo_frame.png"
)

if (-not (Test-Path $VideoPath)) {
    Write-Error "Video file not found: $VideoPath"
    exit 1
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
    Write-Error "ffmpeg not found. Install from https://ffmpeg.org/download.html"
    exit 1
}

$outDir = Split-Path -Parent $Output
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

ffmpeg -y -i $VideoPath -ss $Timestamp -vframes 1 -q:v 2 $Output
Write-Host "Extracted frame saved to: $Output"
