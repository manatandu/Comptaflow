; PROGRAMME D'INSTALLATION D'OMEGAX SUR SITE · compilé par le workflow
; `paquet-sur-site.yml` (Inno Setup 6), jamais à la main. Il copie le paquet,
; puis confie tout le reste à `initialiser.ps1` (base, configuration,
; services, pare-feu), qui est rejouable · la même installation sert à la
; première pose et à chaque mise à jour.
;
; Trois valeurs viennent du workflow par l'environnement : la version
; (date du commit), le commit, et la version majeure de PostgreSQL portée
; par le paquet.

#define Version GetEnv("OMEGAX_VERSION")
#define Commit GetEnv("OMEGAX_COMMIT")
#define PgMajeur GetEnv("OMEGAX_PG_MAJEUR")
#define Paquet GetEnv("OMEGAX_PAQUET")

[Setup]
; L'identifiant ne change JAMAIS · c'est lui qui fait reconnaître une mise à
; jour comme telle, au lieu d'une seconde installation à côté de la première.
AppId={{6F1D3C52-8B0E-4B7A-9C41-0D6E2A7F5B93}
AppName=OmegaX
AppVersion={#Version} ({#Commit})
AppVerName=OmegaX {#Version}
AppPublisher=VMG Consulting
DefaultDirName={autopf}\OmegaX
DisableProgramGroupPage=yes
DisableDirPage=auto
OutputDir=sortie
OutputBaseFilename=OmegaX-installation-{#Version}-{#Commit}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=OmegaX

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[InstallDelete]
; Le programme se remplace en entier · un fichier d'une version précédente
; resté à côté (un module retiré, une ancienne feuille de style) serait servi
; ou chargé sans que personne ne sache d'où il vient. Les DONNÉES ne sont pas
; ici, elles vivent dans %ProgramData%\OmegaX et ne sont jamais touchées.
Type: filesandordirs; Name: "{app}\serveur"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\node"

[Files]
Source: "{#Paquet}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autodesktop}\OmegaX"; Filename: "{app}\ouvrir-omegax.cmd"; WorkingDir: "{app}"; Flags: runminimized
Name: "{autoprograms}\OmegaX\OmegaX"; Filename: "{app}\ouvrir-omegax.cmd"; WorkingDir: "{app}"; Flags: runminimized
Name: "{autoprograms}\OmegaX\Désinstaller OmegaX"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\ouvrir-omegax.cmd"; Description: "Ouvrir OmegaX"; Flags: postinstall nowait skipifsilent runminimized shellexec

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installation\desinstaller.ps1"" -Racine ""{app}"""; Flags: runhidden waituntilterminated; RunOnceId: "RetirerServices"

[Code]
function Executer(const Fichier, Parametres: String): Integer;
var
  Code: Integer;
begin
  if not Exec(Fichier, Parametres, '', SW_HIDE, ewWaitUntilTerminated, Code) then
    Code := -1;
  Result := Code;
end;

{ Avant la copie · deux choses, et la première ne se rattrape pas après.
  Une base PostgreSQL ne s'ouvre qu'avec les binaires de sa version majeure :
  si le paquet en change, la copie écraserait les binaires dont la base du
  client a besoin. On refuse donc AVANT de copier. Puis les deux services
  s'arrêtent, faute de quoi leurs fichiers seraient verrouillés. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Version: AnsiString;
  Fichier: String;
begin
  Result := '';
  Fichier := ExpandConstant('{commonappdata}\OmegaX\pgdata\PG_VERSION');
  if FileExists(Fichier) and LoadStringFromFile(Fichier, Version) then
  begin
    if Trim(String(Version)) <> '{#PgMajeur}' then
    begin
      Result := 'La base de ce poste est en PostgreSQL ' + Trim(String(Version)) +
        ' et ce paquet porte PostgreSQL {#PgMajeur}. La mise à jour est arrêtée avant toute copie. Contactez VMG Consulting.';
      exit;
    end;
  end;
  Executer(ExpandConstant('{sys}\net.exe'), 'stop OmegaX');
  Executer(ExpandConstant('{sys}\net.exe'), 'stop OmegaX-PostgreSQL');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Préparation de la base et des services OmegaX...';
    Code := Executer(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\installation\initialiser.ps1') +
      '" -Racine "' + ExpandConstant('{app}') + '"');
    if Code <> 0 then
      MsgBox('La préparation d''OmegaX a échoué (code ' + IntToStr(Code) + ').' + #13#10 +
        'Le journal est dans ' + ExpandConstant('{commonappdata}') + '\OmegaX\installation.log.' + #13#10 +
        'Transmettez-le à VMG Consulting.', mbError, MB_OK);
  end;
end;
