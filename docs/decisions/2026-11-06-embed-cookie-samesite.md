# 嵌入 Cindy 时会话 cookie 用 `SameSite=None; Secure; Partitioned`

Status: 已裁决（QQ，MontClip#198 issuecomment-6698706427，绑定 head 894c3d5d）。更正 MontClip-Cindy#18 里 SameSite 的那一点（更正见 MontClip-Cindy#18 issuecomment-6698709526）。这只是 SameSite 的裁决，不是对 #198 的批准。

## 决定

引擎在嵌入模式（`MONTCLIP_HOST=cindy`）下发的 `montclip_embed` cookie，属性固定为：

```
Path=/; HttpOnly; SameSite=None; Secure; Partitioned
```

- 只写在一处：`embed.js` 的 `COOKIE_ATTRS`。
- `HttpOnly`、`Secure`、`Partitioned` 三个都不能去掉。
- `test/embed-server.test.js` 锁死完整字符串：`COOKIE_ATTRS` 常量和 302 响应里真实的 `Set-Cookie` 头都按整串比较。少一个、多一个或改了值，测试都失败。另有一项测试检查仓库根目录的 JS 文件里只有 `embed.js` 写这些属性。
- 要改这串属性，必须先请 QQ 审。

#18 的另外两点不变：绑定只认服务端发的 HttpOnly cookie；换绑时旧绑定失效。

## 依据：编辑器 iframe 和 Cindy 父页是跨站

- iframe 的地址是 `http://127.0.0.1:<端口>`。这来自我们自己的插件代码（MontClip-Cindy main）：`node/worker.cjs` 里 `origin` 是 `http://127.0.0.1:${port}`，页面地址是 `${origin}/?host=cindy&token=…`；`frame.js` 把它设成 iframe 的 `src`；`ghost.json` 的 `preview.hosts` 是 `["127.0.0.1"]`。
- 父页是 Cindy 的插件页，地址是 `cindy-ghost://<插件 id>/…`。
- HTML 规范里的 site 是 scheme 加可注册域，按 scheme 区分。`cindy-ghost://<插件 id>` 和 `http://127.0.0.1` 的 scheme 和主机都不同，所以是跨站。
- RFC 6265bis（draft-ietf-httpbis-rfc6265bis）判断同站请求时，拿请求 URL 的 site 和顶层及所有祖先的 site 比。跨站请求不带 `SameSite=Lax` / `Strict` 的 cookie；跨站响应里设的 `Lax` / `Strict` cookie 在存储步骤就被拒收。
- 没有豁免：Chromium 公开源码里 `ContentBrowserClient::ShouldIgnoreSameSiteCookieRestrictionsWhenTopLevel` 默认返回 `false`，Chrome 只给 `chrome://` 页开例外；Electron 公开源码（electron/electron main 分支的 `shell/browser/electron_browser_client.{h,cc}`）没有覆盖这个函数。没有逐个核对 Electron 42.x 的 tag。

详细的证据列在 PR #198 正文的「SameSite」一节。

## Strict（或 Lax）为什么行不通

跨站 iframe 里，302 设的 `Strict` / `Lax` cookie 存不进去，之后的请求也不会带上。编辑器加载后每个请求都会 403，在 Cindy 的 iframe 里用不了。只有编辑器是顶层页时（比如 headless 导出，顶层就是 `http://localhost:<端口>`）才行。

如果将来一定要 Strict，编辑器就不能放在跨站 iframe 里，比如由 Cindy 用顶层窗口打开编辑器。那是插件或 Cindy 那边的改动，不在 E1 里。

## 防跨站伪造靠什么

不靠 SameSite，靠这几样：

1. **Host 检查**（`server.js` 的 `hostAllowed`）：只放行本机 Host，挡 DNS rebinding。
2. **Origin 检查**（`server.js` 的 `requestAllowed`）：带 Origin 的请求只放行本机 Origin，挡网页对 API 的盲写。这次不放宽。以后谁要放宽 Origin 检查，比如放行 `cindy-ghost:`，必须单独请 QQ 审。
3. **HttpOnly**：页面脚本读不到 cookie。
4. **服务端签发的随机会话 id**：cookie 的值不是令牌，而是每次 `?token=` 换 cookie 时服务端新发的 64 位十六进制随机数。服务端只认自己发过的 id，手写的 cookie（包括令牌本身）得 403。
5. **会话可以单独作废**：`embed.revoke(id)` 结束一个会话，其他会话不受影响；最多记最新 64 个，再多就结束最旧的。换绑时（E5）用它让旧绑定失效。

## QQ 的 4 个条件

1. `HttpOnly`、`Secure`、`Partitioned` 三个都不能去掉；测试锁死 `COOKIE_ATTRS` 的完整字符串。落实：见「决定」一节。
2. 防跨站伪造靠 Host 检查、只放行本机 Origin、服务端发的随机会话 id。放宽 Origin 检查（比如放行 `cindy-ghost:`）必须单独请 QQ 审。落实：Host 和 Origin 检查保持现状，没有改动。
3. 插件正式发布前，要在 Cindy 实窗里测（MontClip-Cindy issue #2）：
   - iframe 里 cookie 能存上、能带上；
   - 换一个插件页（另一个 `cindy-ghost` 主机）拿不到这个 cookie；
   - 顶层直接打开 `http://127.0.0.1:<端口>` 也拿不到。

   这一项没测之前，不能写「已在 Cindy 中验证」。**状态：没跑，是发布前门槛。**
4. 这条裁决写进 ADR（更正 #18 的 SameSite 一点）。落实：就是本文。

## 还没验证的部分

- **Partitioned（CHIPS）在自定义 scheme 的顶层页里能不能用**：顶层是 `cindy-ghost:` 时，分区键在 Cindy 里是否正常工作，没有核实。#112 当时在 Cindy 里自测没测成，替代证据是用 http 父页套 iframe。要在 Cindy 实窗里实测（条件 3，MontClip-Cindy issue #2）。
- 不同插件页之间 cookie 是否真的隔离、顶层打开时是否拿不到，同样要在条件 3 的实测里确认。
