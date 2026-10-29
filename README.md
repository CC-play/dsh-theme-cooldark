# CoolDark — DSH 自定义主题插件

给 **DeepSeek Harness**（DSH，`~/.dsh` / `DeepSeek Harness.exe`）写的第三方主题插件脚手架。
当前版本 **0.5.0**：主题能注册、能生效、能一键切回，且在**设置里改字号/字体会自动重申**（不会把主题弄丢）；配色分三层集中管理、无裸色值，聊天气泡 25% DodgerBlue 底 + 40% 白描边，代码块底独立成 `CODE.block = #121212`（比画布更沉的黑井），语言条 `CODE.banner = #2e3139` 抬出井外、看得见分界，条上小字重声明为 `INK.secondary`（5.2:1），且绕过 token 直接注入 CSS 保证生效；markdown 的 h1–h4 有独立标题色、ul/ol 的 marker 各自上色、粗体为橄榄 `#93c430`，链接独立成 `ACCENT.link`。**字号不再接管**，交回设置面板。本版另加：token 自绘兜底（背景色不再依赖布局层铺内联样式）、标题栏与侧栏分色、内容区 inset 阴影（参数全部走 `--cooldark-inset-*` 变量）、行内代码改半透明洗色、「新会话」与发送按钮独立原子色，并整体更名 SoftDark → **CoolDark**。
0.3.2 修掉「插件已启用、主题却不生效」的持久 opt-out 问题（见下方事故记录）；0.3.3 把气泡描边做成半透明，0.3.4 换成 `#1E90FF` 底 + 白框并把墨色钉成纯白，0.3.5 把代码块底从侧栏色里拆出来（`CODE.block = #24262b`）；0.3.6 给 markdown 的 h1–h4 加独立标题色；0.3.7 拆出 `ACCENT.link`（链接与强调色分家）并给两种列表的 marker 上色；0.4.0 **删掉字号接管**——字号是设置项，主题不该覆盖用户的选择；0.4.1 接管粗体颜色（唯一不需要气泡回退的 markdown 色），0.4.2 把它从卡其换成 `#00CED1` 深青；0.4.3 给输入框加聚焦白光环，并把画布换色后的所有对比度数值重算；0.4.4 把语言条拆成 `CODE.banner`（与代码块同色、无缝）并放大输入框聚焦光晕（`haloBlur` 18→32、`haloAlpha` 0.1→0.16）；0.4.5 修掉「语言条改了看不出变化」——光靠 token 不够，另注入一条 CSS 同时把 sticky 包裹层和 banner 本身刷成 `CODE.banner`；0.4.6 修掉「整块主题突然全灭」——插件行被重载时会重放 `preference: dark`，旧逻辑误判成"用户切走了"就整场会话罢工，现在改为有预算地重申，并加了 `data-cooldark` 标记与 `[cooldark]` 报错日志；0.4.7 把语言条从"与代码块同色"抬到看得见的位置；0.4.8 把**代码块井挖深**（`CODE.block` `#24262b` → `#121212`，对画布 1.19:1），条子留 `#2e3139`，两者彻底分家（1.44:1）；0.4.9 修掉「条子上的小字糊了」——在 banner 上把 `--dsw-alias-label-tertiary` 重声明为 `INK.secondary`，5.2:1；0.4.10 修掉「改一下代码字体大小主题就消失」——`adopt()` 会把持久偏好抄回来，现在用「字体有没有一起变」区分设置写入与真实换主题。**0.5.0**：更名 SoftDark → CoolDark（主题 id、包名、`data-cooldark` 标记、`__cooldark` 句柄、`--cooldark-*` 变量同步；旧 localStorage 键 `softdark:opt-out` / `softdark:font-baseline` 按历史字面量保留，清理逻辑不受影响）；新增 token 自绘兜底表（第三方 id 永远不是持久偏好，布局层不铺内联 token 时由注入表重声明 88 条，`html[data-cooldark] body`，(0,1,2) 压过内置 (0,1,1)）；标题栏与侧栏分色（注入 `*_frame::before`，侧栏仍走 `--dsw-specific-sidebar-fill`，右上角原生窗口按钮仍跟侧栏色，属已知限制）；内容区 inset 阴影（`::after` 叠加层，避开子元素不透明背景遮挡，8 个 `--cooldark-inset-*` 变量可调）；`SURFACE.buttonElevated` / `sendFill` / `sendHover` 独立原子，行内代码改 `veil(WHITE, subtle)` 半透明，粗体改 `#93c430`。

---

## 它是什么形态的插件

DSH 的插件体系是 cordis bundle：一个普通 npm 包 + 一份 `cordis.patch.yml`，通过 `plugin_manager` 的
`install_bundle` 装进当前 profile，装完对所有 session 生效、重启后仍在。

