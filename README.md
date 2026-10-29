# CoolDark

<img src="assets/icon-180.png" width="88" align="right" alt="CoolDark">

给 **DSH**（DeepSeek Harness）用的低对比度深色主题。

不纯黑、不偏暖、不刺眼——画布是中性暗灰，正文是柔和的浅灰。长时间盯对话和代码，眼睛不容易累。

## 安装

```sh
dsh plugin add github:CC-play/dsh-theme-cooldark
```

要装到指定 profile，加 `--profile`：

```sh
dsh plugin --profile desktop add github:CC-play/dsh-theme-cooldark
```

装完**完全退出 DSH 再启动**（托盘图标也要退掉），光刷新页面不够——浏览器端的插件清单只在页面加载时下发一次。

然后在「设置 → 插件」里确认它已启用。禁用即恢复官方主题，不用卸载。

## 它做了什么

- **分层底色**：画布、侧栏、浮层按 10 级暗灰色阶排开，一眼能看出层级
- **聊天气泡**：半透明 DodgerBlue 底 + 淡白描边，用户消息和正文分得开
- **代码块**：比画布更沉的黑井，顶部语言条抬出来另给一色，两者有明确分界
- **Markdown**：h1–h4 各有标题色，列表 marker 上色，粗体橄榄绿，行内代码半透明洗色
- **输入框**：聚焦时一圈柔和白光

## 它不碰的东西

**字号和字体归「设置」管**，主题不接管。你在设置面板里调多大，就是多大——改字号不会把主题弄丢，切主题也不会覆盖你的字号。

## 装了但没变化？

按顺序看：

1. **没彻底重启。** 进程退干净再开，包含托盘图标。
2. **开关过又开回来。** 市场的「关 → 开」只热挂载 Host 半边，不会补发浏览器端模块，按 `Ctrl+R` 刷新页面。
3. **`exports` 被裁剪过。** 如果你改过 `package.json` 的 `exports`，`./client` 和 `./cordis.patch.yml` 必须还在里面——少了任何一个，插件会静默失效、不报错。跑 `node dev/verify-manifest.mjs` 能查。

## 想改配色

配色分层集中在 `client.js`，最上层是命名色原子，往下是语义角色，再往下才是 token 映射——**不要往底层写死 hex**。具体结构、注入边界和一堆踩过的坑都在 [docs/development.md](docs/development.md)。

改完跑一下：

```sh
node dev/verify-manifest.mjs   # 清单自检
node dev/smoke.mjs             # 无浏览器冒烟测试
```

## 已知限制

标题栏与侧栏分色是注入 `::before` 实现的，右上角的原生窗口按钮仍跟侧栏色。

## 许可

MIT
