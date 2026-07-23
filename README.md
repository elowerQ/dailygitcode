# GitCode 每日签到脚本 V4.1

> 签到 + Refresh Token 自动刷新 + 每日任务全自动化 + 每日更新项目文件
> 零依赖 · 青龙面板适配 · 多账号支持 · 4 大红框任务全部攻克 ✅

## 功能概览

### V2 功能（保留）

- ✅ 自动查询签到状态，若未签到则执行签到
- ✅ 输出签到积分、本周签到奖励、当前总积分、等级等信息
- ✅ 支持多账号（环境变量用 `&` 或换行分隔）
- ✅ 支持 Refresh Token 自动刷新 access_token（最长 60 天免手动更新）
- ✅ 支持多种环境变量格式（完整 Cookie 串 / `access|refresh` 分隔 / 纯 token）
- ✅ 完善的异常处理与日志输出

### V3 功能（保留）

- ✅ **每日查看热门/推荐项目**（自动触发 task 59，+10 积分）
- ✅ **每日 Star 一个项目**（自动触发 task 62，+10 积分）
- ✅ **自动领取所有奖励**（claim-all）
- ✅ **每日任务汇总报告**
- ✅ 支持 `GITCODE_PROJECT_ID` 环境变量（多项目轮换）
- ✅ 项目接口使用 PC 浏览器 UA + 完整 Cookie（WAF Cookie）
- ✅ 签到接口使用小程序 UA（两种 UA 共存）
- ✅ WAF Cookie 缺失时自动降级（跳过查看项目/Star，仍执行文件更新和领取奖励）

### V4 新增功能

- ✅ **每日更新项目文件**（在 README.md 末尾追加签到日志）
- ✅ **文件操作三件套**：GET 文件内容 → 追加签到日志 → GET 最新 commit → POST commit 更新
- ✅ **文件操作不需要 WAF Cookie**（比 Star/查看项目更可靠）
- ✅ 新增 `GITCODE_REPO` 环境变量（`owner/repo` 格式，支持多账号）
- ✅ 每日任务流程升级：签到 → 查看项目 → Star项目 → **更新项目文件** → 领取奖励

### V4.1 新增功能

- ✅ **每日分享自动化**（自动触发 task 77，+10 积分）
- ✅ **分享接口 POST /uc/api/v1/invite/generate**（不需要 WAF Cookie）
- ✅ **4 大红框任务全部攻克！** ✅ task 59 ✅ task 62 ✅ task 77 ✅ 文件更新
- ✅ 每日任务流程升级：签到 → **分享** → 查看项目 → Star项目 → 更新项目文件 → 领取奖励

## 快速开始

### 1. 获取 Cookie