主题属于**纯浏览器端扩展**，所以本包是「Host 空壳 + Client 实体」的结构：

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch` + `dsh.client`（`platform: web`、`immediately`、依赖 `@deepseek-ai/dsh-client-ui-theme`） |
| `cordis.patch.yml` | 往 profile 里插入一行插件：`id: cooldark`，`name: @local/cooldark` |
| `index.js` | Host 半边，`export function apply() {}` 故意为空（主题不需要 Host 逻辑） |
| `client.js` | **核心**。分层常量（CONFIG / 色阶原子 / PALETTE / TOKENS / STYLES）→ `ctx.theme.register()` → 自动启用 |
| `locale/{zh,en}.json` | 插件管理面板里显示的标题与描述 |
| `icon.svg` | 插件图标（原创，可自由替换） |
| `docs/dark-tokens.md` | 官方 108 个 alias token 的深浅值对照表，扩色时查表用 |
| `dev/smoke.mjs` | 无浏览器冒烟测试：`node dev/smoke.mjs`，校验模块形态、token 表、注册/启用/退出流程 |
| `dev/verify-manifest.mjs` | 清单自检：`node dev/verify-manifest.mjs`，校验 `exports` 子路径、self-reference 解析、patch 形态。**装之前必跑** |

## 工作原理（一句话版）

`ctx.theme.register({ id, colorScheme: 'dark', tokens })` 把 `tokens`（token 名 → CSS 值）注册成第三方主题；
激活时布局层把这些值以**内联样式**写到 `<body>`，优先级高于内置的 `body[data-ds-dark-theme]` 规则，
所以只覆盖想改的 token、其余保持官方值即可。详见 `client.js` 顶部注释。

## 怎么装

在 DSH 里对 Agent 说一句即可（它会调用自带的 `plugin_manager`）：

> 用 install_bundle 安装 `D:\Users\94184\Documents\+Documents\Programming\code\JavaScript\DSH`，target 就是这个目录。

装完插件行会出现在「设置 → 插件」里，可随时禁用；禁用即恢复原主题。
**不要**手工改 profile 的 `package.json` / `cordis.patch.yml`，那是 `install_bundle` 的职责。

## 怎么改色

`client.js` 的配色分三层，**往下层写死色值是不对的**：

```
CONFIG   主题 id / 配色方案 / 存储键 / 开关            ← 行为常量
COLOURS  SURFACE INK ACCENT STATE DIFF CODE BUBBLE MARKDOWN FOCUS + VEIL  ← 命名原子色，hex 只在这里
PALETTE  15 组 92 个语义角色，全部引用上一层            ← 想换风格改这里
TOKENS   88 行 `--dsw-*` → PALETTE 的 1:1 映射          ← 加覆盖项改这里
STYLES   气泡 + 焦点光晕 + 标题色 + marker + 粗体 + 语言条  ← 见「聊天气泡」「输入框焦点光晕」「Markdown 排版」
```

**常见调法**

| 想改什么 | 改哪里 | 影响面 |
|---|---|---|
| 主内容区底色 | `SURFACE.canvas` | 正文区、文档预览、反色按钮文字 |
| 正文颜色 | `INK.primary` | 所有正文、品牌文字、对比按钮填充 |
| 侧栏底色 | `SURFACE.sunken` | 侧栏、未选中的代码分段（**不含**代码块，见下一条） |
| 代码块底色 | `CODE.block` | 围栏代码块、代码块内复制按钮的底 |
| 代码块顶部语言条 | `CODE.banner` | 显示语言 + 复制按钮的那条 banner（对代码块底 1.44:1） |
| 语言条上的小字 | `INK.secondary`（重声明 `--dsw-alias-label-tertiary`） | 语言名 `ts` / 文件标题，条子内 5.2:1 |
| 某一层浮起面板 | `SURFACE.raised2` / `raised3` | 弹层、浮动按钮、标签 |
| 强调色 | `ACCENT.base` / `ACCENT.bright` | 链接、业务色、信息按钮、选区 |
| 聊天气泡 | `BUBBLE.fill` / `.border` / `.ink` | 用户消息、steering、`/goal` 指令气泡 |
| 输入框焦点光晕 | `FOCUS.ringAlpha` / `.haloAlpha` / `.haloBlur` | 输入卡片聚焦时的白光；设为 `null` 即撤掉 |
| 半透明描边强度 | `VEIL.*` | 所有 border-*、hover 洗色（`veil()` 自动转 `#rrggbbaa`） |

`veil(WHITE, VEIL.faint)` 就是原来的 `#ffffff12` —— 透明度用 0–1 的小数表达，不再手写十六进制后缀。
改完跑 `node dev/smoke.mjs`：断言校验的是**映射关系**（`bg-base` 必须等于 `SURFACE.canvas`），不是写死的 hex，
所以你随便换颜色都不会把测试跑红。若画布比 `raised1` 还亮，测试会打印一行 elevation 反序提示。

**加新 token**：在 `buildTokens()` 里加一行 `'--dsw-alias-xxx': p.group.key`，并在 `PALETTE` 里补角色名；
可用 token 名从 `docs/dark-tokens.md` 里挑（目前覆盖 86/108，缺失的多为 diff 语法色与 onboarding 色）。
token 值支持任意 CSS 表达式：`#rrggbb`、`rgba()`、`color-mix(in srgb, ...)`、`var(--dsw-static-blue-500)`。

当前配色取向：中性无偏色的 `#1f232a` 画布，正文 `#dcdcdc`（不再纯白、也不再偏暖），
表面按 10 级暗灰色阶分层（`#2C303d` 侧栏板 → `#606060`，步长自 6 递增到 10），强调色收敛为雾蓝 `#8fa8e8`。
代码块底是**独立原子** `CODE.block = #121212`，不跟着 `SURFACE.sunken` 走 —— 侧栏是比画布亮的蓝灰板，代码块是比画布更沉的黑井（对画布 1.19:1，靠明度就分得开），两者方向相反。
顶部语言条独立成 `CODE.banner = #2e3139`，**从井里抬起来**（对代码块底 1.44:1），
所以那条 banner 现在是一条能看见的、微微上浮的标题栏，语言标签和复制按钮压在它上面。

## 聊天气泡

气泡是**唯一一处超出 token 范围**的地方，做法值得记一笔。

官方气泡规则（`UserStyleBubble`、`PendingSteeringBubble`、`/goal` 指令气泡共用）是这样的：

```css
.LOmM4q_bubble{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);
  color:var(--dsw-alias-label-primary);padding:10px 16px}
```

- **背景**能靠 token 改：`--dsw-specific-bubble` 是 `--dsw-specific-*` 系列的一员，`BUBBLE.fill` 直接喂进去。
  值可以是任何 CSS 颜色，包括半透明 —— 当前就是 `rgba(30, 144, 255, 0.25)`（`#1E90FF` 25%）。
