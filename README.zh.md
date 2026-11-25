# dsh-ui-chat-null-guard

Host 侧热修：给 `@deepseek-ai/dsh-client-ui-chat` 的 `end?.data.reason.kind` 补上可选链，避免 `conversation.view` 因 `turn/end` 的 `data`/`reason` 为 null 整窗空白。

## 背景

官方讨论：

- https://github.com/deepseek-ai/deepseek-harness/discussions/9156
- https://github.com/deepseek-ai/deepseek-harness/discussions/8832
- https://github.com/deepseek-ai/deepseek-harness/discussions/9798

至 `0.2.3-alpha.2` 仍未合入。纯 client seat 改不到闭包内的 `turnProcessAlwaysOpen`，因此用 host 插件在启动时改磁盘上的 `lib/client.js`（幂等）。

## 安装

```bash
# profile: ~/.dsh/profiles/web
# dependencies 加：
#   "dsh-ui-chat-null-guard": "github:DiDongDongDi/dsh-ui-chat-null-guard"
# bundles 数组追加 "dsh-ui-chat-null-guard"
pnpm update dsh-ui-chat-null-guard
# 重启 dsh web + 浏览器硬刷新
```

开发期可用 `file:/Users/kodyqywang/dsh-plugins-dev/dsh-ui-chat-null-guard`。

## 配置

```yaml
# cordis 可选
enabled: true   # false 时跳过补丁
```

## 卸载

从 `dependencies` / `bundles` 去掉本包 → `pnpm install` → 重启。已写入的 client.js 补丁会保留，直到下次 npx/pnpm 重装覆盖。
