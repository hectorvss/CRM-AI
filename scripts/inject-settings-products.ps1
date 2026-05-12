$src = "src\prototype\Prototype.tsx"
$scriptFile = "scripts\wa-settings-products.txt"

$txt = [System.IO.File]::ReadAllText($src)
$newCode = [System.IO.File]::ReadAllText($scriptFile)

$anchor = "  // " + [char]0x2500 + [char]0x2500 + " Page title map "
$idx = $txt.IndexOf($anchor)
Write-Host "Anchor at: $idx"
if ($idx -lt 0) { Write-Host "ANCHOR NOT FOUND"; exit 1 }

$txt = $txt.Substring(0, $idx) + $newCode + $txt.Substring($idx)
[System.IO.File]::WriteAllText($src, $txt, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done. Length: $($txt.Length)"