- **描边不能**：这条规则里根本没有 `border` 声明，整个 alias 层也没有「气泡边框」这个 token。
- **文字要看底色**：文字吃的是全局 `--dsw-alias-label-primary`。底色亮到一定程度就必须改颜色，
  而「半透明」不等于「暗」—— 25% 的 `#1E90FF` 叠出来是暗汽油蓝，主题的 `#dcdcdc` 掉到 8.3:1，
  所以这一项是**条件写入**（当前写死成纯白）。

所以 `client.js` 多了一节 `4b. STYLES`，注入一张很小的样式表。它**不去硬改 `color` 抢优先级**，
而是在气泡元素上**就地重声明 alias token** —— 让 App 自己的规则在气泡内部解析成局部值，气泡外一切照旧。
值为 `null` 的角色不会写进样式表，等于「沿用主题原值」：

```css
body :is([class$="_bubble"], [class*="_bubble "]):not([class*="_bubble_"]) {
  border: 1px solid rgba(255, 255, 255, 0.4);
}
```

当前 `fill` 是 25% 的 DodgerBlue，叠在 `#1f232a` 上得到 `#1f3e5f`（暗汽油蓝）。在这个底上主题的
`#dcdcdc` 能到 8.0:1，但仍把 `ink` 钉成纯白留余量（11.0:1）、`link` 提亮成淡冰蓝（9.1:1）——
主题统一的链接钴蓝 `#2288ee` 在蓝底上只有 3.1:1，雾蓝强调色 4.7:1，都太闷。描边是 40% 白，叠在气泡底
上是一条钢灰边（`#798b9f`，3.1:1），有边界感但不抢眼。改 `fill` 之后如果忘了动 `ink`，测试会直接报错拦住你。

**选择器为什么写成这个样子**：CSS Modules 的类名是 `<hash>_<local>`，三个聊天气泡分别是
`LOmM4q_bubble` / `BfLV8a_bubble` / `rhSLKq_bubble`；而同一套设计系统里的 **tooltip** 叫
`_bubble_44yfq_1`（带序号后缀，是 `position:fixed` 的浮层，不是聊天气泡）。用 `$=` 匹配结尾、
用 `_bubble_` 把 tooltip 排除掉，这样既不会跟着构建哈希失效，也不会把 tooltip 一起涂掉。
写成 `:is(A, B)` 是为了覆盖「气泡还挂了别的 class」的情况（`class="…_bubble extra"`）。

**生命周期**：这张表只在主题激活时存在。`enable()` 挂载，`disable()` / 切到其它主题 / 插件卸载都会移除，
所以普通启动的 DSH 不会莫名多出一条边。控制台可用 `__cooldark.bubbleCss` 看实际注入的内容。

要改观感只动 `BUBBLE` 这几个原子值：

| 键 | 当前值 | 说明 |
|---|---|---|
| `fill` | `rgba(30, 144, 255, 0.25)` | `#1E90FF` 25%，走 `--dsw-specific-bubble`；叠在画布上 ≈ `#1f3e5f` |
| `border` | `rgba(255, 255, 255, 0.4)` | 40% 白描边；叠在气泡底上 ≈ `#798b9f`（3.1:1） |
| `borderWidth` | `1` | px |
| `ink` | `#ffffff` | 气泡内文字，**11.0:1**。主题的 `#dcdcdc` 在 `#1f3e5f` 上是 8.0:1，留白更稳 |
| `codeFill` | `null` | 气泡内代码底。`null` = 围栏块沿用 `CODE.block #121212`（对蓝底 1.71:1，一块明显的深色内嵌）、行内代码沿用 `#363636`（1.1:1） |
| `link` | `#d6ecff` | 气泡内链接，**9.1:1**；全局钴蓝 `#2288ee` 只有 3.1:1，雾蓝 4.7:1，都会闷 |

**半透明底和半透明描边都必须按合成后的颜色算对比度**，不能拿 rgba 的字面值算 —— 测试里就是这么做的：
`fill` 先叠到 `SURFACE.canvas` 上得出真实观感色，`border` 再叠到气泡底上得出真实描边色。

`dev/smoke.mjs` 有 12 条断言锁住观感：文字对比 ≥7:1（实测 11.0:1）、描边合成后必须比气泡底更亮、
且对比 ≥1.15:1（实测 3.1:1）、链接对比 ≥4.5:1（实测 9.1:1）、
叠色后蓝通道仍明显高于红通道（`b-r = 90`）、气泡底与画布可区分、
合成后偏亮的底色**必须**显式钉住 `ink`（不能留 `null` 吃主题正文色）、
`ink` / `link` 一旦设了就必须真的写进样式表（防 mapping 断裂）、
以及选择器必须命中三个气泡类名却不命中 tooltip。
**把 `fill` 改浅却不改 `ink`、把描边调到看不见、或把透明度调到看不出蓝，都会先在这里报错。**

## 输入框焦点光晕

输入框（官方叫 **composer**）卡片聚焦时加一圈白色光晕 —— 也是注入 CSS，因为 token 表达不了。

官方的卡片样式是：

```css
._GRgSLq_card {                     /* 元素上带 data-composer-card */
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-elevation-soft);   /* 只有一层立面阴影，没有焦点态 */
  border-radius: var(--dsw-radius-panel);
}
```

官方对所有**按钮类**元素都给了 `:focus-visible` 的 `outline`（`--dsw-focus-ring-color` 默认是业务蓝），
但输入卡片本身没有焦点反馈 —— 所以这里补一条：

