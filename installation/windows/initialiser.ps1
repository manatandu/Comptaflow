<#
  INITIALISATION D'UNE INSTALLATION SUR SITE · lancée par le programme
  d'installation, en administrateur, après la copie des fichiers. Elle est
  REJOUABLE : une mise à jour la relance, et elle ne recrée jamais ce qui
  existe · la base, son mot de passe et le secret de session d'un client en
  service ne se régénèrent pas, sinon sa base deviendrait illisible et toutes
  les sessions tomberaient.

  Tout est journalisé dans %ProgramData%\OmegaX\installation.log · c'est ce
  fichier que VMG demande quand une installation échoue chez un client.
#>
param([Parameter(Mandatory = $true)][string]$Racine)

$ErrorActionPreference = 'Stop'
$Donnees = Join-Path $env:ProgramData 'OmegaX'
New-Item -ItemType Directory -Force -Path $Donnees | Out-Null
$Journal = Join-Path $Donnees 'installation.log'
function Noter([string]$m) { Add-Content -Path $Journal -Value ("[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $m) }

try {
  Noter "Initialisation depuis $Racine"
  $PgBin = Join-Path $Racine 'pgsql\bin'
  $PgData = Join-Path $Donnees 'pgdata'
  $FichierEnv = Join-Path $Donnees 'omegax.env'
  $Port = 5433
  $ServicePg = 'OmegaX-PostgreSQL'

  # Les deux fichiers sensibles (configuration et base) ne sont lisibles que
  # par le système et les administrateurs · SID plutôt que noms, qui changent
  # avec la langue de Windows (« Administrateurs »).
  function Restreindre([string]$chemin, [string[]]$autres = @()) {
    $droits = @('*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F') + $autres
    & icacls $chemin /inheritance:r /grant:r @droits | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls a échoué sur $chemin ($LASTEXITCODE)" }
  }

  # Un mot de passe et un secret de session se tirent au générateur
  # cryptographique · Get-Random est prévisible et ne sert pas à cela.
  function Aleatoire([int]$octets) {
    $b = New-Object byte[] $octets
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return -join ($b | ForEach-Object { $_.ToString('x2') })
  }

  if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
    Noter 'Création de la base de données'
    $mdp = Aleatoire 16
    $pw = Join-Path $env:TEMP ("omegax-" + [guid]::NewGuid() + '.txt')
    Set-Content -Path $pw -Value $mdp -NoNewline -Encoding ascii
    try {
      & (Join-Path $PgBin 'initdb.exe') -D $PgData -U omegax -A scram-sha-256 --pwfile=$pw -E UTF8 --locale=C | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "initdb a échoué ($LASTEXITCODE)" }
    } finally { Remove-Item $pw -Force -ErrorAction SilentlyContinue }
    # Le port 5433 et la seule adresse locale · la base ne s'ouvre jamais au
    # réseau, seul le serveur OmegaX, sur ce poste, la joint.
    Add-Content -Path (Join-Path $PgData 'postgresql.conf') -Value "`nport = $Port`nlisten_addresses = '127.0.0.1'`n"
    # PostgreSQL tourne sous le compte Service réseau (celui que pg_ctl
    # register pose par défaut) · sans son droit, le service ne lirait pas
    # sa propre base et ne démarrerait jamais.
    Restreindre $PgData @('*S-1-5-20:(OI)(CI)F')
    & (Join-Path $PgBin 'pg_ctl.exe') register -N $ServicePg -D $PgData -S auto | Out-Null
    Start-Service $ServicePg
    $env:PGPASSWORD = $mdp
    & (Join-Path $PgBin 'createdb.exe') -h 127.0.0.1 -p $Port -U omegax omegax
    if ($LASTEXITCODE -ne 0) { throw "createdb a échoué ($LASTEXITCODE)" }
    Remove-Item Env:\PGPASSWORD

    $secret = Aleatoire 32
    @(
      '# Configuration du poste OmegaX · écrite à l''installation, conservée par les mises à jour.',
      "DATABASE_URL=postgresql://omegax:$mdp@127.0.0.1:$Port/omegax",
      "JWT_SECRET=$secret",
      'MODE_INSTALLATION=SUR_SITE',
      'NODE_ENV=production',
      'PORT=8080',
      'INSCRIPTION_PUBLIQUE=true',
      "DOSSIER_DONNEES=$Donnees",
      "DOSSIER_INTERFACE=$(Join-Path $Racine 'client')",
      "PG_BIN=$PgBin"
    ) | Set-Content -Path $FichierEnv -Encoding utf8
    Restreindre $FichierEnv
    Noter 'Base et configuration créées'
  } else {
    Noter 'Base existante conservée'
    # Une base PostgreSQL ne s'ouvre qu'avec les binaires de SA version
    # majeure. Un paquet qui changerait de version majeure arrêterait la base
    # du client sans rien lui dire · on s'arrête ici, avant de toucher à quoi
    # que ce soit, et la conversion (pg_upgrade) se fait avec VMG.
    $majeurBase = (Get-Content (Join-Path $PgData 'PG_VERSION') -TotalCount 1).Trim()
    $majeurPaquet = ((& (Join-Path $PgBin 'pg_ctl.exe') --version) -replace '^\D*(\d+).*$', '$1').Trim()
    if ($majeurBase -ne $majeurPaquet) {
      throw "La base est en PostgreSQL $majeurBase et ce paquet porte PostgreSQL $majeurPaquet · mise à jour arrêtée, contactez VMG Consulting."
    }
    # Une mise à jour peut déplacer le programme · les chemins suivent, le
    # reste (mot de passe, secret) ne bouge jamais.
    $lignes = Get-Content $FichierEnv | Where-Object { $_ -notmatch '^(DOSSIER_INTERFACE|PG_BIN)=' }
    $lignes += "DOSSIER_INTERFACE=$(Join-Path $Racine 'client')"
    $lignes += "PG_BIN=$PgBin"
    $lignes | Set-Content -Path $FichierEnv -Encoding utf8
    if ((Get-Service $ServicePg).Status -ne 'Running') { Start-Service $ServicePg }
  }

  $Winsw = Join-Path $Racine 'omegax-service.exe'
  if (-not (Get-Service 'OmegaX' -ErrorAction SilentlyContinue)) {
    & $Winsw install | Out-Null
    Noter 'Service OmegaX installé'
  }
  Start-Service 'OmegaX'

  if (-not (Get-NetFirewallRule -DisplayName 'OmegaX' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'OmegaX' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private,Domain | Out-Null
    Noter 'Pare-feu ouvert sur le port 8080 (réseaux privé et de domaine)'
  }
  Noter 'Initialisation terminée'
  exit 0
} catch {
  Noter ("ÉCHEC · " + $_.Exception.Message)
  exit 1
}
