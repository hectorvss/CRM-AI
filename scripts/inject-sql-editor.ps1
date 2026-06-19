$src = "src\prototype\Prototype.tsx"
$newCode = [System.IO.File]::ReadAllText("scripts\wa-sql-editor-view.txt")
$txt = [System.IO.File]::ReadAllText($src)

$anchor = "`n// " + [char]0x2500 + [char]0x2500 + " WADataSidebar"
$idx = $txt.IndexOf($anchor)
Write-Host "Anchor at: $idx"
if ($idx -lt 0) { Write-Host "ANCHOR NOT FOUND"; exit 1 }

$txt = $txt.Substring(0, $idx) + "`n" + $newCode + $txt.Substring($idx)
[System.IO.File]::WriteAllText($src, $txt, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done. Length: $($txt.Length)"