```css
body [data-composer-card] {
  transition: box-shadow 140ms ease;
}
body [data-composer-card]:focus-within {
  box-shadow: var(--dsw-elevation-soft),   /* ← 原有立面，必须留着 */
              0 0 0 1px #ffffff4d,          /* 1px 亮边 */
              0 0 32px #ffffff29;           /* 外围泛光 */
}
```

**为什么用 `data-composer-card` 而不是类名**：类名是 `_GRgSLq_card` 这种 CSS Modules 哈希，每次构建都变；
`data-composer-card` 是应用自己打的属性，稳定。同理输入区还有 `data-composer-seat` / `-stack` / `-input` / `-dock`。

**为什么用 `:focus-within` 而不是 `:focus`**：光标落在里面的 contenteditable（`data-composer-input`）上，
不是落在卡片上；`:focus` 永远不触发。`:focus-within` 覆盖整张卡片，点工具栏按钮时也不会闪掉。

**为什么要把 `var(--dsw-elevation-soft)` 写在最前面**：直接写 `box-shadow: 0 0 0 1px …` 会把官方那层立面
**替换**掉，聚焦瞬间卡片像被拍平了。叠加而不是替换，才只是"多了一圈光"。

要调就动 `FOCUS` 这几个原子：

| 键 | 当前值 | 说明 |
|---|---|---|
| `glow` | `WHITE` | 光晕颜色。中性白，不会把气泡那套蓝带进界面 |
| `ringAlpha` | `0.3` | 1px 亮边的白透明度（`#ffffff4d`） |
| `haloAlpha` | `0.16` | 外围泛光的白透明度（`#ffffff29`） |
| `haloBlur` | `32` | px，泛光半径 |
| `transition` | `140` | ms，淡入时长 |

**想调大光晕先动 `haloBlur`，别急着加 alpha**：半径决定"铺开多远"，alpha 只决定"多浓"。
早先是 `18px / 0.1`，看起来像一圈薄雾；现在是 `32px / 0.16`，明显张开一圈但仍不到糊的程度。
alpha 过了 ~0.2 卡片就开始发灰，而且会被下面的断言拦（泛光不许比亮边更浓）。

两个 alpha 都设成 `null` 就把光晕整条撤掉，卡片回到官方那层纯立面阴影。测试会拦住三件事：
规则必须挂在 `data-composer-card` 上（不许用哈希类名）、`--dsw-elevation-soft` 必须排在第一个、
以及**泛光不能比亮边更浓**（否则卡片糊成一团）。

## Markdown 排版

官方把 markdown 的**字号体系**完整做成了 token（102 个 `--dsw-font-markdown-*`），但**颜色没有**——
每一级标题都只是继承 `--dsw-alias-label-primary`。所以这两件事要分开处理。

### 字号：纯 token，不用写 CSS（但由设置面板驱动）

| 元素 | token | 正文 20px 时的实际值 |
|---|---|---|
| h1 | `--dsw-font-markdown-h1` | 700 · 27px / 36 |
| h2 | `--dsw-font-markdown-h2` | 700 · 25px / 34 |
| h3 | `--dsw-font-markdown-h3` | 700 · 24px / 32 |
| h4 | `--dsw-font-markdown-h4` | 600 · 20px / 30 |
| h5 / h6 | `--dsw-font-markdown-base-strong` | 600 · 20px / 30（**共用**） |
| 正文 / 段落 | `--dsw-font-markdown-base` | 20px / 30 |
| 内联代码 | `--dsw-font-markdown-code` | 13px / 20 |
| 围栏代码块 | `--dsw-font-markdown-code-block` | 12px / 20 |

这些值里带 `calc(... + var(--dsh-content-font-delta))`，而 delta 就是「正文字号 − 14px」。
所以在设置里改正文字号时标题会**整组跟着缩放**，不用逐级手调 —— 这也是为什么 20px 正文下
h1 是 27px 而不是默认的 21px。（本插件不写这个字号，见「字号」。）

**坑**：官方规则写的是 `font: var(--dsw-font-markdown-h1)` 这种 shorthand，要改必须覆盖**整个变量**。
只改 `--dsw-font-markdown-h1-font-size` 是无效的，shorthand 里写死了 calc 值。

### 颜色：只能注入 CSS

`MARKDOWN` 原子 + `buildMarkdownCss()`，产物落在同一张注入表里：

| 级别 | 颜色 | 对画布 `#1f232a` | 说明 |
|---|---|---|---|
| h1 | `#DC143C` | 3.2:1 | 深红，四级里最暗的一个 |
| h2 | `#FF4500` | 4.6:1 | 橙红 |
| h3 | `#FF8C00` | 6.8:1 | 橙 |
| h4 | `#FFFF00` | 14.7:1 | 亮黄，最跳 |
| h5 / h6 | `null` | 用主题正文 `#dcdcdc` | 刻意留白，h5/h6 不该比 h4 抢眼 |

**链接**走的是 token，不是注入 CSS：`ACCENT.link = #2288ee` → `--dsw-alias-link`，对画布 **4.4:1**（差 0.1 没到 AA 的 4.5，见下方提醒）。
它和强调色 `ACCENT.base`（雾蓝，按钮/聚焦环用）**刻意分开**，正文里的链接才不会和界面元素混在一起。

**列表 marker**（`::marker`）是列表里唯一能单独上色的部分：

| 列表 | 原子 | 颜色 | 对画布 |
|---|---|---|---|
| 无序 | `MARKDOWN.markerBullet` | `#228B22` 森林绿 | 3.6:1 |
| 有序 | `MARKDOWN.markerOrdered` | `#FF1493` 深粉 | 4.3:1 |

marker 是非文字图形，门槛是 3:1（WCAG 1.4.11），两个都过。用 `ul > li::marker` / `ol > li::marker`
**各一条规则** —— 共用一个 `li::marker` 就没法区分两种列表了。

**粗体**（`strong`，顺带覆盖原始 HTML 的 `<b>`）：

