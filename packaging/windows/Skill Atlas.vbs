Option Explicit
Dim shell, files, appDir, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
appDir = files.GetParentFolderName(WScript.ScriptFullName)
command = Chr(34) & appDir & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & appDir & "\desktop-launcher.mjs" & Chr(34)
shell.Run command, 0, False
