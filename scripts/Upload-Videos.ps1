<#
.SYNOPSIS
  Uploads a folder of brand videos to Supabase and attaches each one to the
  matching cell on the portfolio.

.DESCRIPTION
  Matches each video file to a brand by its file name, uploads it to the
  "videos" storage bucket, and points that brand's cell at it. Files named
  after the same brand ("Joto Ramen 1.mp4", "Joto Ramen 2.mp4") fill that
  brand's cells in order, and extra cells are created when a brand has more
  videos than cells.

  Nothing is uploaded until you have seen the plan and confirmed it.

.PARAMETER Folder
  The folder holding the videos. Subfolders are ignored.

.PARAMETER Email
  The admin email you sign in to /admin with. You are prompted for the
  password; it is never written to disk or into your shell history.

.PARAMETER Yes
  Skip the confirmation prompt and upload straight away.

.EXAMPLE
  .\scripts\Upload-Videos.ps1 -Folder "$env:USERPROFILE\Videos\Brands" -Email you@example.com

.EXAMPLE
  # See what would happen without uploading anything
  .\scripts\Upload-Videos.ps1 -Folder .\videos -Email you@example.com -WhatIf
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)] [string] $Folder,
  [Parameter(Mandatory = $true)] [string] $Email,
  [switch] $Yes
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 does not always negotiate TLS 1.2 by default.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# .NET adds "Expect: 100-continue" to every POST. Supabase's edge closes the
# connection instead of answering it, which surfaces as "a connection that was
# expected to be kept alive was closed by the server".
[Net.ServicePointManager]::Expect100Continue = $false
[Net.ServicePointManager]::DefaultConnectionLimit = 10

# The progress bar makes Invoke-RestMethod dramatically slower on large
# transfers in Windows PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'

$ApiTimeout = 60      # seconds, for the small JSON calls
$UploadTimeout = 1800 # seconds, enough for a 50 MB file on a slow connection
$Bucket = 'videos'
$MaxBytes = 50MB
$Extensions = @('.mp4', '.mov', '.webm', '.m4v')
$ContentTypes = @{
  '.mp4' = 'video/mp4'; '.m4v' = 'video/x-m4v'
  '.mov' = 'video/quicktime'; '.webm' = 'video/webm'
}

# Invoke-RestMethod reports only the status code; the response body carries
# Supabase's actual explanation, which is what you need when something fails.
function Get-ApiError {
  param($Record)
  if ($Record.ErrorDetails -and $Record.ErrorDetails.Message) { return $Record.ErrorDetails.Message }
  try {
    $response = $Record.Exception.Response
    if ($response) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      if ($body) { return $body }
    }
  } catch { }
  return $Record.Exception.Message
}

# Connections to the API drop occasionally. Retry rather than losing a whole
# run, or a 39 MB upload, to one dropped socket.
function Invoke-WithRetry {
  param([scriptblock] $Action, [int] $Retries = 2)
  for ($attempt = 0; $attempt -le $Retries; $attempt++) {
    try {
      return & $Action
    } catch {
      if ($attempt -eq $Retries) { throw }
      Write-Host "  connection dropped, retrying..." -ForegroundColor DarkGray
      Start-Sleep -Seconds (2 * ($attempt + 1))
    }
  }
}

# ---------------------------------------------------------------- config ---
# Read the project URL and publishable key from the site's own config, so
# there is only ever one copy of them.
$configPath = Join-Path $PSScriptRoot '..\assets\js\config.js'
if (-not (Test-Path $configPath)) {
  throw "Cannot find assets/js/config.js. Run this from inside the repository."
}
$config = Get-Content $configPath -Raw
$SupabaseUrl = [regex]::Match($config, "SUPABASE_URL\s*=\s*'([^']+)'").Groups[1].Value
$SupabaseKey = [regex]::Match($config, "SUPABASE_KEY\s*=\s*'([^']+)'").Groups[1].Value
if (-not $SupabaseUrl -or -not $SupabaseKey) {
  throw "Could not read SUPABASE_URL / SUPABASE_KEY from $configPath."
}

if (-not (Test-Path $Folder)) { throw "Folder not found: $Folder" }

# ------------------------------------------------------------------ auth ---
$secure = Read-Host -Prompt "Password for $Email" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

