# 变更记录

## 0.5.0

- 更名 SoftDark → CoolDark：主题 id、包名、`data-cooldark` 标记、`__cooldark` 句柄、`--cooldark-*` 变量同步。旧 localStorage 键 `softdark:opt-out` / `softdark:font-baseline` 按历史字面量保留，清理逻辑不受影响
- 新增 token 自绘兜底表：布局层不铺内联 token 时，由注入表重声明 88 条（`html[data-cooldark] body`，(0,1,2) 压过内置 (0,1,1)），背景色不再依赖布局层
- 标题栏与侧栏分色（注入 `*_frame::before`；侧栏仍走 `--dsw-specific-sidebar-fill`）
- 内容区 inset 阴影，8 个 `--cooldark-inset-*` 变量可调
- 代码块 `CODE.block = #121212` 与语言条 `CODE.banner = #2e3139` 彻底分家
- 聊天气泡 25% DodgerBlue 底 + 40% 白描边；行内代码改 `veil(WHITE, subtle)`
- markdown h1–h4 独立标题色、ul/ol marker 上色、粗体 `#93c430`、链接独立 `ACCENT.link`
- 字号不接管，交回设置面板
- `SURFACE.buttonElevated` / `sendFill` / `sendHover` 独立原子

## 0.4.x

- **0.4.10** 修掉「改一下代码字体大小主题就消失」：`adopt()` 把持久偏好抄了回来，改用「字体有没有一起变」区分设置写入与真实换主题
- **0.4.9** 语言条上的小字发糊：在 banner 上把 `--dsw-alias-label-tertiary` 重声明为 `INK.secondary`（5.2:1）
- **0.4.8** 代码块井挖深（`#24262b` → `#121212`），语言条留 `#2e3139`，两者可分辨
- **0.4.7** 语言条从「与代码块同色」抬到看得见的位置
- **0.4.6** 修掉「整块主题突然全灭」：插件行重载会重放 `preference: dark`，旧逻辑误判成用户切走就整场会话罢工，改为有预算地重申
- **0.4.5** 语言条光靠 token 改不出变化，另注入 CSS 把 sticky 包裹层和 banner 一起刷色
- **0.4.4** 拆出 `CODE.banner`，放大输入框聚焦光晕（`haloBlur` 18→32、`haloAlpha` 0.1→0.16）
- **0.4.3** 输入框加聚焦白光环，画布换色后重算全部对比度
- **0.4.2** 粗体从卡其换成 `#00CED1` 深青
- **0.4.1** 接管粗体颜色
- **0.4.0** 删掉字号接管——字号是设置项，主题不该覆盖用户的选择

## 0.3.x

- **0.3.7** 拆出 `ACCENT.link`（链接与强调色分家），两种列表的 marker 各自上色
- **0.3.6** markdown 的 h1–h4 加独立标题色
- **0.3.5** 代码块底从侧栏色里拆出来
- **0.3.4** 气泡换 `#1E90FF` 底 + 白框，墨色钉成纯白
- **0.3.3** 气泡描边改成半透明
- **0.3.2** 修掉「插件已启用、主题却不生效」的持久 opt-out 问题
