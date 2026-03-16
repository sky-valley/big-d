Output "/tmp/intent-space-dojo-demo.mp4"

Require zsh
Require bash
Require codex

Set Shell "zsh"
Set Theme "Catppuccin Macchiato"
Set FontFamily "Menlo"
Set FontSize 26
Set LetterSpacing 0.2
Set LineHeight 1.15
Set Width 1680
Set Height 960
Set Padding 36
Set BorderRadius 24
Set MarginFill "#08111f"
Set Margin 56
Set WindowBar ColorfulRight
Set WindowBarSize 44
Set Framerate 60
Set TypingSpeed 30ms
Set PlaybackSpeed 1.0

Type "cd /Users/noam/work/skyvalley/big-d"
Sleep 500ms
Enter
Sleep 1s

Type "AGENT_TARGET=codex academy/scripts/demo-tester-dojo.sh /Users/noam/work/skyvalley/big-d"
Sleep 500ms
Enter

Sleep 180s