1. 浏览器打开 [gitcode.com](https://gitcode.com) 并登录
2. 按 `F12` 打开开发者工具 → `Application` → `Cookies`
3. 复制 `GITCODE_ACCESS_TOKEN` 和 `GITCODE_REFRESH_TOKEN` 的值
4. **或直接复制完整 Cookie 串**（推荐，支持每日任务）
5. 确保 Cookie 中包含 WAF Cookie（`HWWAFSESID`、`HWWAFSESTIME`、`BENSESSCC_TAG`），否则查看项目/Star 无法执行
   - **文件更新不需要 WAF Cookie**，始终可用

### 2. 配置环境变量

在青龙面板「环境变量」页面添加：

| 名称 | 必填 | 说明 |
|------|------|------|
| `GITCODE_COOKIE` | 是 | GitCode 的 Cookie / Token，支持多种格式 |
| `GITCODE_PROJECT_ID` | 否 | 用于查看/Star/GET commits 的项目 ID，默认 `10397774` |
| `GITCODE_REPO` | 否 | 要更新文件的仓库（`owner/repo` 格式），未配置则跳过文件更新 |

### 3. 添加定时任务

在青龙面板「定时任务」页面添加：

```
30 8 * * * node /path/to/gitcode_checkin.js
```

## 环境变量说明

### GITCODE_COOKIE（必填）

支持以下格式（自动识别）：

#### 格式 1：完整 Cookie 字符串（推荐）

```
uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; HWWAFSESID=...; HWWAFSESTIME=...; ...
```

- 脚本自动提取 access_token、refresh_token 和完整 Cookie 串（含 WAF Cookie）
- **唯一支持全部每日任务的格式**（查看项目/Star 需要 WAF Cookie）
- 支持 Refresh Token 自动刷新

#### 格式 2：access|refresh 分隔

```
eyJaccess...|eyJrefresh...
```

- 支持签到 + 文件更新 + 领取奖励（不需要 WAF Cookie 的功能）
- 不支持查看项目/Star（无 WAF Cookie）
- 支持 Refresh Token 自动刷新

#### 格式 3：纯 access token（旧版兼容）

```
eyJhbGci... 或 Bearer eyJhbGci...
```

- 支持签到 + 文件更新 + 领取奖励（不需要 WAF Cookie 的功能）
- 不支持查看项目/Star（无 WAF Cookie）
- 不支持自动刷新

#### 多账号

用 `&` 或换行符分隔，每个账号可用任一格式：

```
uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; HWWAFSESID=...&uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; HWWAFSESID=...
```

### GITCODE_PROJECT_ID（可选）

用于查看项目、Star、GET commits 的项目 ID，默认 `10397774`（llm-box/llm-box 项目）。

- **单个项目 ID**：`10397774`
- **多个项目 ID**（用 `&` 或换行分隔，每天轮换）：`10397774&12345678&98765432`
- **多账号时**：每个账号自动使用不同项目 ID（按天 + 账号序号轮换）
- **文件更新**：同时用于 GET commits 接口（获取最新 commit ID）

> ⚠️ 如果同时配置了 `GITCODE_REPO` 和 `GITCODE_PROJECT_ID`，请确保两者对应同一个仓库。

### GITCODE_REPO（可选，V4 新增）

要更新文件的仓库，格式为 `owner/repo`（如 `QQ111QQ/codex`）。

- **未配置时**：跳过文件更新步骤，不影响其他功能
- **文件更新不需要 WAF Cookie**：即使没有 WAF Cookie，文件更新也能正常执行
- **更新内容**：在仓库的 `README.md` 末尾追加签到日志
- **多账号**：用 `&` 或换行分隔，与 `GITCODE_COOKIE` 的多账号一一对应

#### 配置示例

```
# 单账号
GITCODE_REPO=QQ111QQ/codex

# 多账号
GITCODE_REPO=QQ111QQ/codex&WW222WW/demo
```

#### 日志格式

每次更新会在 `README.md` 末尾追加：

```markdown

## 签到日志
- 2026-07-21 08:30 自动签到
```

## 每日任务自动化

### 任务流程（V4.1）

每个账号在签到完成后，自动执行以下流程：

```
签到 → 分享(触发task 77) → 查看项目(触发task 59) → Star项目(触发task 62) → 更新项目文件 → 领取奖励(claim-all)
```

### 可自动完成的任务

| 任务 ID | 任务名称 | 触发方式 | 奖励积分 | 需要 WAF Cookie |
|---------|---------|---------|---------|----------------|
| 59 | 每日查看热门/推荐项目 | GET 项目详情接口 | +10 分 | ✅ 是 |
| 62 | 每日Star一个项目 | POST Star 项目接口 | +10 分 | ✅ 是 |
| 77 | 每日分享 | POST invite/generate 接口 | +10 分 | ❌ 否 |
| — | 每日更新项目文件 | POST commit 更新 README | — | ❌ 否 |

### 无需手动完成的任务

🎉 **V4.1 所有红框任务已全部实现自动化！** 不再需要手动操作。

### WAF Cookie 降级处理（V4 改进）

当 Cookie 字符串中不包含 WAF Cookie（`HWWAFSESID` 等）时：

| 功能 | V3 行为 | V4.1 行为 |
|------|---------|---------|
| 签到 | ✅ 正常执行 | ✅ 正常执行 |
| **每日分享（task 77）** | — | ✅ **正常执行**（不需要 WAF Cookie） |
| 查看项目（task 59） | ❌ 跳过 | ❌ 跳过 |
| Star 项目（task 62） | ❌ 跳过 | ❌ 跳过 |
| **更新项目文件** | — | ✅ **正常执行**（不需要 WAF Cookie） |
| 领取奖励（claim-all） | ❌ 跳过 | ✅ **正常执行** |

> V4.1 改进：即使没有 WAF Cookie，每日分享、文件更新和领取奖励仍然可以执行，提升了脚本的可靠性。

### 日志输出示例

```
[每日任务] 开始执行每日任务...
[每日任务] 查看任务列表...
  - task 59 (每日查看热门/推荐项目): 未完成
  - task 62 (每日Star一个项目): 未完成
  - task 77 (每日分享): 未完成

[每日分享] POST /uc/api/v1/invite/generate...
  邀请码: CM8EEH6L
[每日分享] task 77 已触发（待领取 +10 积分）

[查看项目] GET /api/v2/projects/10397774...
  项目: llm-box/llm-box
  描述: llm-box是一个开源的AI工作流编排引擎...
  Star数: 8
[查看项目] task 59 已触发（待领取 +10 积分）

[Star项目] DELETE /api/v2/projects/10397774/star...（取消旧Star）
  [Star项目] 取消Star未成功（可能项目未被Star，继续尝试Star）
[Star项目] POST /api/v2/projects/10397774/star...
  Star成功，当前 Star 数: 8
[Star项目] task 62 已触发（待领取 +10 积分）

[更新项目] 开始更新项目文件...
[更新项目] 仓库: QQ111QQ/codex
[更新项目] GET 文件内容...
  当前 README.md 内容: # codex\n\n121212
  当前 commit: fe64c8eb
[更新项目] 追加签到日志...
  新内容: # codex\n\n121212\n\n## 签到日志\n- 2026-07-21 08:30 自动签到\n
[更新项目] GET 最新 commit ID...
  last_commit_id: fe64c8ebe3fb4eacd117f76f93bf7acd367160a2
[更新项目] POST commit...
  ✅ 更新成功！
  新 commit: 9a5f903a
  commit message: chore: 每日自动签到更新 README

[领取奖励] POST /uc/api/v1/task/claim-all...
  领取结果: 成功领取奖励

[每日任务汇总]
  ✅ task 59 每日查看热门/推荐项目: +10 分
  ✅ task 62 每日Star一个项目: +10 分
  ✅ task 77 每日分享: +10 分（邀请码: CM8EEH6L）
  📝 每日更新项目文件: 已执行（仓库: QQ111QQ/codex）
  今日获得: +30 分（当前总积分: 105）
```

## 每日更新项目文件（V4 新增）

### 功能说明

每天自动在指定仓库的 `README.md` 末尾追加签到日志，通过 commit 方式更新文件。

### 技术优势

- **不需要 WAF Cookie**：文件操作接口只需要 access_token + 基本 cookie，比 Star/查看项目更可靠
- **WAF 过期也能用**：即使 WAF Cookie 已过期，文件更新仍可正常执行
- **多账号支持**：每个账号可配置不同的仓库

### 实现流程

```
1. 从环境变量获取 GITCODE_REPO（owner/repo 格式）
   └─ 未配置则跳过，输出提示

2. GET 文件内容（README.md）
   └─ URL: /api/v2/projects/{owner}%2F{repo}/repository/files?repoId={owner}%252F{repo}&ref=main&file_path=README.md
   └─ 解码 base64 内容

3. 在文件末尾追加签到日志
   └─ 格式: \n## 签到日志\n- {YYYY-MM-DD HH:mm} 自动签到\n
   └─ 如果文件末尾没有换行符，先加一个换行

4. GET 最新 commit ID
   └─ URL: /api/v2/projects/{project_id}/repository/commits?ref_name=main&per_page=1
   └─ 取 content[0].id 作为 last_commit_id（防止并发冲突）

5. POST commit 更新文件
   └─ URL: /api/v2/projects/{owner}%2F{repo}/repository/commits
   └─ 请求体含 actions（action=update, content=新内容, last_commit_id=步骤4的ID）
   └─ 响应返回新 commit 的 short_id 和 title

6. 日志输出：commit short_id、commit message
```

### URL 编码说明

文件接口的 URL 编码比较特殊，需要特别注意：

| 用途 | 编码方式 | 示例 |
|------|---------|------|
| 路径中的 owner/repo | 单次编码 `encodeURIComponent()` | `QQ111QQ%2Fcodex` |
| repoId 查询参数 | 双重编码 `encodeURIComponent(encodeURIComponent())` | `QQ111QQ%252Fcodex` |
| POST body 中的 repoId | 单次编码 | `QQ111QQ%2Fcodex` |

### 请求头

文件操作接口使用 PC UA，但**不需要 WAF Cookie**：

| 请求头 | 值 | 说明 |
|--------|-----|------|
| `Authorization` | `Bearer <access_token>` | 必须 |
| `Content-Type` | `application/json` | POST 时必须 |
| `User-Agent` | PC 浏览器 UA | 必须 |
| `Origin` | `https://gitcode.com` | 必须 |
| `Referer` | `https://gitcode.com/` | 必须 |
| `X-Platform` | `web` | POST 时必须 |
| `Cookie` | 基本 Cookie（可选） | 保险用，不需要 WAF Cookie |

### 异常处理

| 异常场景 | 处理方式 |
|---------|---------|
| `GITCODE_REPO` 未配置 | 跳过文件更新，输出提示 |
| GET 文件内容失败 | 记录错误，跳过更新 |
| GET commits 失败 | 记录错误，跳过更新（没有 last_commit_id 无法 POST） |
| POST commit 失败（400/409） | 可能是 last_commit_id 过期（并发修改），记录错误 |
| 文件更新失败 | **不阻断后续流程**（claim-all 仍执行） |

## 技术架构

### 三 UA 策略

脚本根据接口类型使用不同的 User-Agent 和 Cookie 策略：

| 接口类型 | 路径前缀 | User-Agent | Cookie | 用途 |
|---------|---------|-----------|--------|------|
| 签到接口 | `uc/api/v1/*` | 微信小程序 UA | 不需要 | 签到、用户信息、任务列表、领取奖励 |
| 项目接口 | `api/v2/*`（查看/Star） | PC 浏览器 UA | 需要（含 WAF） | 项目详情、Star、取消 Star |
| **文件接口** | `api/v2/*`（文件操作） | PC 浏览器 UA | **不需要 WAF** | **GET 文件、GET commits、POST commit** |

### Cookie 解析

`parseAuthToken` 函数从环境变量中提取：

1. **access_token**：JWT 格式，用于 Authorization 头
2. **refresh_token**：用于自动刷新 access_token
3. **cookieStr**：完整 Cookie 字符串，用于项目接口的 Cookie 头（含 WAF Cookie）

### Token 自动刷新

当 access_token 剩余有效期 < 1 小时时：

1. 使用 refresh_token 调用刷新接口
2. 获取新的 access_token（有效期约 24 小时）
3. 使用新 token 继续执行签到和每日任务
4. 刷新失败时降级使用旧 token

## 异常处理

| 异常场景 | 处理方式 |
|---------|---------|
| WAF Cookie 缺失 | 跳过查看项目/Star，仍执行文件更新和领取奖励 |
| WAF Cookie 过期 | 记录错误，继续执行其他流程 |
| 项目接口失败 | 不阻断签到流程，记录错误继续 |
| DELETE star 失败 | 忽略错误，继续尝试 POST star |
| **文件更新失败** | **不阻断后续流程**（claim-all 仍执行） |
| claim-all 失败 | 记录错误，不影响其他流程 |
| 任务查询失败 | 跳过该任务，继续下一个 |
| Token 过期 | 尝试用 refresh_token 刷新 |
| Token 刷新失败 | 降级使用旧 token 尝试签到 |
| 网络超时 | 15 秒超时，记录错误继续 |

## API 接口一览

### 签到相关接口（uc/api/v1/*）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/uc/api/v1/task/v2/sign_status` | GET | 查询签到状态 |
| `/uc/api/v1/task/sign-in` | POST | 执行签到 |
| `/uc/api/v1/user/oauth/userInfo` | GET | 查询用户信息 |
| `/uc/api/v1/user/token/refresh` | POST | 刷新 access_token |
| `/uc/api/v1/task/channel/miniprogram` | GET | 查询每日任务列表 |
| `/uc/api/v1/task/claim-all` | POST | 领取所有奖励 |
| `/uc/api/v1/invite/generate` | POST | 每日分享（触发 task 77） |

### 项目相关接口（api/v2/*）

| 接口 | 方法 | 说明 | 需要 WAF |
|------|------|------|---------|
| `/api/v2/projects/{project_id}` | GET | 项目详情（触发 task 59） | ✅ |
| `/api/v2/projects/{project_id}/star` | POST | Star 项目（触发 task 62） | ✅ |
| `/api/v2/projects/{project_id}/star` | DELETE | 取消 Star | ✅ |
| `/api/v2/projects/{owner}%2F{repo}/repository/files` | GET | 获取文件内容 | ❌ |
| `/api/v2/projects/{project_id}/repository/commits` | GET | 获取最新 commit | ❌ |
| `/api/v2/projects/{owner}%2F{repo}/repository/commits` | POST | 提交 commit 更新文件 | ❌ |

## 常见问题

### Q: 每日任务没有执行？

**A:** 查看项目和 Star 任务需要完整 Cookie 串（含 WAF Cookie）。请检查：

1. `GITCODE_COOKIE` 是否使用完整 Cookie 字符串格式
2. Cookie 中是否包含 `HWWAFSESID`、`HWWAFSESTIME`、`BENSESSCC_TAG` 等 WAF Cookie
3. 日志中是否有「未检测到 WAF Cookie」的提示

> 注意：即使没有 WAF Cookie，文件更新和领取奖励仍然可以执行。

### Q: WAF Cookie 过期了怎么办？

**A:** WAF Cookie 有效期较短（通常数小时到数天）。过期后需要：

1. 重新打开浏览器访问 gitcode.com
2. 重新复制完整 Cookie 串（包含新的 WAF Cookie）
3. 更新 `GITCODE_COOKIE` 环境变量

> 文件更新功能不受 WAF Cookie 过期影响，仍可正常使用。

### Q: 项目接口返回 403 或被 WAF 拦截？

**A:** 这是 WAF Cookie 过期或不完整的表现。请重新获取完整 Cookie 串。

> 文件更新接口不需要 WAF Cookie，不受此影响。

### Q: 签到成功但每日任务失败？

**A:** 签到接口不需要 WAF Cookie，但查看项目/Star 接口需要。请确保使用完整 Cookie 字符串格式。

### Q: Token 过期了怎么办？

**A:** 如果配置了 refresh_token（完整 Cookie 串或 `access|refresh` 格式），脚本会自动刷新。如果 refresh_token 也过期了（约 60 天），需要重新登录获取新的 Cookie。

### Q: 如何修改项目 ID？

**A:** 设置 `GITCODE_PROJECT_ID` 环境变量。默认使用 `10397774`（llm-box/llm-box 项目）。

### Q: 如何启用每日更新项目文件？

**A:** 设置 `GITCODE_REPO` 环境变量，格式为 `owner/repo`（如 `QQ111QQ/codex`）。同时确保 `GITCODE_PROJECT_ID` 对应同一个仓库。

### Q: 文件更新失败怎么办？

**A:** 文件更新失败不会阻断后续流程（领取奖励仍会执行）。常见原因：

1. **last_commit_id 过期**（HTTP 400/409）：可能有其他操作并发修改了文件，下次执行时会自动获取最新 commit ID
2. **文件不存在**：确保仓库中有 `README.md` 文件
3. **权限不足**：确保 access_token 有该仓库的写入权限

### Q: 多账号如何配置不同项目？

**A:** 设置多个项目 ID（用 `&` 或换行分隔），脚本会自动为每个账号分配不同项目。同样，`GITCODE_REPO` 也支持多账号配置。

## 文件说明

| 文件 | 说明 |
|------|------|
| `gitcode_checkin.js` | 主脚本（V4.1），零依赖，仅使用 Node.js 原生模块 |
| `README.md` | 本文档 |

## 版本历史

| 版本 | 日期 | 功能 |
|------|------|------|
| V4.1 | 2026-07-21 | 新增每日分享自动化（task 77），4 大红框任务全部攻克 |
| V4 | 2026-07-21 | 新增每日更新项目文件（不需要 WAF Cookie）；WAF 缺失时仍执行文件更新和领取奖励 |
| V3 | 2026-07-21 | 新增每日任务自动化（查看项目、Star项目、领取奖励） |
| V2 | - | 支持 Refresh Token 自动刷新 |
| V1 | - | 基础签到功能 |

## 技术约束

- **零依赖**：仅使用 Node.js 原生模块（`https`、`http`），无需 `npm install`
- **青龙面板适配**：支持 cron 注释、`new Env`、`console.log` 输出
- **多账号支持**：环境变量用 `&` 或换行分隔
- **向后兼容**：V3 的所有功能完全保留
- **双 UA 共存**：签到接口用小程序 UA，项目/文件接口用 PC UA
- **文件操作不需要 WAF Cookie**：比查看项目/Star 更可靠
- **代码风格**：Google Style，完整 JSDoc 注释
