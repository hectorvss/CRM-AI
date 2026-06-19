$src = "src\prototype\Prototype.tsx"
$newCode = [System.IO.File]::ReadAllText("scripts\wa-product-analytics-detail.txt")

$txt = [System.IO.File]::ReadAllText($src)

$startMarker = "function WAAppProductAnalyticsView() {"
$endMarker = "`n// " + [char]0x2500 + [char]0x2500 + " WADataSidebar"

$startIdx = $txt.IndexOf($startMarker)
Write-Host "Start at: $startIdx"
if ($startIdx -lt 0) { Write-Host "START NOT FOUND"; exit 1 }

$endIdx = $txt.IndexOf($endMarker, $startIdx)
Write-Host "End at: $endIdx"
if ($endIdx -lt 0) { Write-Host "END NOT FOUND"; exit 1 }

$txt = $txt.Substring(0, $startIdx) + $newCode + $txt.Substring($endIdx)
[System.IO.File]::WriteAllText($src, $txt, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done. Length: $($txt.Length)"