Write-Host "Signing in..." -ForegroundColor Cyan
try {
  $auth = Invoke-WithRetry {
    Invoke-RestMethod -Method Post `
      -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" `
      -Headers @{ apikey = $SupabaseKey } `
      -ContentType 'application/json' -TimeoutSec $ApiTimeout `
      -Body (@{ email = $Email; password = $plain } | ConvertTo-Json)
  }
} catch {
  throw "Sign in failed. Check the email and password. ($(Get-ApiError $_))"
} finally {
  $plain = $null
}

$token = $auth.access_token
$authHeaders = @{ apikey = $SupabaseKey; Authorization = "Bearer $token" }

# Writing needs a row in public.admins, not just a valid login.
$admin = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/admins?select=user_id&limit=1" `
  -Headers $authHeaders -TimeoutSec $ApiTimeout
if (-not $admin) {
  throw "Signed in, but this account is not an admin. Add it to public.admins first (see README step 3)."
}
Write-Host "Signed in as $Email" -ForegroundColor Green

# -------------------------------------------------------------- matching ---
# File names rarely match a brand name character for character, so both sides
# are reduced to letters and digits only: "Cafe NBO" and "Cafenbo" both become
# "cafenbo", "Lavilla.ke" becomes "lavillake".
function Get-BrandKey {
  param([string] $Name)
  $n = $Name.ToLowerInvariant()
  $n = $n -replace '&', 'and'
  $n = $n -replace '[^a-z0-9]+', ''
  # Drop a trailing counter, so "jotoramen2" is still Joto Ramen.
  ($n -replace '\d+$', '')
}

# Names that normalising cannot reconcile. Add your own as "file name" = "brand
# name on the site" if a video ever refuses to match.
$Aliases = @{
  'lillyshairandbeautyparlour' = 'Lilly Hair & Beauty Parlour'
}

# Returns the matching brand key, $null when nothing matches, or a list of keys
# when the name is ambiguous.
function Resolve-BrandKey {
  param([string] $FileKey, [hashtable] $Known)

  if ($Aliases.ContainsKey($FileKey)) {
    $aliased = Get-BrandKey $Aliases[$FileKey]
    if ($Known.ContainsKey($aliased)) { return $aliased }
  }
  if ($Known.ContainsKey($FileKey)) { return $FileKey }

  # "Safaricom Decode" contains the brand; "lavilla" is contained by it. Short
  # keys are excluded so a two letter name cannot swallow half the list.
  if ($FileKey.Length -ge 4) {
    $hits = @($Known.Keys | Where-Object {
      ($_.Length -ge 4) -and ($_.Contains($FileKey) -or $FileKey.Contains($_))
    })
    if ($hits.Count -eq 1) { return $hits[0] }
    if ($hits.Count -gt 1) { return , $hits }
  }
  return $null
}

