' ============================================================
'  Lancer-StudyIDE-Silencieux.vbs
'  Double-clique pour lancer StudyIDE SANS fenêtre de terminal
'  visible (usage quotidien).
'
'  Si l'appli n'a jamais été installée sur ce PC, ce script
'  bascule automatiquement sur Lancer-StudyIDE.bat (terminal
'  visible) pour que tu voies la progression de l'installation
'  la première fois. Les fois suivantes, tout est silencieux.
' ============================================================

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Dépendances déjà installées : lancement silencieux, fenêtre cachée (0 = hidden)
    shell.CurrentDirectory = scriptDir
    shell.Run "cmd /c npm start", 0, False
Else
    ' Première installation : on repasse par la version visible pour voir ce qui se passe
    shell.Run """" & scriptDir & "\Lancer-StudyIDE.bat""", 1, True
End If
