#ifndef MyAppName
  #define MyAppName "Skill Atlas"
#endif
#ifndef MyAppPublisher
  #define MyAppPublisher "NaCr05"
#endif
#ifndef MyAppURL
  #define MyAppURL "https://github.com/NaCr05/skill-atlas"
#endif
#ifndef MyAppExeName
  #define MyAppExeName "Skill Atlas.vbs"
#endif
#ifndef MyAppId
  #define MyAppId "{{9EFDD360-E8C7-46C2-95DD-D018535114E4}"
#endif
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif
#ifndef StageDir
  #define StageDir "..\..\dist\windows\app"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist\windows\installer"
#endif
#ifndef OutputBaseFilename
  #define OutputBaseFilename "Skill-Atlas-Setup-{#MyAppVersion}"
#endif

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\Skill Atlas
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\skill-atlas.ico

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
#ifndef SmokeMode
Name: "{group}\Skill Atlas"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\skill-atlas.ico"
Name: "{autodesktop}\Skill Atlas"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\skill-atlas.ico"; Tasks: desktopicon
#endif

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Run]
#ifndef SmokeMode
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Skill Atlas"; Flags: postinstall shellexec skipifsilent nowait
#endif