| 原子 | 颜色 | 对画布 `#1f232a` | 对气泡底 `#1f3e5f` |
|---|---|---|---|
| `MARKDOWN.strong` | `#00CED1` 深青松石 | **8.1:1** | **5.6:1** |

粗体是正文字号，门槛按 4.5:1 算，两边都过。深青是冷色、饱和度高，和上面那组暖色标题（红橙黄）在色相上
完全分开 —— 「有强调」不只靠 600 的字重，还靠颜色。原来只靠字重在 20px 正文里其实不太显。

和其它 markdown 色不同，**它不需要气泡内的回退**：深红 h1 在蓝气泡上只有 2.2:1，但深青有 5.6:1，
所以样式表里没有针对气泡的 `strong` 覆盖 —— 用户消息里的粗体照样是深青色。测试会盯着这一点，
谁把 `strong` 加进回退列表就会红。

**正文里的数字改不了颜色**：数字是文本节点，没有元素包裹，CSS 选不中「只有数字」的那一段。
唯一例外就是有序列表的序号，因为它落在 `::marker` 里。

选择器分两种：

- 标题：`body :is([class*="_markdown_"]):has(:is(h1,…,h6))`
- 列表 marker：`body :is([class*="_markdown_"])` —— **不带 `:has()`**，否则没有标题的文档会连列表符号一起丢掉

类名是 `_markdown_1ypvv_5`，哈希每次构建都变，所以只匹配前缀。标题规则里 **`:has()` 不能省** ——
`.md 文件图标` 也带一个 `_markdown_1wejo_28` 类，靠「必须真有标题子元素」才把它排除掉；
marker 规则不需要这层保险，因为图标里不可能有 `li`。

**compact 变体不受影响**（小卡片 / 文件提及里的密集排版）：同一个元素还会带 `_compact_1ypvv_331`，
官方用 `._markdown_._compact_ li::marker { color: inherit }`（特异性 `(0,2,2)`）把这些装饰全关掉，
比本主题的 `(0,1,4)` 高。这是**刻意留着**的 —— 密集排版里塞五色标题和彩色 marker 只会更乱。
真要连那里一起上色，得把选择器提权到 `(0,2,x)` 以上。

### 改不了的部分（官方硬编码，本主题故意不动）

- `strong { font-weight: 600 }` —— 粗体**粗细**（颜色归 `MARKDOWN.strong`，已接管）
- 标题 margin（h1–h3 `32px 0 16px`，h4–h6 `16px 0`）、段落 `16px 0`、列表缩进 `18px`
- 内联代码 `padding: 0 5px`、`border: .5px solid`、`border-radius: var(--dsw-radius-sm)`（后者是全局 token，
  改它会连按钮一起变）

要动这些就往 `buildMarkdownCss()` 里补规则，注意特异性别低于 `(0,1,2)`。

`dev/smoke.mjs` 在 markdown 这一块有 24 条断言：每级标题必须真的写出色值、对比 ≥3:1（大字号门槛）、
标成 `null` 的级别**不得**输出任何颜色规则、标题选择器必须带 `:has()`、
marker 规则**必须不带** `:has()`（否则无标题文档丢符号）、两种列表各一条规则且对比 ≥3:1、
粗体必须同时命中 `strong` 与 `b` 且对画布/气泡底都 ≥4.5:1、气泡回退里**不许**出现 `strong`、
以及**气泡内的标题与 marker 要退回气泡墨色**——深红叠在蓝气泡上只有 2.2:1，
绿 marker 只有 2.5:1，不覆盖等于让用户消息里的标题和列表符号消失。

链接另有两条：`--dsw-alias-link` 必须映射到 `ACCENT.link`，且对画布 ≥4.2:1（硬底线）；
不足 4.5 时只打印一行 note 而不判失败 —— 当前 `#2288ee` 对新画布 `#1f232a` 是 **4.4:1**，
差 0.1 肉眼无感，但换成 `#2590f2` 就能到 4.8:1。

### 代码块那三层底色叫什么

改代码块之前先分清三个 token，它们各自管一块：

| 官方 token | 元素（CSS Modules 本地名） | 默认取值 | 管什么 |
|---|---|---|---|
| `--dsw-alias-markdown-code-block-banner` | `_banner_7gxqk_24`（外层 `_bannerWrap_` 是 `position:sticky`） | `CODE.banner` | 代码块**顶部那条语言条**：显示 `python` / `js` 的标签 + 复制按钮 |
| `--dsw-alias-markdown-code-block` | `md-code-block` / `_block_7gxqk_4` | `CODE.block` | 代码块**正文底色** |
| `--dsw-alias-markdown-inline-code` | `:not(pre) > code` | `SURFACE.raised3` | 行内代码小胶囊 |
| `--dsw-alias-label-tertiary` | `_language_1pq26_30`、`_title_1pq26_36` | `INK.secondary`（**只在 banner 内**重新声明） | 语言名、文件标题——条子上那两行小字 |

语言条的名字就是 **banner**（官方 CSS 里 `--dsl-code-block-banner-background-color` 也指同一处）；
它包在 `_bannerWrap_` 里并且 `position:sticky; top:0`，所以长代码块往下滚时那条语言标签不会跑掉。
语言名本身单独有个类 `_language_1pq26_30`，颜色取 `--dsw-alias-label-tertiary`，**没有独立 token**。
这两个类名都带构建哈希（`_language_1pq26_30` / `_title_1pq26_36`），**不能直接选**——
所以主题改的是「在 banner 元素上重新声明这个别名」：

```css
body [data-code-block-banner] { --dsw-alias-label-tertiary: #a3a3a3; }
```

别名声明会往下继承到那两个子元素，条子外面一点都受影响不到，而且换构建也不会失效。

### 为什么光改 token 看不出变化（0.4.5）

