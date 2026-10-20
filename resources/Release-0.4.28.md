# Markit 0.4.28

修复预览模式下鼠标选择文字后，复制结果缺少开头星号、保留半截链接等问题。

- **普通复制（Ctrl+C / Cmd+C）**：提供可见文字和 HTML 富文本，粘贴到支持富文本的应用时保留加粗、斜体和链接。
- **复制为 Markdown（Ctrl+Shift+C / Cmd+Shift+C）**：保留完整的格式标记和链接地址，支持部分文字、嵌套格式及引用式链接；也可从菜单调用。
- **默认复制设置**：新增“复制纯文本时使用 Markdown 源码”，可将普通复制的纯文本内容改为 Markdown。
- **剪切与粘贴**：修复剪切后残留不成对格式标记的问题；从 Markit 粘贴回预览模式时保留格式，并支持粘贴为纯文本。
- **源码模式**：继续原样复制选区。

提供 Windows x64 安装程序与便携 ZIP、macOS Apple Silicon（arm64）DMG，以及 Linux x64 AppImage、DEB、RPM 和便携 tar.gz。Linux 运行依赖见仓库的开发与构建指南。

`SHA256SUMS.txt` 包含安装包和 Citations 插件附件的校验值。
