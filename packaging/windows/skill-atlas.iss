#define MyAppName "Skill Atlas"
#define MyAppPublisher "NaCr05"
#define MyAppURL "https://github.com/NaCr05/skill-atlas"
#define MyAppExeName "Skill Atlas.vbs"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-dev"
#endif
#ifndef StageDir
  #define StageDir "..\..\dist\windows\app"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist\windows\installer"
#endif

[Setup]
AppId={{9EFDD360-E8C7-46C2-95DD-D018535114E4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\Skill Atlas
DefaultGroupName=Skill Atlas
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=Skill-Atlas-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\skill-atlas.ico

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Skill Atlas"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\skill-atlas.ico"
Name: "{autodesktop}\Skill Atlas"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\skill-atlas.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Skill Atlas"; Flags: postinstall shellexec skipifsilent nowait
