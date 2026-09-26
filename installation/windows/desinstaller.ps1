<#
  DÉSINSTALLATION · arrête et retire les deux services, et NE TOUCHE PAS aux
  données. La comptabilité d'un client (base, sauvegardes, licence) reste
  dans %ProgramData%\OmegaX : une désinstallation par erreur, ou avant une
  réinstallation, ne doit jamais emporter des années de livres.
#>
param([Parameter(Mandatory = $true)][string]$Racine)
$ErrorActionPreference = 'Continue'
if (Get-Service 'OmegaX' -ErrorAction SilentlyContinue) {
  Stop-Service 'OmegaX' -Force
  & (Join-Path $Racine 'omegax-service.exe') uninstall | Out-Null
}
if (Get-Service 'OmegaX-PostgreSQL' -ErrorAction SilentlyContinue) {
  Stop-Service 'OmegaX-PostgreSQL' -Force
  & (Join-Path $Racine 'pgsql\bin\pg_ctl.exe') unregister -N 'OmegaX-PostgreSQL' | Out-Null
}
Remove-NetFirewallRule -DisplayName 'OmegaX' -ErrorAction SilentlyContinue
exit 0