改完 `CODE.banner` 后「**看着没变**」是真实发生过的事故，原因有两层：

1. **`#2a2a2a` → `#24262b` 只有 6/255 的差**（约 1.02:1），肉眼基本无感。想验证只能量像素：
   截图后取语言条一行和代码正文一行比 RGB —— 当时的结论是两者**完全相等**。
   （现在不会相等了：条 `#2e3139` vs 正文 `#121212`，差约 28/255。）
2. **token 只是链条中的一环**。官方实际是这么用的：

   ```css
   ._block_7gxqk_4  { --dsl-code-block-banner-background-color: var(--dsw-alias-markdown-code-block-banner); }
   ._bannerWrap_7gxqk_24 { background-color: var(--dsw-alias-bg-base); }  /* ← 拿画布色当遮罩 */
   ._banner_7gxqk_24 { background: var(--dsl-code-block-banner-background-color); }
   ```

   sticky 包裹层刷的是 **画布色**，一旦它露出一丝边就是画布色而不是 banner 色；而 `background`
   简写只要在层叠里靠后就能压过 token。

所以 0.4.5 起除了写 token，还**额外注入一条规则**，用两个与哈希无关的钩子同时刷包裹层和 banner：

```css
body .md-code-block > :has(> [data-code-block-banner]),
body [data-code-block-banner] { background-color: #2e3139; }
```

- `.md-code-block` 是全局类名（不带哈希），`[data-code-block-banner]` 是应用自己打的属性
  （官方 compact 变体也用 `> :has(> [data-code-block-banner])` 选它），所以换构建不会失效。
- 只写 `background-color` 而不是 `background`：包裹层还肩负 `position:sticky` 和圆角，
  简写会把它自己的其它背景层一起重置。
- 代价是这条规则会**盖过 token**：以后要改语言条颜色，改 `CODE.banner`（两处一起变），
  不要只改 token；把 `CODE.banner` 设为 `null` 才会退回纯 token 模式。

### 现在的取值：条子抬出井外（0.4.7 / 0.4.8）

0.4.4 曾把 `CODE.banner` 设成与 `CODE.block` **完全相同**的 `#24262b`，结果就是「条和正文一模一样」——
一个像素都分不出来（实测截图整块 y232–y412 全是 `(37,38,43)`）。同色是"无缝"，但看起来更像**没生效**。
0.4.7 先把条子抬两档，0.4.8 又把**井本身挖深**（`#24262b` → `#121212`），条子留在 `#2e3139`，于是两者彻底分家：

| 角色 | 值 | 对画布 `#1f232a` | 对代码块底 |
|---|---|---|---|
| `block`（正文） | `#121212` | 1.19:1（明显的井） | 1.00:1（基准） |
| **`banner`**（语言条） | **`#2e3139`** | 1.21:1 | **1.44:1** |

`dev/smoke.mjs` 里加了闸门：`banner / block` 的对比度必须落在 **1.25–1.6** 之间——
低于 1.25 就退回"看不见"的老坑，高于 1.6 就比代码本身还抢眼。

想把条子调亮或调暗，只动 `CODE.banner`，别动 `block` —— 井的深浅由 `block` 一个人说了算。

### 条子上的小字（0.4.9）

条子抬起来就带出一个副作用：语言名 / 文件标题用的 `--dsw-alias-label-tertiary`（`#808080`）在这条上只有 **3.3:1**
（井还浅的时候是 3.8:1）。11px 的字，这个对比度确实糊。
0.4.9 起在 banner 上重新声明这个别名为 `INK.secondary`（`#a3a3a3`）→ **5.2:1**，正好够 AA。

`dev/smoke.mjs` 里这条不再是 note，而是**硬断言**：从注入的 CSS 里揪出 `--dsw-alias-label-tertiary`
的实际取值，跟 `CODE.banner` 算对比度，低于 4.5 直接 FAIL —— 以后再改条子颜色，标签糊了会当场报出来。

## 字号：不归主题管（0.4.0 起删除接管）

字号是**设置项**，不是配色：`设置 → 通用 → 字体大小`，由 `ui-theme` 设置命名空间落盘。
主题只负责颜色和装饰。

0.3.7 及以前本插件会接管字号：`enable()` 时记下原值，然后写死 20px。后果是**你在设置里挑的 18px，
会在重启 / 重新启用 / 切回主题之后被悄悄拉回 20** —— 一个配色主题没理由覆盖用户的字号选择。
所以这段逻辑（`BODY_FONT_SIZE`、baseline 记忆、`__cooldark.fontSize()`）整体删掉了。

| | 配色 | 字号 |
|---|---|---|
| 归属 | 本插件 | 设置面板 |
| 承载方式 | `--dsw-alias-*` token | `ui-theme` 设置命名空间 |
| 写入接口 | `theme.register({ tokens })` | `theme.setFontSize(role, px)`（**本插件不再调用**） |
| 持久化 | 否（第三方主题每次启动自应用） | 是，设置面板负责 |

`text` / `code` / `terminal` 三个 role 的范围（走设置面板改，别写进主题）：
`text` 10–22、`code` 10–16、`terminal` 10–20；越界或小数会被设置层直接拒绝。

`dev/smoke.mjs` 现在**反过来锁**这条边界，共 10 条：三个 role 都不得变、`__cooldark` 上不许有
`fontSize`、`disable()` 不许写回任何东西、旧键 `softdark:font-baseline` 必须在挂载时被清掉、
以及「设置里选的 18px 要能活过 enable() / disable()」——最后这条就是 0.3.7 的 bug 本体。

## 排查：启用了但主题没变

这是本插件踩过的**真实坑**，按顺序走一遍。

**第一嫌疑：`package.json` 的 `exports` 漏了子路径。**