$projects = Invoke-RestMethod -Headers $authHeaders -TimeoutSec $ApiTimeout `
  -Uri "$SupabaseUrl/rest/v1/projects?select=*&order=category,sort_order,created_at"

$cellsByBrand = @{}
foreach ($p in $projects) {
  $key = Get-BrandKey $p.brand_name
  if (-not $cellsByBrand.ContainsKey($key)) { $cellsByBrand[$key] = @() }
  $cellsByBrand[$key] += $p
}

$files = Get-ChildItem -Path $Folder -File |
  Where-Object { $Extensions -contains $_.Extension.ToLowerInvariant() } |
  Sort-Object Name

if (-not $files) { throw "No video files ($($Extensions -join ', ')) found in $Folder" }

$plan = @()
$problems = @()

foreach ($group in ($files | Group-Object { Get-BrandKey $_.BaseName })) {
  $resolved = Resolve-BrandKey -FileKey $group.Name -Known $cellsByBrand

  if ($resolved -is [array]) {
    foreach ($f in $group.Group) {
      $problems += [pscustomobject]@{
        File = $f.Name
        Reason = "Matches more than one brand ($($resolved -join ', ')) - rename the file to the exact brand name"
      }
    }
    continue
  }

  $key = $resolved
  $cells = if ($key) { @($cellsByBrand[$key]) } else { @() }

  if ($cells.Count -eq 0) {
    foreach ($f in $group.Group) {
      $problems += [pscustomobject]@{
        File = $f.Name
        Reason = "No brand on the site matches '$($f.BaseName)'"
      }
    }
    continue
  }

  # Fill this brand's empty cells first, then cells that already have a video.
  $ordered = @($cells | Where-Object { -not $_.video_url }) + @($cells | Where-Object { $_.video_url })
  $i = 0
  foreach ($f in $group.Group) {
    if ($f.Length -gt $MaxBytes) {
      $problems += [pscustomobject]@{
        File = $f.Name
        Reason = ("{0:N1} MB is over the {1:N0} MB limit" -f ($f.Length / 1MB), ($MaxBytes / 1MB))
      }
      continue
    }
    $cell = $null
    if ($i -lt $ordered.Count) { $cell = $ordered[$i] }
    $replaces = $false
    if ($cell -and $cell.video_url) { $replaces = $true }

    $plan += [pscustomobject]@{
      File     = $f
      Brand    = $cells[0].brand_name
      BrandKey = $key
      Category = $cells[0].category
      Cell     = $cell               # $null means a new cell gets created
      Replaces = $replaces
    }
    $i++
  }
}

# ------------------------------------------------------------------ plan ---
Write-Host ""
Write-Host "Plan" -ForegroundColor Cyan
foreach ($item in $plan) {
  $what = "empty cell"
  if (-not $item.Cell) { $what = "new cell" }
  elseif ($item.Replaces) { $what = "REPLACES the video already on this cell" }

  $line = "{0,-34} -> {1} / {2}  ({3}, {4:N1} MB)" -f $item.File.Name, $item.Category, $item.Brand, $what, ($item.File.Length / 1MB)
  Write-Host $line
}
if ($problems) {
  Write-Host ""
  Write-Host "Skipping" -ForegroundColor Yellow
  foreach ($p in $problems) { Write-Host ("{0,-34} -- {1}" -f $p.File, $p.Reason) }
}
Write-Host ""
Write-Host ("{0} to upload, {1} skipped." -f $plan.Count, $problems.Count)

if ($plan.Count -eq 0) { return }
if (-not $Yes -and -not $WhatIfPreference) {
  if ((Read-Host "Continue? (y/n)") -ne 'y') { Write-Host "Nothing uploaded."; return }
}

# ---------------------------------------------------------------- upload ---
$done = 0
foreach ($item in $plan) {
  $file = $item.File
  if (-not $PSCmdlet.ShouldProcess($file.Name, "upload to $($item.Brand)")) { continue }

  try {
    $cell = $item.Cell
    if (-not $cell) {
      $lastOrder = ($cellsByBrand[$item.BrandKey] |
        Measure-Object -Property sort_order -Maximum).Maximum
      $body = @{
        category = $item.Category; brand_name = $item.Brand; sort_order = $lastOrder + 1
      } | ConvertTo-Json
      $cell = (Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/projects" `
        -Headers ($authHeaders + @{ Prefer = 'return=representation' }) `
        -ContentType 'application/json' -TimeoutSec $ApiTimeout -Body $body)[0]
      Write-Host "  created a new cell for $($item.Brand)" -ForegroundColor DarkGray
    }

    $safe = ($file.Name.ToLowerInvariant() -replace '[^a-z0-9.]+', '-').Trim('-')
    $objectPath = "projects/$($cell.id)/$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$safe"
    $ctype = $ContentTypes[$file.Extension.ToLowerInvariant()]

    Write-Host ("Uploading {0} ({1:N1} MB)..." -f $file.Name, ($file.Length / 1MB)) -ForegroundColor Cyan
    Invoke-WithRetry {
      Invoke-RestMethod -Method Post `
        -Uri "$SupabaseUrl/storage/v1/object/$Bucket/$objectPath" `
        -Headers ($authHeaders + @{ 'x-upsert' = 'true' }) `
        -ContentType $ctype -TimeoutSec $UploadTimeout -InFile $file.FullName
    } | Out-Null

    $publicUrl = "$SupabaseUrl/storage/v1/object/public/$Bucket/$objectPath"
    $patch = @{ video_url = $publicUrl; video_path = $objectPath } | ConvertTo-Json
    Invoke-WithRetry {
      Invoke-RestMethod -Method Patch -Uri "$SupabaseUrl/rest/v1/projects?id=eq.$($cell.id)" `
        -Headers $authHeaders -ContentType 'application/json' -TimeoutSec $ApiTimeout -Body $patch
    } | Out-Null

    Write-Host "  attached to $($item.Category) / $($item.Brand)" -ForegroundColor Green
    $done++
  } catch {
    Write-Host "  FAILED: $(Get-ApiError $_)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "$done of $($plan.Count) uploaded." -ForegroundColor Green
Write-Host "Open /admin to add captions and post links, or reorder anything." -ForegroundColor DarkGray
