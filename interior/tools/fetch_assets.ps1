# Downloads the Poly Haven (CC0) textures, props and skies the upgraded interiors use into interior\assets,
# then zips them to interior\assets.zip. Run from the project folder:  interior\fetch_assets.bat
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Join-Path (Get-Location) 'interior\assets'
$ua = @{ 'User-Agent' = 'sebotse-interior-fetch/1.0' }

$textures = @('laminate_floor_02','wood_floor','herringbone_parquet','oak_veneer_01','kitchen_wood','dark_wood',
  'marble_01','floor_tiles_06','interior_tiles','white_plaster_02','plastered_wall_04','fabric_pattern_05',
  'fabric_pattern_07','velour_velvet','leather_white')
$models = @('potted_plant_01','potted_plant_02','potted_plant_04','anthurium_botany_01','calathea_orbifolia_01',
  'pachira_aquatica_01','book_encyclopedia_set_01','ceramic_vase_01','ceramic_vase_02',
  'ceramic_vase_03','ceramic_vase_04','brass_vase_01','hanging_picture_frame_01','hanging_picture_frame_02',
  'hanging_picture_frame_03','standing_picture_frame_01','throw_pillows_01','wicker_basket_01','wooden_bowl_01',
  'tea_set_01','jug_01','food_apple_01','lemon','wooden_cutting_board','wall_clock','alarm_clock_01','Ottoman_01',
  'mid_century_lounge_chair','side_table_tall_01','planter_pot_clay','brass_candleholders','wooden_candlestick')
$hdris = @('canary_wharf','rooftop_night','shanghai_riverside')

function Get-File($url, $dest) {
  if (Test-Path $dest) { return }
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  for ($i = 0; $i -lt 3; $i++) {
    try { Invoke-WebRequest -Uri $url -OutFile $dest -Headers $ua -UseBasicParsing; return }
    catch { Start-Sleep -Seconds 2 }
  }
  Write-Host "  !! failed: $url"
}
function Get-Info($id) { Invoke-RestMethod -Uri "https://api.polyhaven.com/files/$id" -Headers $ua }

foreach ($id in $textures) {
  Write-Host "texture $id"
  try { $f = Get-Info $id } catch { Write-Host "  !! not found"; continue }
  foreach ($map in @('Diffuse','nor_gl','Rough','arm')) {
    $entry = $f.$map
    if ($null -eq $entry) { continue }
    $url = $entry.'2k'.jpg.url
    if ($url) { Get-File $url (Join-Path $root "textures\$id\$($id)_$($map)_2k.jpg") }
  }
}
foreach ($id in $models) {
  Write-Host "model $id"
  try { $f = Get-Info $id } catch { Write-Host "  !! not found"; continue }
  $g = $f.gltf.'1k'.gltf
  if ($null -eq $g) { Write-Host '  !! no gltf'; continue }
  $dir = Join-Path $root "models\$id"
  Get-File $g.url (Join-Path $dir "$id.gltf")
  foreach ($p in $g.include.PSObject.Properties) { Get-File $p.Value.url (Join-Path $dir ($p.Name -replace '/', '\')) }
}
foreach ($id in $hdris) {
  Write-Host "sky $id"
  try { $f = Get-Info $id } catch { Write-Host "  !! not found"; continue }
  Get-File $f.hdri.'4k'.hdr.url (Join-Path $root "hdri\$($id)_4k.hdr")
}

$zip = Join-Path (Get-Location) 'interior\assets.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$root\*" -DestinationPath $zip -CompressionLevel Fastest
$mb = [math]::Round((Get-Item $zip).Length / 1MB)
Write-Host "Done: interior\assets.zip ($mb MB)"