`exports` 一旦存在就是**封装边界**——没列出的子路径一律返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`，
包括 `./cordis.patch.yml`。而 DSH 是通过**模块解析**去读 bundle patch 的，解析失败 → patch 被静默跳过 →
Loader 里没有插件行 → `dsh-client-modules` 只扫描已启用的 Loader 行来收集浏览器产物 → **client.js 从未被加载**。
全程不报错，就是不生效。

```
node dev/verify-manifest.mjs     # 应该全 ok；有 FAIL 就先修清单
```

必须导出的子路径：

| 子路径 | 少了会怎样 |
|---|---|
| `.` | Host 半边加载不了 |
| `./client` | 浏览器产物收集不到，主题永不注册 |
| `./cordis.patch.yml` | **patch 读不到，Loader 无行，一切静默失效** |
| `./package.json` | 元数据 / `dsh.*` 声明读不到 |
| `./icon` | 插件面板显示默认图 |

**第二嫌疑：`dsh.profile.bundles` 改了但没重新 compose。**

插件市场在 `.dsh-market/hot-1.yml` 里留了兜底行（`name` 是 `file:///…/index.js`）。它只挂 Host 半边，
`name` 不是包名，扫描器按包名找不到 `dsh.client` —— 于是插件行亮着、什么也不发生。

判断方法：`.dsh-market/log.ndjson` 里出现

```
"@local/cooldark: no loader entry matched"
"@local/cooldark: re-added to dsh.profile.bundles, which nothing was composing (#696)"
```

就是这套症状。**热开关不会重新组合 bundle**，必须彻底退出进程再启动（托盘图标也要退，刷新页面不够）。
修好 `exports` 后把 `hot-1.yml` 清成 `[]`，重启后市场就会改走 bundle 路径。

**第三嫌疑：插件被市场关过又开回来，浏览器端没跟上。**

客户端模块清单是**页面加载时一次性下发**的（HTML 里那串 `plugins/??a/client.js,b/client.js`）。
市场「关 → 开」只把 Host 行热挂载回来，**不会补发 client 模块**，所以看起来「已启用、主题没变」。

判断方法：`node dev/smoke.mjs` 全绿、`--dump-config` 里能看到 `- id: cooldark`，
但界面没变 → 按 `Ctrl+R` 刷新页面（或重启），让它重新生成清单。

**第四嫌疑（0.4.6 修掉的）：偏好被重放，插件误判成"用户切走了"。**

`cordis.patch.yml` 里 `ui-theme` 那行带着 `preference: dark`。插件行被重载（市场关/开、版本变更、loader 重组）
时这段配置会**重放一次**，于是 `theme/change` 送来一个「内置 dark」——旧逻辑把它当成"用户在设置里切走了"，
当场 `optedOut = true`，整场会话都不再应用；插件行却依旧显示已启用，看起来就是**整个插件失效**。

0.4.6 起：`setTheme` 之后 5 秒内出现的外来偏好变更被判定为「loader 重放」而非用户选择，
**有预算地重申**（最多 2 次），超出预算或超出时间窗才认输 —— 不会和你反复抢。

**第五嫌疑（0.4.10 修掉的）：在【设置】里改了一下代码字体大小，主题就没了。**

这个比第四嫌疑更隐蔽：它和「多久之前启用的」完全无关，只和「你是不是动了设置」有关。

`ThemeRuntime` 对自己的设置命名空间订阅了一次：

```js
ctx.effect(() => host.subscribe(() => this.adopt()), 'ui-theme: settings scope adoption');
```

`adopt()` 的最后一步是无条件的：

```js
this.preference = section.preference;   // ← 持久化的那个值
```

而**第三方主题 id 永远不落盘**（`setTheme` 只给 `light`/`dark`/`system` 写设置），
所以持久值仍是 `dark`。于是你在设置里把「代码字体」从 11px 调到 12px：

1. `setFontSize()` → `write()` → `finally` → `adopt()`；
2. `adopt()` 把 preference 从 `cooldark` 覆盖成持久值 `dark`；
3. `publish()` 发 `theme/change`，插件看到一个「外来偏好」，5 秒窗口早就过了 → 认命退出。

**修法**：`adopt()` 无法区分「用户选了 dark」和「设置写入把 dark 抄回来」，但**字体字段可以**：
`fontSizes` / `fontFamilies` 和偏好同一个命名空间，只有在那里写入才会变，而**真的选主题不会碰字体**。
所以判定规则是——

| 收到的快照 | 判定 | 动作 |
|---|---|---|
| preference 变了，**字体没变** | 用户在设置里选了别的主题 | 尊重，退出 |
| preference 变了，**字体也变了** | `adopt()` 抄回了持久值 | 重申，**不限时间、不设预算** |

重申不会写设置（第三方 id 不落盘），所以不会反过来再触发 `adopt()`，不存在来回拉锯。
代价是改字号后主题会**闪一下**（先掉回 dark 再回来），一帧的事。

`window.__cooldark.lastReassert` 记录最近一次重申的原因（`settings` / `boot`），
`__cooldark.reasserts` 是累计次数 —— 再怀疑"是不是又被抄回去了"就看这两个。

### 三条一秒钟就能看清状态的线索

怀疑「没生效」时不用猜，界面里就有三处可以直接看：

| 看什么 | 怎么看 | 说明 |
|---|---|---|
| 模块有没有跑 | DevTools Console 里 `window.__cooldark` | `undefined` = client 半边没加载（第一~第三嫌疑）；有对象 = 加载了 |
| 主题有没有应用 | 看 `<html data-cooldark="on">` | 有属性 = 正在生效；没有 = 已应用过但被切走 |
| 样式表有没有挂上 | Elements 里搜 `#cooldark-bubble` | 存在 = 注入成功 |

而且既然模块在，**不用重启也能救回来**：Console 里敲

