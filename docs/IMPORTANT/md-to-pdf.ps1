# Convert project .md files to PDF via Edge
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$root = Split-Path $PSScriptRoot -Parent
if (-not $root) { $root = Get-Location }
$docsDir = $PSScriptRoot

$mdFiles = @(
    @{ md = "README.md"; pdf = "README.pdf"; dir = $root },
    @{ md = "Custom-Domain-Setup.md"; pdf = "Custom-Domain-Setup.pdf"; dir = $docsDir },
    @{ md = "Credentials-Checklist.md"; pdf = "Credentials-Checklist.pdf"; dir = $docsDir },
    @{ md = "Portal-Services-and-Stack.md"; pdf = "Portal-Services-and-Stack.pdf"; dir = $docsDir },
    @{ md = "Deployment-and-Setup-Steps.md"; pdf = "Deployment-and-Setup-Steps.pdf"; dir = $docsDir },
    @{ md = "M365-Graph-Password-Reset-Setup.md"; pdf = "M365-Graph-Password-Reset-Setup.pdf"; dir = $docsDir },
    @{ md = "cutover-checklist.md"; pdf = "cutover-checklist.pdf"; dir = $docsDir }
)

$htmlHead = @"
<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>__TITLE__</title>
<style>body{margin:24px;font-family:system-ui,sans-serif;line-height:1.45;color:#111;font-size:13px;}
h1{font-size:20px;margin:0 0 8px 0;}.sub{color:#444;margin-bottom:16px;}
pre{margin:0;padding:16px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.4;}
@media print{body{margin:14px;}pre{font-size:10px;}}</style></head>
<body><h1>__TITLE__</h1><p class="sub">Export of __FILENAME__</p><pre>__BODY__</pre></body></html>
"@

foreach ($item in $mdFiles) {
    $mdPath = Join-Path $item.dir $item.md
    if (-not (Test-Path $mdPath)) { continue }
    $raw = Get-Content -Path $mdPath -Raw -Encoding UTF8
    $escaped = $raw -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    $title = [System.IO.Path]::GetFileNameWithoutExtension($item.md) -replace '-', ' '
    $htmlPath = Join-Path $docsDir ([System.IO.Path]::GetFileNameWithoutExtension($item.md) + "-temp.html")
    $pdfPath = Join-Path $docsDir $item.pdf
    $html = $htmlHead -replace '__TITLE__', $title -replace '__FILENAME__', $item.md -replace '__BODY__', $escaped
    [System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
    & $edge --headless --disable-gpu --print-to-pdf="$pdfPath" "$htmlPath" 2>$null
    Remove-Item $htmlPath -ErrorAction SilentlyContinue
    Write-Host "OK: $($item.pdf)"
}

# web/README.md -> docs/Web-README.pdf
$webReadme = Join-Path $root "web\README.md"
if (Test-Path $webReadme) {
    $raw = Get-Content -Path $webReadme -Raw -Encoding UTF8
    $escaped = $raw -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    $htmlPath = Join-Path $docsDir "Web-README-temp.html"
    $pdfPath = Join-Path $docsDir "Web-README.pdf"
    $html = $htmlHead -replace '__TITLE__', 'Web README' -replace '__FILENAME__', 'web/README.md' -replace '__BODY__', $escaped
    [System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
    & $edge --headless --disable-gpu --print-to-pdf="$pdfPath" "$htmlPath" 2>$null
    Remove-Item $htmlPath -ErrorAction SilentlyContinue
    Write-Host "OK: Web-README.pdf"
}

Write-Host "Done. PDFs in: $docsDir"
Get-ChildItem $docsDir -Filter "*.pdf" | Select-Object Name, Length