```js
__cooldark.enable()
```

它等价于点一次「启用」：重新 `setTheme` + 重新挂样式表。

万一真出错，0.4.6 起 `apply()` 会先 `console.error('[cooldark] apply() failed — theme not applied:', error)`
再把异常抛回去，让 loader 把插件行标成失败 —— 不再有「行是亮的、什么也不发生、也没日志」的静默死亡。

### 0.3.2 修复的那次事故：localStorage 里的 `softdark:opt-out`

**症状**：插件面板显示已启用、loader 行 `fiber=true`、client 模块也在下发清单里，
但主题就是不生效。`localStorage` 里躺着 `softdark:opt-out = 1`。

**成因**：0.3.1 及之前的「用户切走了」标记是**持久化**的。市场「关闭 → 重新启用」会重新加载
这个模块，却不会动 `localStorage`。于是旧标记活过了重新启用，`if (AUTO_APPLY && !memory.optedOut())`
直接跳过，插件安静地什么也不做——**没有任何报错**。

**修法**：改成内存变量。判断依据是「loader 行才是真正的开关」：行禁用 → 插件整个不运行；
行启用 → 用户就是想用它。所以这个标记只需活到模块重载为止。旧的持久键在每次挂载时主动清掉
（`memory.forgetLegacyOptOut()`），老安装也不会再被它挡住。

**教训**：凡是「跨重载还活着、又能否决当前行为」的标记，都要先问一句
「用户重新启用时，它还该生效吗？」——多数情况下答案是「不该」。

**第四嫌疑：改了代码但旧进程还在跑。**

检查进程启动时间是否晚于你最后一次改文件：

```powershell
Get-Process | ? ProcessName -match 'DeepSeek' | Select ProcessName, Id, StartTime
```

顺带一条排查命令：`profile` 的组合结果可以离线导出，不用开界面——

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
& 'C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe' `
  'C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js' `
  --profile <名字> --dump-config
```

输出里搜 `# == @local/cooldark`：出现就说明 bundle 层认到了这个包；不出现就还在上一类问题里。
（桌面自带的 `desktop` profile 被 Electron 独占，会被拒绝——复制一份 profile 或换个 profile 名即可。）

## 验证 / 调试

- 生效后 `document.body` 的行内样式里应出现 86 个 `--dsw-alias-*`（另有 `--dsw-specific-sidebar-fill`、
  `--dsw-specific-bubble` 两个），`<head>` 里多出一个 `<style id="cooldark-bubble">`。
- 主题**不会**改动设置 →「通用」→ 字体大小；那里显示什么，就是用户自己选的什么。
- 本地先跑一遍 `node dev/smoke.mjs`：全部 ok 再装，能挡掉语法、注册流程、字号误写与气泡选择器的低级错误（不校验观感）。
- `node dev/smoke.mjs --css` 会把**实际注入的整张样式表**打出来，改完选择器想立刻看结果就用这个。
- 控制台句柄：`__cooldark.enable()` / `__cooldark.disable()` / `__cooldark.active` /
  `__cooldark.palette` / `__cooldark.tokens` / `__cooldark.css`。句柄随插件卸载自动移除，不会污染全局。
- 插件禁用后 `body` 上的这些行内样式会被布局层撤掉，主题自动回退。

## 已知限制（脚手架阶段的实话）

1. **没有主题选择器入口**：内置「外观」行只有 light / dark / system 三个方块，不列已注册的第三方 id。
   所以当前靠「装载即启用」+ `__cooldark.enable()` 切换；下一步是注册一行 `settings.general.item` 放开关。
2. **配色不跨重启持久**：`setTheme()` 只对三个内置 id 写设置，所以第三方主题必须每次启动自己重新应用。
   「用户切走了」只记在**内存**里（0.3.2 起），不落盘——落盘会导致「插件已启用、主题却不生效」，
   详见下方「0.3.2 修复的那次事故」。（字号不在此列：它由设置面板持久化，本主题从不写它。）
3. **外观行会误显示 System 选中**：第三方主题激活时 preference 仍是 `system`，那个方块的高亮与实际不符。
4. **只动颜色与装饰**（token + 少量注入 CSS），不动字号、字体族、圆角。字号归设置面板；
   字体族与 `--dsw-radius-*` 也仍走内置设置。主题不应该替用户决定尺度。
5. **气泡描边依赖类名约定**。token 表达不了 `border`，所以那段 CSS 靠 `[class$="_bubble"]` 这种
   基于 CSS Modules 命名规律的属性选择器定位元素。DSH 若把该模块的 local 名改掉（不再叫 `bubble`），
   描边会**静默失效**（背景仍是 token，所以不会跟着坏）。升级 DSH 后如果描边消失，先查这一点。
6. 只面向 Web UI（`platform: web`），桌面端渲染的就是同一套 Web UI，因此同样生效。

## 下一步（v0.4 待办）

- [ ] 在 `settings.general.item` 注册「CoolDark」开关行（含中英文案，走 Client locale 服务）
- [ ] 拆出 `PALETTE` 的浅色变体，做 `cooldark-light`
- [ ] 补一版 `overrideTokens()` 叠层模式，允许在不切主题的情况下微调单个 token
- [x] ~~字号也做成主题的一部分~~ —— 决定**不做**：字号归设置面板，主题只做颜色与装饰
- [ ] 缩略图 / 色卡预览，便于在插件市场展示

## 参考

- `@deepseek-ai/dsh-client-ui-theme` 包内 `README.zh.md`（主题、字号、字体与 token 样式表的权威说明）
- `cordis-plugin-development` skill 的 `references/host-plugin.md`、`references/ui-plugin.md`（bundle 格式与 Client 模块约定）
- `docs/dark-tokens.md`（本仓库内的 token 对照表）
