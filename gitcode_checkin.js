/**
 * GitCode 每日签到脚本 V4.3（青龙面板版）—— 签到 + Refresh Token 刷新 + 每日任务全自动化 + 每日更新项目文件
 *
 * 功能：
 *   - 自动查询签到状态，若未签到则执行签到
 *   - 输出签到积分、本周签到奖励、当前总积分、等级等信息
 *   - 支持多账号（环境变量用 & 或换行分隔）
 *   - 支持 Refresh Token 自动刷新 access_token（最长 60 天免手动更新）
 *   - 支持多种环境变量格式（完整 Cookie 串 / access|refresh 分隔 / 纯 token）
 *   - 完善的异常处理与日志输出
 *
 * V3 功能（保留）：
 *   - 每日查看热门/推荐项目（自动触发 task 59，+10 积分）
 *   - 每日 Star 一个项目（自动触发 task 62，+10 积分）
 *   - 自动领取所有奖励（claim-all）
 *   - 每日任务汇总报告
 *   - 支持 GITCODE_PROJECT_ID 环境变量（多项目轮换）
 *   - 项目接口使用 PC 浏览器 UA + 完整 Cookie（WAF Cookie）
 *   - 签到接口使用小程序 UA（两种 UA 共存）
 *   - WAF Cookie 缺失时自动降级（跳过查看项目/Star，仍执行文件更新和领取奖励）
 *
 * V4 新增：
 *   - 每日更新项目文件（在 README.md 末尾追加签到日志）
 *   - 文件操作三件套：GET 文件内容 → 追加签到日志 → GET 最新 commit → POST commit 更新
 *   - 文件操作接口不需要 WAF Cookie（比 Star/查看项目更可靠）
 *   - 新增 GITCODE_REPO 环境变量（owner/repo 格式，支持多账号）
 *   - 每日任务流程：签到 → 查看项目 → Star项目 → 更新项目文件 → 领取奖励
 *
 * V4.1 新增：
 *   - 每日分享自动化（自动触发 task 77，+10 积分）
 *   - 分享接口 POST /uc/api/v1/invite/generate（不需要 WAF Cookie）
 *   - 4 大红框任务全部攻克！✅ task 59 ✅ task 62 ✅ task 77 ✅ 文件更新
 *
 * V4.2 新增：
 *   - 日志美化：框线风格 + emoji + 对齐排版
 *
 * V4.3 修复（重要）：
 *   - 修复 task 77 每日分享"假触发"：旧方案 invite/generate 只取回已有邀请码，
 *     不触发任务；真实触发点是行为上报 POST /api/v1/report
 *     （event_id=page_click, button_name=常规邀请_复制邀请链接_PC），已实测验证
 *   - 新增触发后验证：每个任务动作执行后重新查询任务状态，
 *     只有服务端确认触发才报"已触发 ✓"，否则提示"未触发（接口可能已变更）"
 *
 * 环境变量：
 *   GITCODE_COOKIE —— 支持以下格式（自动识别）：
 *     1. 完整 Cookie 字符串（推荐，支持每日任务 + 自动刷新）：
 *        uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; HWWAFSESID=...; ...
 *        脚本自动提取 access_token、refresh_token 和完整 Cookie 串（含 WAF Cookie）
 *     2. access|refresh 分隔：
 *        eyJaccess...|eyJrefresh...
 *     3. 纯 access token（旧版兼容）：
 *        eyJhbGci... 或 Bearer eyJhbGci...
 *     多账号用 & 或换行分隔，每个账号可用任一格式
 *
 *   GITCODE_PROJECT_ID（可选）—— 用于 Star 和查看的项目 ID，默认 10397774
 *     - 支持多个项目 ID（用 & 或换行分隔），每天轮换使用不同项目
 *     - 多账号时，每个账号自动使用不同项目 ID
 *     - 同时用于文件更新中的 GET commits 接口
 *
 *   GITCODE_REPO（可选，V4新增）—— 要更新的仓库，格式 owner/repo（如 QQ111QQ/codex）
 *     - 未配置时跳过文件更新步骤
 *     - 支持多账号（用 & 或换行分隔，与 GITCODE_COOKIE 的多账号一一对应）
 *     - 文件更新不需要 WAF Cookie，比 Star/查看项目更可靠
 *
 * 依赖：
 *   无 —— 仅使用 Node.js 原生模块（https、http），无需安装任何额外依赖
 *
 * 定时：
 *   30 8 * * *
 *
 * @author GitCode Check-in Bot
 * @version 4.3.0
 */

// cron: 30 8 * * *
// new Env('GitCode 签到');

const https = require('https');
const http = require('http');

// ============================================================
// 常量定义
// ============================================================

/** GitCode API 基础地址 */
const BASE_URL = 'https://web-api.gitcode.com';

/** GitCode 前端站点地址（用于 Origin/Referer 头） */
const GITCODE_SITE = 'https://gitcode.com';

/** 签到状态查询接口 */
const API_SIGN_STATUS = '/uc/api/v1/task/v2/sign_status';

/** 核心签到接口 */
const API_SIGN_IN = '/uc/api/v1/task/sign-in';

/** 用户信息接口 */
const API_USER_INFO = '/uc/api/v1/user/oauth/userInfo';

/** Token 刷新接口 */
const API_TOKEN_REFRESH = '/uc/api/v1/user/token/refresh';

/** 每日任务列表接口（小程序渠道） */
const API_TASK_LIST =
  '/uc/api/v1/task/channel/miniprogram?channel=miniprogram&task_level=1';

/** 领取所有奖励接口 */
const API_CLAIM_ALL = '/uc/api/v1/task/claim-all';

/** 每日分享接口（旧方案，仅取回已有邀请码，无法触发任务） */
const API_INVITE_GENERATE = '/uc/api/v1/invite/generate';

/** 行为上报接口（V4.3 新增：task 77 每日分享的真实触发点） */
const API_REPORT = '/api/v1/report?event_id=page_click';

/** task 77 触发上报的按钮名（复制邀请链接） */
const SHARE_BUTTON_NAME = '常规邀请_复制邀请链接_PC';

/** 项目接口基础路径（api/v2/projects/） */
const API_PROJECTS_BASE = '/api/v2/projects/';

/** 文件操作：仓库文件内容接口后缀（GET 文件内容） */
const API_REPO_FILES_SUFFIX = '/repository/files';

/** 文件操作：仓库 commits 接口后缀（GET commits / POST commit） */
const API_REPO_COMMITS_SUFFIX = '/repository/commits';

/** 默认分支名称 */
const DEFAULT_BRANCH = 'main';

/** 默认更新的文件路径 */
const DEFAULT_FILE_PATH = 'README.md';

/** 默认 commit 消息 */
const DEFAULT_COMMIT_MESSAGE = 'chore: 每日自动签到更新 README';

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 15000;

/** access_token 快过期阈值（小时），剩余有效期低于此值时触发刷新 */
const REFRESH_THRESHOLD_HOURS = 1;

/** 默认项目 ID（llm-box/llm-box） */
const DEFAULT_PROJECT_ID = '10397774';

/** 默认 User-Agent（模拟微信小程序环境，用于签到等 uc/api 接口） */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5_2 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ' +
  'MicroMessenger/8.0.75(0x18004b42) NetType/WIFI Language/zh_CN';

/** PC 浏览器 User-Agent（用于项目接口 api/v2，需要通过 WAF 检测） */
const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/** 默认 Referer（小程序环境） */
const DEFAULT_REFERER =
  'https://servicewechat.com/wx46c3eb96ebeface9/67/page-frame.html';

/** PC 端 Referer */
const PC_REFERER = 'https://gitcode.com/';

/** 星期名称映射 */
const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 每日任务 ID 与名称映射 */
var TASK_INFO = {
  59: { name: '每日查看热门/推荐项目', score: 10, automatable: true },
  62: { name: '每日Star一个项目', score: 10, automatable: true },
  77: { name: '每日分享', score: 10, automatable: true },
};

// ============================================================
// JWT 工具函数
// ============================================================

/**
 * 解码 JWT token 的 payload 部分，返回完整 payload 对象。
 *
 * JWT 格式：header.payload.signature
 * payload 是 base64url 编码的 JSON。
 *
 * @param {string} jwt JWT token 字符串
 * @return {Object|null} payload 对象，解析失败返回 null
 *   - sub {string} 用户名
 *   - iat {number} 签发时间（Unix 时间戳，秒）
 *   - exp {number} 过期时间（Unix 时间戳，秒）
 */
function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') {
    return null;
  }
  try {
    var parts = jwt.split('.');
    if (parts.length < 2) {
      return null;
    }
    // base64url → base64
    var payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    var padding = payloadB64.length % 4;
    if (padding > 0) {
      payloadB64 += '='.repeat(4 - padding);
    }
    var payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
    return JSON.parse(payloadJson);
  } catch (e) {
    return null;
  }
}

/**
 * 从 JWT token 的 payload 中提取用户名（sub 字段）。
 *
 * @param {string} jwt JWT token 字符串
 * @return {string} 用户名，解析失败时返回空字符串
 */
function extractUsernameFromJwt(jwt) {
  var payload = decodeJwtPayload(jwt);
  if (payload && payload.sub) {
    return payload.sub;
  }
  return '';
}

/**
 * 计算 token 的剩余有效时间（小时）。
 *
 * @param {string} jwt JWT token 字符串
 * @return {number|null} 剩余小时数；已过期返回负数；无法解析返回 null
 */
function getTokenRemainingHours(jwt) {
  var payload = decodeJwtPayload(jwt);
  if (!payload || !payload.exp) {
    return null;
  }
  var nowSec = Math.floor(Date.now() / 1000);
  var remainingSec = payload.exp - nowSec;
  return remainingSec / 3600;
}

// ============================================================
// 日期格式化工具
// ============================================================

/**
 * 将数字补齐为两位字符串（前导零）。
 *
 * @param {number} n 数字
 * @return {string} 两位字符串
 */
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * 格式化日期为 "YYYY-MM-DD HH:mm" 格式。
 *
 * @param {Date} date 日期对象
 * @return {string} 格式化后的日期字符串
 */
function formatDateTime(date) {
  var y = date.getFullYear();
  var m = pad2(date.getMonth() + 1);
  var d = pad2(date.getDate());
  var h = pad2(date.getHours());
  var min = pad2(date.getMinutes());
  return y + '-' + m + '-' + d + ' ' + h + ':' + min;
}

// ============================================================
// 认证信息解析
// ============================================================

/**
 * 解析环境变量中的认证信息，支持多种格式。
 *
 * 支持的输入格式：
 *   1. 完整 Cookie 字符串（推荐）：
 *      "uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; ..."
 *      自动提取 access_token、refresh_token 和完整 Cookie 串（含 WAF Cookie）
 *   2. access|refresh 分隔：
 *      "eyJaccess...|eyJrefresh..."
 *   3. 纯 JWT token（旧版兼容）：
 *      "eyJhbGci..." 或 "Bearer eyJhbGci..."
 *   4. Cookie 字符串中包含 Authorization=Bearer xxx（旧版兼容）：
 *      "Authorization=Bearer eyJhbGci...; other=val"
 *
 * @param {string} rawStr 原始环境变量字符串
 * @return {{accessToken: string, refreshToken: string, username: string, cookieStr: string}|null}
 *         解析结果，包含 accessToken、refreshToken（可能为空）、username 和 cookieStr
 *         cookieStr 为完整 Cookie 串（用于项目接口的 Cookie 头），非 Cookie 格式时为空
 */
function parseAuthToken(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') {
    return null;
  }

  var trimmed = rawStr.trim();
  if (trimmed.length === 0) {
    return null;
  }

  var accessToken = '';
  var refreshToken = '';
  var cookieStr = '';

  // 格式1：完整 Cookie 字符串，包含 GITCODE_ACCESS_TOKEN / GITCODE_REFRESH_TOKEN
  var accessMatch = trimmed.match(/GITCODE_ACCESS_TOKEN=([^\s;]+)/i);
  var refreshMatch = trimmed.match(/GITCODE_REFRESH_TOKEN=([^\s;]+)/i);
  if (accessMatch) {
    accessToken = accessMatch[1];
    refreshToken = refreshMatch ? refreshMatch[1] : '';
    // 完整 Cookie 串用于项目接口的 Cookie 头（含 WAF Cookie）
    cookieStr = trimmed;
  }

  // 格式2：access|refresh 分隔（竖线分隔两个 token）
  if (!accessToken && trimmed.indexOf('|') !== -1) {
    var pipeParts = trimmed.split('|');
    if (pipeParts.length >= 2) {
      var part0 = pipeParts[0].trim();
      var part1 = pipeParts[1].trim();
      // 去掉可能的 Bearer 前缀
      accessToken = stripBearerPrefix(part0);
      refreshToken = part1;
    }
  }

  // 格式3/4：Cookie 字符串中包含 Authorization=Bearer xxx
  if (!accessToken) {
    var authMatch = trimmed.match(/Authorization=Bearer\s+([^\s;]+)/i);
    if (authMatch) {
      accessToken = authMatch[1];
      // 如果看起来像 Cookie 字符串（包含 = 和 ;），保留作为 cookieStr
      if (trimmed.indexOf(';') !== -1 && trimmed.indexOf('=') !== -1) {
        cookieStr = trimmed;
      }
    }
  }

  // 格式3：Bearer xxx 或纯 JWT token
  if (!accessToken) {
    accessToken = stripBearerPrefix(trimmed);
  }

  if (!accessToken || accessToken.length < 20) {
    return null;
  }

  // 从 access_token 的 JWT payload 中提取用户名
  var username = extractUsernameFromJwt(accessToken);

  return {
    accessToken: accessToken,
    refreshToken: refreshToken || '',
    username: username,
    cookieStr: cookieStr,
  };
}

/**
 * 去掉 token 字符串的 "Bearer " 前缀（不区分大小写）。
 *
 * @param {string} str 原始字符串
 * @return {string} 去掉前缀后的 token
 */
function stripBearerPrefix(str) {
  if (!str) {
    return '';
  }
  var trimmed = str.trim();
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.substring(7).trim();
  }
  return trimmed;
}

/**
 * 将环境变量值按 & 或换行符拆分为多个条目。
 *
 * @param {string} envValue 环境变量原始值
 * @return {string[]} 拆分后的数组
 */
function splitMultiAccount(envValue) {
  if (!envValue || typeof envValue !== 'string') {
    return [];
  }
  return envValue
    .split(/[&\n]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

/**
 * 检查 Cookie 字符串中是否包含 WAF 相关 Cookie。
 *
 * WAF Cookie 包括：HWWAFSESID、HWWAFSESTIME、BENSESSCC_TAG 等。
 * 项目接口（api/v2/* 中的查看项目、Star）需要这些 Cookie 才能通过 WAF 检测。
 * 文件操作接口（GET 文件内容、GET commits、POST commit）不需要 WAF Cookie。
 *
 * @param {string} cookieStr 完整 Cookie 字符串
 * @return {boolean} 是否包含 WAF Cookie
 */
function hasWafCookie(cookieStr) {
  if (!cookieStr || cookieStr.length === 0) {
    return false;
  }
  return (
    cookieStr.indexOf('HWWAFSESID') !== -1 ||
    cookieStr.indexOf('HWWAFSESTIME') !== -1 ||
    cookieStr.indexOf('BENSESSCC_TAG') !== -1
  );
}

// ============================================================
// 请求头构建
// ============================================================

/**
 * 构建签到接口的请求 headers（小程序环境）。
 *
 * 用于 uc/api/v1/* 路径下的接口（签到、用户信息、任务列表、领取奖励等）。
 *
 * @param {string} token Bearer token（access_token）
 * @param {string} username 用户名
 * @return {Object} headers 对象
 */
function buildHeaders(token, username) {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
    'X-Device-Type': 'ios',
    'X-OS-Version': '26.5.2',
    'X-Platform': 'miniprogram',
    'X-Network-Type': 'wifi',
    'X-Username': username || 'unknown',
    'X-App-Channel': 'miniprogram',
    'X-App-Version': '1.1.41',
    'X-Device-ID': 'miniprogram-' + Math.random().toString(36).substring(2, 42),
    'User-Agent': DEFAULT_USER_AGENT,
    'Referer': DEFAULT_REFERER,
    'Origin': BASE_URL,
  };
}

/**
 * 构建项目接口的请求 headers（PC 浏览器环境）。
 *
 * 用于 api/v2/* 路径下的接口（项目详情、Star、取消 Star 等）。
 * 必须包含完整 Cookie 串（含 WAF Cookie）才能通过 WAF 检测。
 *
 * @param {string} token Bearer token（access_token，JWT 格式）
 * @param {string} cookieStr 完整 Cookie 字符串（含 WAF Cookie）
 * @param {string} username 用户名
 * @return {Object} headers 对象
 */
function buildProjectHeaders(token, cookieStr, username) {
  return {
    'Authorization': 'Bearer ' + token,
    'Cookie': cookieStr || '',
    'User-Agent': PC_USER_AGENT,
    'Referer': PC_REFERER,
    'Origin': GITCODE_SITE,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'X-Username': username || 'unknown',
  };
}

/**
 * 构建文件操作接口的请求 headers（PC 浏览器环境）。
 *
 * 用于 api/v2/* 路径下的文件操作接口（GET 文件内容、GET commits、POST commit）。
 *
 * ⚠️ 与 buildProjectHeaders 的关键区别：
 *   - 不需要 WAF Cookie！只需要 access_token + 基本 cookie（uuid_tt_dd 等）作为保险
 *   - 包含 Content-Type: application/json（POST commit 需要）
 *   - 包含 X-Platform: web（POST commit 需要）
 *   - 比查看项目/Star 接口更可靠
 *
 * @param {string} token Bearer token（access_token，JWT 格式）
 * @param {string} cookieStr 完整 Cookie 字符串（可选，作为保险，不需要 WAF Cookie）
 * @param {string} username 用户名
 * @return {Object} headers 对象
 */
function buildFileHeaders(token, cookieStr, username) {
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'User-Agent': PC_USER_AGENT,
    'Referer': PC_REFERER,
    'Origin': GITCODE_SITE,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'X-Platform': 'web',
    'X-Username': username || 'unknown',
  };
  // 带基本 Cookie 作为保险（不需要 WAF Cookie，但带上也不影响）
  if (cookieStr && cookieStr.length > 0) {
    headers['Cookie'] = cookieStr;
  }
  return headers;
}

// ============================================================
// HTTP 请求封装（基于原生 https 模块，无需额外依赖）
// ============================================================

/**
 * 发送 HTTP/HTTPS 请求并返回响应数据。
 *
 * @param {string} url 完整请求 URL
 * @param {string} method HTTP 方法（GET / POST / DELETE）
 * @param {Object} headers 请求头
 * @param {string|null} body 请求体（POST 时传入）
 * @param {number} timeout 超时时间（毫秒）
 * @return {Promise<{statusCode: number, data: string}>} 响应结果
 */
function httpRequest(url, method, headers, body, timeout) {
  return new Promise(function (resolve, reject) {
    var parsedUrl = new URL(url);
    var isHttps = parsedUrl.protocol === 'https:';
    var lib = isHttps ? https : http;

    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: headers,
      timeout: timeout,
    };

    var req = lib.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, data: data });
      });
    });

    req.on('timeout', function () {
      req.destroy(new Error('请求超时'));
    });

    req.on('error', function (err) {
      reject(err);
    });

    if (body && (method === 'POST' || method === 'PUT')) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * 发送 GET 请求并解析 JSON 响应。
 *
 * @param {string} path API 路径（可包含查询参数）
 * @param {Object} headers 请求头
 * @return {Promise<{statusCode: number, json: Object|null, raw: string}>}
 */
async function getRequest(path, headers) {
  var url = BASE_URL + path;
  var resp = await httpRequest(url, 'GET', headers, null, REQUEST_TIMEOUT);
  var json = null;
  if (resp.data && resp.data.length > 0) {
    try {
      json = JSON.parse(resp.data);
    } catch (e) {
      // 非 JSON 响应，保持 json = null
    }
  }
  return { statusCode: resp.statusCode, json: json, raw: resp.data };
}

/**
 * 发送 POST 请求（带 JSON 请求体）并解析 JSON 响应。
 *
 * @param {string} path API 路径
 * @param {Object} headers 请求头
 * @param {Object} bodyObj 请求体对象
 * @return {Promise<{statusCode: number, json: Object|null, raw: string}>}
 */
async function postRequest(path, headers, bodyObj) {
  var url = BASE_URL + path;
  var bodyStr = JSON.stringify(bodyObj || {});
  var postHeaders = Object.assign({}, headers, {
    'Content-Length': Buffer.byteLength(bodyStr),
  });
  var resp = await httpRequest(url, 'POST', postHeaders, bodyStr, REQUEST_TIMEOUT);
  var json = null;
  if (resp.data && resp.data.length > 0) {
    try {
      json = JSON.parse(resp.data);
    } catch (e) {
      // 非 JSON 响应，保持 json = null
    }
  }
  return { statusCode: resp.statusCode, json: json, raw: resp.data };
}

/**
 * 发送 POST 请求（空请求体，Content-Length: 0）。
 *
 * 用于 Star 项目接口，该接口要求空请求体且 Content-Length: 0。
 *
 * @param {string} path API 路径
 * @param {Object} headers 请求头
 * @return {Promise<{statusCode: number, json: Object|null, raw: string}>}
 */
async function postEmptyBody(path, headers) {
  var url = BASE_URL + path;
  var postHeaders = Object.assign({}, headers, {
    'Content-Length': '0',
  });
  // 空请求体不需要 Content-Type
  delete postHeaders['Content-Type'];
  var resp = await httpRequest(url, 'POST', postHeaders, null, REQUEST_TIMEOUT);
  var json = null;
  if (resp.data && resp.data.length > 0) {
    try {
      json = JSON.parse(resp.data);
    } catch (e) {
      // 非 JSON 响应，保持 json = null
    }
  }
  return { statusCode: resp.statusCode, json: json, raw: resp.data };
}

/**
 * 发送 DELETE 请求并解析 JSON 响应。
 *
 * 用于取消 Star 项目接口。
 *
 * @param {string} path API 路径
 * @param {Object} headers 请求头
 * @return {Promise<{statusCode: number, json: Object|null, raw: string}>}
 */
async function deleteRequest(path, headers) {
  var url = BASE_URL + path;
  var resp = await httpRequest(url, 'DELETE', headers, null, REQUEST_TIMEOUT);
  var json = null;
  if (resp.data && resp.data.length > 0) {
    try {
      json = JSON.parse(resp.data);
    } catch (e) {
      // 非 JSON 响应，保持 json = null
    }
  }
  return { statusCode: resp.statusCode, json: json, raw: resp.data };
}

// ============================================================
// Token 刷新逻辑
// ============================================================

/**
 * 调用 refresh_token 接口刷新 access_token。
 *
 * 接口：POST /uc/api/v1/user/token/refresh?refresh_token=<refresh_token>
 * 请求头：Authorization: Bearer <access_token>（即使已过期也可使用）
 * 响应：{ access_token: "...", refresh_token: "..." }
 *
 * @param {string} accessToken 当前的 access_token（可能已过期）
 * @param {string} refreshToken refresh_token
 * @param {string} username 用户名（用于日志）
 * @return {Promise<string|null>} 新的 access_token，失败返回 null
 */
async function refreshAccessToken(accessToken, refreshToken, username) {
  var refreshUrl =
    API_TOKEN_REFRESH + '?refresh_token=' + encodeURIComponent(refreshToken);
  var headers = buildHeaders(accessToken, username);

  console.log('[Token刷新] 正在用 refresh_token 刷新...');

  try {
    var resp = await postRequest(refreshUrl, headers, {});

    if (resp.statusCode !== 200) {
      console.log('  [Token刷新] 刷新失败，HTTP ' + resp.statusCode);
      if (resp.raw && resp.raw.length > 0) {
        console.log('  [Token刷新] 响应内容: ' + resp.raw.substring(0, 200));
      }
      if (resp.statusCode === 401 || resp.statusCode === 403) {
        console.log('  [Token刷新] refresh_token 可能已过期（有效期约 60 天）');
        console.log('  [Token刷新] 请重新登录获取新的 Cookie/Token');
      }
      return null;
    }

    if (!resp.json) {
      console.log('  [Token刷新] 响应体为空或非 JSON');
      return null;
    }

    var newAccessToken = resp.json.access_token;
    if (!newAccessToken || newAccessToken.length < 20) {
      console.log('  [Token刷新] 响应中未包含有效的 access_token');
      return null;
    }

    // 计算新 token 的剩余有效期
    var newRemainingHours = getTokenRemainingHours(newAccessToken);
    if (newRemainingHours !== null) {
      console.log(
        '  [Token刷新] 成功，新 access_token 有效期: ' +
        newRemainingHours.toFixed(1) + ' 小时'
      );
    } else {
      console.log('  [Token刷新] 成功，已获取新 access_token');
    }
    if (username) {
      console.log('  [Token刷新] 用户: ' + username);
    }

    return newAccessToken;
  } catch (e) {
    console.log('  [Token刷新] 刷新请求异常: ' + e.message);
    return null;
  }
}

/**
 * 检查 access_token 是否需要刷新，如需要则执行刷新。
 *
 * 判断逻辑：
 *   - 如果没有 refresh_token，跳过刷新（旧版兼容）
 *   - 解码 access_token 的 exp 字段，计算剩余有效期
 *   - 剩余有效期 < REFRESH_THRESHOLD_HOURS（1小时）或已过期时，触发刷新
 *   - 刷新成功返回新 token，刷新失败返回旧 token（降级处理）
 *
 * @param {string} accessToken 当前 access_token
 * @param {string} refreshToken refresh_token（可能为空）
 * @param {string} username 用户名（用于日志）
 * @return {Promise<string>} 可用于签到的 access_token（可能是刷新后的新 token）
 */
async function ensureValidToken(accessToken, refreshToken, username) {
  // 没有 refresh_token，无法刷新，直接返回旧 token（兼容旧版）
  if (!refreshToken || refreshToken.length < 20) {
    return accessToken;
  }

  // 检查 access_token 剩余有效期
  var remainingHours = getTokenRemainingHours(accessToken);

  if (remainingHours === null) {
    // 无法解析 exp 字段，无法判断是否过期，尝试刷新
    console.log('[Token检查] 无法解析 access_token 的有效期，尝试刷新...');
    var newToken = await refreshAccessToken(accessToken, refreshToken, username);
    return newToken || accessToken;
  }

  if (remainingHours > REFRESH_THRESHOLD_HOURS) {
    // 有效期充足，无需刷新
    console.log(
      '🔑 Token 剩余 ' +
      remainingHours.toFixed(1) + ' 小时（无需刷新）'
    );
    return accessToken;
  }

  // 快过期或已过期，需要刷新
  if (remainingHours > 0) {
    console.log(
      '[Token检查] access_token 剩余有效期: ' +
      remainingHours.toFixed(1) + ' 小时（< ' + REFRESH_THRESHOLD_HOURS +
      ' 小时，需要刷新）'
    );
  } else {
    console.log(
      '[Token检查] access_token 已过期 ' +
      Math.abs(remainingHours).toFixed(1) + ' 小时，需要刷新'
    );
  }

  // 执行刷新
  var refreshedToken = await refreshAccessToken(accessToken, refreshToken, username);
  if (refreshedToken) {
    return refreshedToken;
  }

  // 刷新失败，降级使用旧 token 尝试签到
  console.log('  [Token检查] 刷新失败，降级使用旧 access_token 尝试签到');
  return accessToken;
}

// ============================================================
// 核心签到逻辑
// ============================================================

/**
 * 查询签到状态。
 *
 * @param {Object} headers 请求头
 * @return {Promise<Object|null>} 签到状态对象，失败返回 null
 *   - is_sign_in {boolean} 今日是否已签到
 *   - award_index {number} 今日奖励索引（0=周一，6=周日）
 *   - scores {number[]} 每日签到积分奖励数组
 *   - growths {number[]} 每日签到成长值数组
 */
async function getSignStatus(headers) {
  var resp = await getRequest(API_SIGN_STATUS, headers);
  if (resp.statusCode !== 200) {
    console.log('  [签到状态] 请求失败，HTTP ' + resp.statusCode);
    return null;
  }
  if (!resp.json) {
    console.log('  [签到状态] 响应体为空或非 JSON');
    return null;
  }
  return resp.json;
}

/**
 * 查询用户信息。
 *
 * @param {Object} headers 请求头
 * @return {Promise<Object|null>} 用户信息对象，失败返回 null
 *   - username {string} 用户名
 *   - nickname {string} 昵称
 *   - score {number} 当前积分
 *   - growth {number} 当前成长值
 *   - level {number} 当前等级
 *   - next_level {number} 下一等级所需成长值
 */
async function getUserInfo(headers) {
  var resp = await getRequest(API_USER_INFO, headers);
  if (resp.statusCode !== 200) {
    console.log('  [用户信息] 请求失败，HTTP ' + resp.statusCode);
    return null;
  }
  if (!resp.json) {
    console.log('  [用户信息] 响应体为空或非 JSON');
    return null;
  }
  return resp.json;
}

/**
 * 执行签到。
 *
 * 签到接口返回空 body，通过 HTTP 200 状态码判断成功。
 *
 * @param {Object} headers 请求头
 * @return {Promise<boolean>} 是否签到成功
 */
async function doSignIn(headers) {
  var resp = await postRequest(API_SIGN_IN, headers, {});
  if (resp.statusCode === 200) {
    return true;
  }
  console.log('  [签到] 签到请求失败，HTTP ' + resp.statusCode);
  if (resp.raw && resp.raw.length > 0) {
    console.log('  [签到] 响应内容: ' + resp.raw.substring(0, 200));
  }
  return false;
}

// ============================================================
// 每日任务逻辑（V3：查看项目 + Star + 领取奖励）
// ============================================================

/**
 * 查询每日任务列表。
 *
 * 接口：GET /uc/api/v1/task/channel/miniprogram?channel=miniprogram&task_level=1
 * 响应：每日任务数组，每个任务含 task_id、cn_name、status、current_count、need_count、score
 *
 * @param {Object} headers 请求头（小程序环境）
 * @return {Promise<Array<Object>|null>} 任务数组，失败返回 null
 *   每个任务对象：
 *   - task_id {number} 任务ID
 *   - cn_name {string} 任务中文名
 *   - status {number} 0=待领取, 1=已完成, 2=未完成
 *   - current_count {number} 当前完成次数
 *   - need_count {number} 需要次数
 *   - score {number} 奖励积分
 */
async function getTaskList(headers) {
  var resp = await getRequest(API_TASK_LIST, headers);
  if (resp.statusCode !== 200) {
    console.log('  [任务列表] 请求失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [任务列表] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return null;
  }
  if (!resp.json) {
    console.log('  [任务列表] 响应体为空或非 JSON');
    return null;
  }

  // 处理不同的响应格式
  var tasks = resp.json;
  if (Array.isArray(tasks)) {
    return tasks;
  }
  if (tasks.data && Array.isArray(tasks.data)) {
    return tasks.data;
  }
  if (tasks.tasks && Array.isArray(tasks.tasks)) {
    return tasks.tasks;
  }
  if (tasks.list && Array.isArray(tasks.list)) {
    return tasks.list;
  }
  // 未知格式
  console.log('  [任务列表] 响应格式未知: ' + resp.raw.substring(0, 200));
  return null;
}

/**
 * 从任务列表中查找指定 task_id 的任务。
 *
 * @param {Array<Object>} taskList 任务列表
 * @param {number} taskId 任务ID
 * @return {Object|null} 任务对象，未找到返回 null
 */
function findTask(taskList, taskId) {
  if (!taskList || !Array.isArray(taskList)) {
    return null;
  }
  for (var i = 0; i < taskList.length; i++) {
    if (taskList[i].task_id === taskId ||
        String(taskList[i].task_id) === String(taskId)) {
      return taskList[i];
    }
  }
  return null;
}

/**
 * 获取任务状态的中文描述。
 *
 * @param {number} status 任务状态码
 * @return {string} 状态描述
 */
function getTaskStatusText(status) {
  switch (status) {
    case 0:
      return '待领取';
    case 1:
      return '已完成';
    case 2:
      return '未完成';
    default:
      return '未知(' + status + ')';
  }
}

/**
 * 查看项目详情（触发 task 59 "每日查看热门/推荐项目"）。
 *
 * 接口：GET /api/v2/projects/{project_id}
 * 请求头：PC UA + Authorization + Cookie（含 WAF Cookie）+ Referer + Origin
 * 响应：项目详情 JSON（含 id, name, description, star_count, forks_count 等）
 *
 * @param {string} projectId 项目ID
 * @param {Object} headers 项目接口请求头（PC 环境）
 * @return {Promise<Object|null>} 项目详情对象，失败返回 null
 */
async function viewProject(projectId, headers) {
  var path = API_PROJECTS_BASE + projectId;
  var resp = await getRequest(path, headers);
  if (resp.statusCode !== 200) {
    console.log('  [查看项目] 请求失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [查看项目] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return null;
  }
  if (!resp.json) {
    console.log('  [查看项目] 响应体为空或非 JSON');
    return null;
  }
  return resp.json;
}

/**
 * Star 项目（触发 task 62 "每日Star一个项目"）。
 *
 * 接口：POST /api/v2/projects/{project_id}/star
 * 请求头：PC UA + Authorization + Cookie + Content-Length: 0 + Origin + Referer
 * 请求体：空（Content-Length: 0）
 * 响应：{"star_count": 8} HTTP 200
 *
 * @param {string} projectId 项目ID
 * @param {Object} headers 项目接口请求头（PC 环境）
 * @return {Promise<{success: boolean, starCount: number|null}>}
 *         success=true 表示 Star 成功，starCount 为当前 Star 总数
 */
async function starProject(projectId, headers) {
  var path = API_PROJECTS_BASE + projectId + '/star';
  var resp = await postEmptyBody(path, headers);
  if (resp.statusCode !== 200) {
    console.log('  [Star项目] Star 请求失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [Star项目] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return { success: false, starCount: null };
  }
  var starCount = null;
  if (resp.json && typeof resp.json.star_count === 'number') {
    starCount = resp.json.star_count;
  }
  return { success: true, starCount: starCount };
}

/**
 * 取消 Star 项目（用于重新触发 Star 任务）。
 *
 * 接口：DELETE /api/v2/projects/{project_id}/star
 * 请求头：PC UA + Authorization + Cookie + Origin + Referer
 *
 * 注意：如果项目未被 Star，DELETE 请求可能返回非 200 状态码，
 * 调用方应忽略此错误继续尝试 POST star。
 *
 * @param {string} projectId 项目ID
 * @param {Object} headers 项目接口请求头（PC 环境）
 * @return {Promise<boolean>} 是否取消成功（HTTP 200）
 */
async function unstarProject(projectId, headers) {
  var path = API_PROJECTS_BASE + projectId + '/star';
  var resp = await deleteRequest(path, headers);
  return resp.statusCode === 200;
}

/**
 * 领取所有奖励。
 *
 * 接口：POST /uc/api/v1/task/claim-all
 * 请求头：Authorization + Cookie + Referer + UA + Content-Type: application/json
 * 请求体：{}
 * 响应：false（无可领取）或 true（有领取），HTTP 200
 *
 * @param {Object} headers 请求头（需包含 Cookie）
 * @return {Promise<boolean|null>} true=有领取, false=无可领取, null=请求失败
 */
async function claimAllRewards(headers) {
  var resp = await postRequest(API_CLAIM_ALL, headers, {});
  if (resp.statusCode !== 200) {
    console.log('  [领取奖励] 请求失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [领取奖励] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return null;
  }
  // 响应可能是布尔值 true/false
  if (resp.json === true) {
    return true;
  }
  if (resp.json === false) {
    return false;
  }
  // 响应可能是字符串 "true"/"false"
  if (resp.raw === 'true') {
    return true;
  }
  if (resp.raw === 'false') {
    return false;
  }
  // 未知响应格式，视为成功（HTTP 200）
  return true;
}

/**
 * 通过行为上报接口触发 task 77 "每日分享"（V4.3 修复）。
 *
 * 背景：旧方案调用 POST /uc/api/v1/invite/generate 只能取回已有的邀请码
 * （每次返回同一个 code），并不会触发分享任务。
 * 经抓包验证，真实触发点是前端点击"复制邀请链接"时的行为上报：
 *
 * 接口：POST /api/v1/report?event_id=page_click
 * 请求体：{"button_name": "常规邀请_复制邀请链接_PC"}
 * 请求头：Authorization + PC UA + X-Platform: web + X-App-Channel: gitcode-fe
 *        + Referer: https://gitcode.com/setting/points?type=invite
 *
 * ⚠️ 不需要 Cookie/WAF Cookie！只需 access_token。
 *    已实测：调用后 task 77 status 从 2（未完成）变为 0（待领取）。
 *
 * @param {Object} headers 请求头（需包含 Authorization + PC UA）
 * @return {Promise<boolean>} 上报是否成功（HTTP 200）
 */
async function reportShareClick(headers) {
  var resp = await postRequest(API_REPORT, headers, { button_name: SHARE_BUTTON_NAME });
  if (resp.statusCode !== 200) {
    console.log('  [每日分享] 上报失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [每日分享] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return false;
  }
  return true;
}

/**
 * 重新查询任务列表，验证指定任务是否已被触发（V4.3 新增）。
 *
 * 用于在任务动作执行后确认真实状态，避免"接口返回 200 但任务未触发"的假成功。
 *
 * @param {Object} headers 请求头（签到接口 headers）
 * @param {number} taskId 任务 ID
 * @return {Promise<boolean>} true=任务已触发（status 0 或 1），false=未触发或查询失败
 */
async function verifyTaskTriggered(headers, taskId) {
  try {
    var taskList = await getTaskList(headers);
    var task = findTask(taskList, taskId);
    if (task && (task.status === 0 || task.status === 1)) {
      return true;
    }
  } catch (e) {
    // 查询失败时不阻断，返回 false
  }
  return false;
}

// ============================================================
// 文件操作逻辑（V4 新增：每日更新项目文件）
// ============================================================

/**
 * GET 仓库文件内容。
 *
 * 接口：GET /api/v2/projects/{owner}%2F{repo}/repository/files
 *      ?repoId={owner}%252F{repo}&ref=main&file_path=README.md
 *
 * ⚠️ URL 编码说明：
 *   - 路径中的 owner/repo：单次编码 encodeURIComponent('owner/repo') → owner%2Frepo
 *   - repoId 查询参数：双重编码 encodeURIComponent(encodeURIComponent('owner/repo'))
 *     → owner%252Frepo（%25 = %, 2F = /）
 *
 * 请求头：Authorization: Bearer <token> + PC UA + Referer（不需要 WAF Cookie）
 * 响应：
 *   {
 *     "name": "README.md",
 *     "size": 15,
 *     "encoding": "base64",
 *     "content": "IyBjb2RleAoKMTIxMjEy",  // base64 编码的文件内容
 *     "commit": { "id": "fe64c8eb..." },
 *     "blob_id": "..."
 *   }
 *
 * @param {string} encodedRepo 单次编码的 owner/repo（如 QQ111QQ%2Fcodex）
 * @param {string} doubleEncodedRepo 双重编码的 owner/repo（如 QQ111QQ%252Fcodex）
 * @param {string} filePath 文件路径（如 README.md）
 * @param {Object} headers 文件操作请求头
 * @return {Promise<{content: string, commitId: string, name: string}|null>}
 *         文件信息对象，失败返回 null
 */
async function getProjectFile(encodedRepo, doubleEncodedRepo, filePath, headers) {
  var path =
    API_PROJECTS_BASE + encodedRepo + API_REPO_FILES_SUFFIX +
    '?repoId=' + doubleEncodedRepo +
    '&ref=' + DEFAULT_BRANCH +
    '&file_path=' + encodeURIComponent(filePath);

  var resp = await getRequest(path, headers);
  if (resp.statusCode !== 200) {
    console.log('  [更新项目] GET 文件内容失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [更新项目] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return null;
  }
  if (!resp.json) {
    console.log('  [更新项目] 文件内容响应体为空或非 JSON');
    return null;
  }

  // 解码 base64 内容
  var fileContent = '';
  if (resp.json.content) {
    try {
      fileContent = Buffer.from(resp.json.content, 'base64').toString('utf8');
    } catch (e) {
      console.log('  [更新项目] base64 解码失败: ' + e.message);
      return null;
    }
  }

  // 提取文件对应的 commit ID
  var commitId = '';
  if (resp.json.commit && resp.json.commit.id) {
    commitId = resp.json.commit.id;
  }

  var fileName = resp.json.name || filePath;

  return {
    content: fileContent,
    commitId: commitId,
    name: fileName,
  };
}

/**
 * GET 仓库最新 commit ID。
 *
 * 接口：GET /api/v2/projects/{project_id}/repository/commits?ref_name=main&per_page=1
 *
 * ⚠️ 注意：这里用数字 project_id（如 10424383），不是 owner/repo
 *
 * 请求头：Authorization: Bearer <token> + PC UA + Referer（不需要 WAF Cookie）
 * 响应：
 *   {
 *     "page_num": 1,
 *     "page_size": 1,
 *     "total": 3,
 *     "content": [
 *       {
 *         "id": "fe64c8ebe3fb4eacd117f76f93bf7acd367160a2",
 *         "short_id": "fe64c8eb",
 *         "title": "update: 更新文件 README.md",
 *         ...
 *       }
 *     ]
 *   }
 *
 * @param {string} projectId 数字项目 ID（如 10424383）
 * @param {Object} headers 文件操作请求头
 * @return {Promise<{commitId: string, shortId: string, title: string}|null>}
 *         最新 commit 信息，失败返回 null
 */
async function getLatestCommitId(projectId, headers) {
  var path =
    API_PROJECTS_BASE + projectId + API_REPO_COMMITS_SUFFIX +
    '?ref_name=' + DEFAULT_BRANCH + '&per_page=1';

  var resp = await getRequest(path, headers);
  if (resp.statusCode !== 200) {
    console.log('  [更新项目] GET commits 失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [更新项目] 响应内容: ' + resp.raw.substring(0, 200));
    }
    return null;
  }
  if (!resp.json) {
    console.log('  [更新项目] commits 响应体为空或非 JSON');
    return null;
  }

  // 解析 commits 列表（兼容 content 数组或直接数组）
  var commitsContent = resp.json.content || resp.json;
  if (!Array.isArray(commitsContent)) {
    if (resp.json.data && Array.isArray(resp.json.data)) {
      commitsContent = resp.json.data;
    } else {
      console.log('  [更新项目] commits 列表格式未知');
      return null;
    }
  }

  if (commitsContent.length === 0) {
    console.log('  [更新项目] commits 列表为空');
    return null;
  }

  var latestCommit = commitsContent[0];
  return {
    commitId: latestCommit.id || '',
    shortId: latestCommit.short_id || '',
    title: latestCommit.title || '',
  };
}

/**
 * POST commit 更新文件内容。
 *
 * 接口：POST /api/v2/projects/{owner}%2F{repo}/repository/commits
 *
 * 请求头：
 *   - Authorization: Bearer <access_token>
 *   - Content-Type: application/json
 *   - Origin: https://gitcode.com
 *   - Referer: https://gitcode.com/
 *   - PC UA
 *   - X-Platform: web
 *
 * 请求体（严格按此格式）：
 *   {
 *     "branch": "main",
 *     "start_branch": "",
 *     "repoId": "QQ111QQ%2Fcodex",   // 单次编码
 *     "commit_message": "chore: 每日自动签到更新 README",
 *     "author_email": "QQ111QQ@noreply.gitcode.com",
 *     "author_name": "QQ111QQ",
 *     "is_signoff": false,
 *     "actions": [
 *       {
 *         "action": "update",
 *         "file_path": "README.md",
 *         "previous_path": "",
 *         "content": "# codex\n\n...\n## 签到日志\n- 2026-07-21 自动签到\n",
 *         "last_commit_id": "fe64c8ebe3fb4eacd117f76f93bf7acd367160a2",
 *         "encoding": "text"
 *       }
 *     ],
 *     "file_path": "README.md"
 *   }
 *
 * 响应（HTTP 200）：
 *   {
 *     "id": "9a5f903af788c5aa3a3764ae0cf1d09ffbcee9b1",
 *     "short_id": "9a5f903a",
 *     "title": "chore: 每日自动签到更新 README",
 *     "parent_ids": ["fe64c8eb..."],
 *     "project_id": 10424383
 *   }
 *
 * @param {string} encodedRepo 单次编码的 owner/repo（如 QQ111QQ%2Fcodex）
 * @param {Object} commitBody commit 请求体对象
 * @param {Object} headers 文件操作请求头
 * @return {Promise<{shortId: string, title: string, commitId: string}|null>}
 *         新 commit 信息，失败返回 null
 */
async function commitFileUpdate(encodedRepo, commitBody, headers) {
  var path = API_PROJECTS_BASE + encodedRepo + API_REPO_COMMITS_SUFFIX;
  var resp = await postRequest(path, headers, commitBody);

  if (resp.statusCode !== 200) {
    console.log('  [更新项目] POST commit 失败，HTTP ' + resp.statusCode);
    if (resp.raw && resp.raw.length > 0) {
      console.log('  [更新项目] 响应内容: ' + resp.raw.substring(0, 300));
    }
    if (resp.statusCode === 400 || resp.statusCode === 409) {
      console.log('  [更新项目] 可能是 last_commit_id 过期（并发修改），请稍后重试');
    }
    return null;
  }
  if (!resp.json) {
    console.log('  [更新项目] commit 响应体为空或非 JSON');
    return null;
  }

  return {
    commitId: resp.json.id || '',
    shortId: resp.json.short_id || '',
    title: resp.json.title || '',
  };
}

/**
 * 执行每日更新项目文件的完整流程。
 *
 * 流程：
 *   1. 解析 repo（owner/repo）并计算 URL 编码
 *   2. GET 文件内容（README.md），解码 base64
 *   3. 在文件末尾追加签到日志（格式：\n## 签到日志\n- {YYYY-MM-DD HH:mm} 自动签到\n）
 *   4. GET 最新 commit ID（用于 last_commit_id 防并发冲突）
 *   5. POST commit 更新文件
 *   6. 日志输出 commit short_id、commit message
 *
 * ⚠️ 此功能不需要 WAF Cookie！只需要 access_token + 基本 cookie。
 *    文件更新失败不阻断后续流程（claim-all 仍执行）。
 *
 * @param {Object} fileHeaders 文件操作请求头（buildFileHeaders 构造）
 * @param {string} repo 仓库全名（owner/repo 格式，如 QQ111QQ/codex）
 * @param {string} projectId 数字项目 ID（用于 GET commits）
 * @param {string} username 用户名（用于 author_email 和 author_name）
 * @return {Promise<boolean>} true=更新成功, false=更新失败或跳过
 */
async function processFileUpdate(fileHeaders, repo, projectId, username) {
  console.log('');
  console.log('[更新项目] 开始更新项目文件...');
  console.log('[更新项目] 仓库: ' + repo);

  // 解析 owner/repo
  var repoParts = repo.split('/');
  if (repoParts.length < 2) {
    console.log('  [更新项目] 仓库格式错误，应为 owner/repo（如 QQ111QQ/codex）');
    return false;
  }

  var ownerRepo = repoParts[0] + '/' + repoParts[1];

  // URL 编码
  // 路径编码：encodeURIComponent('QQ111QQ/codex') → QQ111QQ%2Fcodex
  var encodedRepo = encodeURIComponent(ownerRepo);
  // repoId 参数双重编码：encodeURIComponent(encodeURIComponent('QQ111QQ/codex')) → QQ111QQ%252Fcodex
  var doubleEncodedRepo = encodeURIComponent(encodedRepo);

  var filePath = DEFAULT_FILE_PATH;

  // 步骤1：GET 文件内容
  console.log('[更新项目] GET 文件内容...');
  var fileInfo = null;
  try {
    fileInfo = await getProjectFile(encodedRepo, doubleEncodedRepo, filePath, fileHeaders);
  } catch (e) {
    console.log('  [更新项目] GET 文件内容异常: ' + e.message);
    return false;
  }

  if (!fileInfo) {
    console.log('  [更新项目] 获取文件内容失败，跳过更新');
    return false;
  }

  var currentContent = fileInfo.content;
  console.log('  当前 ' + filePath + ' 内容: ' + currentContent.substring(0, 100) +
    (currentContent.length > 100 ? '...' : ''));
  console.log('  当前 commit: ' + (fileInfo.commitId.substring(0, 8) || '未知'));

  // 步骤2：追加签到日志
  var now = new Date();
  var dateStr = formatDateTime(now);
  var logEntry = '\n## 签到日志\n- ' + dateStr + ' 自动签到\n';

  // 如果文件末尾没有换行符，先加一个换行
  var newContent = currentContent;
  if (newContent.length > 0 && newContent[newContent.length - 1] !== '\n') {
    newContent += '\n';
  }
  newContent += logEntry;

  console.log('[更新项目] 追加签到日志...');
  console.log('  新内容: ' + newContent.substring(0, 200) +
    (newContent.length > 200 ? '...' : ''));

  // 步骤3：GET 最新 commit ID（用于 last_commit_id）
  console.log('[更新项目] GET 最新 commit ID...');
  var latestCommit = null;
  try {
    latestCommit = await getLatestCommitId(projectId, fileHeaders);
  } catch (e) {
    console.log('  [更新项目] GET commits 异常: ' + e.message);
    return false;
  }

  if (!latestCommit || !latestCommit.commitId) {
    console.log('  [更新项目] 获取最新 commit ID 失败，跳过更新（没有 last_commit_id 无法 POST）');
    return false;
  }

  var lastCommitId = latestCommit.commitId;
  console.log('  last_commit_id: ' + lastCommitId);

  // 步骤4：POST commit 更新文件
  console.log('[更新项目] POST commit...');

  // 构造 author 信息
  var authorName = username || repoParts[0] || 'unknown';
  var authorEmail = authorName + '@noreply.gitcode.com';

  var commitBody = {
    branch: DEFAULT_BRANCH,
    start_branch: '',
    repoId: encodedRepo,
    commit_message: DEFAULT_COMMIT_MESSAGE,
    author_email: authorEmail,
    author_name: authorName,
    is_signoff: false,
    actions: [
      {
        action: 'update',
        file_path: filePath,
        previous_path: '',
        content: newContent,
        last_commit_id: lastCommitId,
        encoding: 'text',
      },
    ],
    file_path: filePath,
  };

  var commitResult = null;
  try {
    commitResult = await commitFileUpdate(encodedRepo, commitBody, fileHeaders);
  } catch (e) {
    console.log('  [更新项目] POST commit 异常: ' + e.message);
    return false;
  }

  if (!commitResult) {
    console.log('  [更新项目] 更新失败');
    return false;
  }

  console.log('  ✅ 更新成功！');
  console.log('  新 commit: ' + commitResult.shortId);
  console.log('  commit message: ' + commitResult.title);
  return true;
}

// ============================================================
// 每日任务自动化流程（V4：查看项目 + Star + 更新文件 + 领取奖励）
// ============================================================

/**
 * 执行每日任务自动化流程。
 *
 * V4 流程：
 *   1. 检查 Cookie 串是否包含 WAF Cookie（查看项目/Star 需要，文件更新不需要）
 *   2. 查询用户当前积分（任务前基准）
 *   3. 查询每日任务列表（不需要 WAF Cookie）
 *   4. [V4.1新增] 每日分享（触发 task 77，不需要 WAF Cookie）
 *   5. [WAF可用] 查看项目详情（触发 task 59）
 *   6. [WAF可用] 取消 Star + 重新 Star（触发 task 62）
 *   7. [V4新增] 更新项目文件（不需要 WAF Cookie）
 *   8. 领取所有奖励（claim-all）
 *   9. 查询用户最新积分，计算获得积分
 *  10. 输出每日任务汇总
 *
 * 异常处理：
 *   - WAF Cookie 缺失：跳过查看项目/Star，但仍执行分享、文件更新和领取奖励
 *   - 项目接口失败：不阻断流程，记录错误继续
 *   - DELETE star 失败：忽略，继续 POST star
 *   - 分享接口失败：记录错误，不阻断流程
 *   - 文件更新失败：不阻断流程，claim-all 仍执行
 *   - claim-all 失败：记录错误，不影响其他流程
 *   - 任务查询失败：跳过该任务
 *
 * @param {{accessToken: string, refreshToken: string, username: string, cookieStr: string}} auth
 *        认证信息（含完整 Cookie 串）
 * @param {string} accessToken 当前有效的 access_token（可能已刷新）
 * @param {Object} signHeaders 签到接口请求头（小程序环境）
 * @param {string} projectId 项目ID（用于查看项目/Star/GET commits）
 * @param {string} repo 仓库全名（owner/repo，如 QQ111QQ/codex，为空则跳过文件更新）
 * @param {number} accountIndex 账号序号（用于日志）
 * @return {Promise<void>}
 */
async function processDailyTasks(auth, accessToken, signHeaders, projectId, repo, accountIndex) {
  console.log('');
  console.log('  │ 🎯 开始执行每日任务...');

  // 检查 Cookie 串是否包含 WAF Cookie
  var cookieStr = auth.cookieStr || '';
  var wafAvailable = hasWafCookie(cookieStr);

  // 构建文件操作请求头（不需要 WAF Cookie）
  var fileHeaders = buildFileHeaders(accessToken, cookieStr, auth.username);

  // 获取任务前积分（基准）
  var scoreBefore = 0;
  try {
    var userInfoBefore = await getUserInfo(signHeaders);
    if (userInfoBefore) {
      scoreBefore = userInfoBefore.score || 0;
    }
  } catch (e) {
    // 获取失败不阻断流程
  }

  var taskList = null;
  var task59Triggered = false;
  var task62Triggered = false;
  var task77Triggered = false;
  var task59Score = 10;
  var task62Score = 10;
  var task77Score = 10;

  // 步骤1：查询任务列表（不需要 WAF Cookie，始终执行）
  console.log('  │ 📋 查询任务列表...');
  try {
    taskList = await getTaskList(signHeaders);
  } catch (e) {
    console.log('  [每日任务] 查询任务列表异常: ' + e.message);
  }

  if (taskList && taskList.length > 0) {
    // 输出各任务状态
    var taskIds = [59, 62, 77];
    for (var i = 0; i < taskIds.length; i++) {
      var tid = taskIds[i];
      var task = findTask(taskList, tid);
      if (task) {
        var statusText = getTaskStatusText(task.status);
        console.log(
          '  - task ' + tid + ' (' + (task.cn_name || (TASK_INFO[tid] ? TASK_INFO[tid].name : '未知')) +
          '): ' + statusText
        );
      }
    }

    var task59 = findTask(taskList, 59);
    var task62 = findTask(taskList, 62);
    var task77 = findTask(taskList, 77);
    task59Score = (task59 && task59.score) || 10;
    task62Score = (task62 && task62.score) || 10;
    task77Score = (task77 && task77.score) || 10;

    // 步骤A：每日分享（触发 task 77，不需要 WAF Cookie）
    if (task77 && task77.status === 2) {
      console.log('');
      console.log('  │ 📤 上报分享行为...');
      // 上报接口使用 PC UA + X-Platform: web，不需要 WAF Cookie
      var shareHeaders = {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'User-Agent': PC_USER_AGENT,
        'Referer': 'https://gitcode.com/setting/points?type=invite',
        'Origin': GITCODE_SITE,
        'X-Platform': 'web',
        'X-App-Channel': 'gitcode-fe',
        'X-Device-Type': 'Windows',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'X-Username': auth.username || 'unknown',
      };
      try {
        var shareOk = await reportShareClick(shareHeaders);
        if (shareOk) {
          // 等待服务端处理后重新验证任务状态（V4.3 新增，避免假成功）
          await new Promise(function (resolve) { setTimeout(resolve, 1000); });
          var verified = await verifyTaskTriggered(signHeaders, 77);
          if (verified) {
            task77Triggered = true;
            console.log('  │ 📤 分享已触发 ✓ (+' + task77Score + ' 积分)');
          } else {
            console.log('  │ ⚠️ 分享上报成功但任务未触发（接口可能已变更）');
          }
        }
      } catch (e) {
        console.log('  [每日分享] 请求异常: ' + e.message);
      }
    } else if (task77) {
      console.log('  │ 📤 每日分享: ' + getTaskStatusText(task77.status) + '，跳过');
    }

    // 等待 1 秒，让服务端处理
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });

    if (wafAvailable) {
      // 构建项目接口请求头（PC 浏览器环境，需要 WAF Cookie）
      var projectHeaders = buildProjectHeaders(accessToken, cookieStr, auth.username);

      // 步骤B：查看项目（触发 task 59）
      if (task59 && task59.status === 2) {
        console.log('');
        console.log('[查看项目] GET /api/v2/projects/' + projectId + '...');
        try {
          var projectInfo = await viewProject(projectId, projectHeaders);
          if (projectInfo) {
            var projName = projectInfo.path_with_namespace ||
                           projectInfo.name_with_namespace ||
                           projectInfo.name ||
                           projectInfo.path ||
                           ('项目#' + projectId);
            var projDesc = projectInfo.description || '无描述';
            var projStarCount = projectInfo.star_count || 0;
            var projForksCount = projectInfo.forks_count || 0;
            console.log('  项目: ' + projName);
            console.log('  描述: ' + projDesc);
            console.log('  Star数: ' + projStarCount + (projForksCount > 0 ? '  Fork数: ' + projForksCount : ''));
            // 等待服务端处理后重新验证任务状态（V4.3 新增，避免假成功）
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
            var verified59 = await verifyTaskTriggered(signHeaders, 59);
            if (verified59) {
              task59Triggered = true;
              console.log('  │ 🔍 查看热门已触发 ✓ (+' + task59Score + ' 积分)');
            } else {
              console.log('  │ ⚠️ 项目已查看但 task 59 未触发（触发接口可能已变更）');
            }
          } else {
            console.log('  [查看项目] 获取项目详情失败');
          }
        } catch (e) {
          console.log('  [查看项目] 请求异常: ' + e.message);
          if (e.message && e.message.indexOf('WAF') !== -1) {
            console.log('  [查看项目] 可能是 WAF Cookie 已过期，请重新获取完整 Cookie 串');
          }
        }
      } else if (task59) {
        console.log('[查看项目] task 59 状态为 ' + getTaskStatusText(task59.status) + '，跳过');
      }

      // 等待 1 秒，让服务端处理
      await new Promise(function (resolve) { setTimeout(resolve, 1000); });

      // 步骤C：Star 项目（触发 task 62）
      if (task62 && task62.status === 2) {
        console.log('');
        // 先尝试取消 Star（确保能重新触发）
        console.log('[Star项目] DELETE /api/v2/projects/' + projectId + '/star...（取消旧Star）');
        try {
          var unstarOk = await unstarProject(projectId, projectHeaders);
          if (unstarOk) {
            console.log('  [Star项目] 取消Star成功');
          } else {
            console.log('  [Star项目] 取消Star未成功（可能项目未被Star，继续尝试Star）');
          }
        } catch (e) {
          console.log('  [Star项目] 取消Star异常（忽略，继续尝试Star）: ' + e.message);
        }

        // 等待 500ms
        await new Promise(function (resolve) { setTimeout(resolve, 500); });

        console.log('[Star项目] POST /api/v2/projects/' + projectId + '/star...');
        try {
          var starResult = await starProject(projectId, projectHeaders);
          if (starResult.success) {
            if (starResult.starCount !== null) {
              console.log('  Star成功，当前 Star 数: ' + starResult.starCount);
            } else {
              console.log('  Star成功');
            }
            // 等待服务端处理后重新验证任务状态（V4.3 新增，避免假成功）
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
            var verified62 = await verifyTaskTriggered(signHeaders, 62);
            if (verified62) {
              task62Triggered = true;
              console.log('  │ ⭐ Star已触发 ✓ (+' + task62Score + ' 积分)');
            } else {
              console.log('  │ ⚠️ Star成功但 task 62 未触发（触发接口可能已变更）');
            }
          } else {
            console.log('  [Star项目] Star 请求失败');
          }
        } catch (e) {
          console.log('  [Star项目] 请求异常: ' + e.message);
          if (e.message && e.message.indexOf('WAF') !== -1) {
            console.log('  [Star项目] 可能是 WAF Cookie 已过期，请重新获取完整 Cookie 串');
          }
        }
      } else if (task62) {
        console.log('[Star项目] task 62 状态为 ' + getTaskStatusText(task62.status) + '，跳过');
      }
    }
  } else {
    console.log('  [每日任务] 任务列表为空');
  }

  if (!wafAvailable) {
    console.log('[每日任务] 未检测到 WAF Cookie（HWWAFSESID 等），跳过查看项目和Star项目');
    console.log('[每日任务] 提示: 每日任务（查看项目、Star项目）需要完整 Cookie 串');
    console.log('[每日任务]       每日分享、文件更新和领取奖励不受影响（不需要 WAF Cookie）');
  }

  // 步骤C（V4新增）：更新项目文件（不需要 WAF Cookie）
  if (repo && repo.length > 0) {
    try {
      await processFileUpdate(fileHeaders, repo, projectId, auth.username);
    } catch (e) {
      console.log('  [更新项目] 执行异常: ' + e.message);
      // 文件更新失败不阻断后续流程
    }
  } else {
    console.log('[更新项目] 未配置 GITCODE_REPO，跳过文件更新');
  }

  // 等待 1 秒
  await new Promise(function (resolve) { setTimeout(resolve, 1000); });

  // 步骤D：领取所有奖励
  console.log('');
  console.log('[领取奖励] POST /uc/api/v1/task/claim-all...');
  var claimResult = null;
  try {
    // claim-all 需要 Cookie，将 Cookie 添加到签到请求头
    var claimHeaders = Object.assign({}, signHeaders, { 'Cookie': cookieStr });
    claimResult = await claimAllRewards(claimHeaders);
    if (claimResult === true) {
      console.log('  领取结果: 成功领取奖励');
    } else if (claimResult === false) {
      console.log('  领取结果: 无可领取奖励（可能已自动到账）');
    } else {
      console.log('  领取结果: 请求完成');
    }
  } catch (e) {
    console.log('  [领取奖励] 请求异常: ' + e.message);
  }

  // 步骤E：获取最终积分
  var scoreAfter = scoreBefore;
  try {
    var userInfoAfter = await getUserInfo(signHeaders);
    if (userInfoAfter) {
      scoreAfter = userInfoAfter.score || scoreBefore;
    }
  } catch (e) {
    // 获取失败不阻断流程
  }

  var totalGained = scoreAfter - scoreBefore;

  // 输出每日任务汇总
  console.log('');
  console.log('  ┌─ 任务汇总 ─────────────────────────┐');

  // task 59 汇总
  var task59 = taskList ? findTask(taskList, 59) : null;
  if (task59Triggered) {
    console.log('  │ 🔍 查看热门    ✅ +' + task59Score + ' 分                     │');
  } else if (task59 && (task59.status === 1 || task59.status === 0)) {
    console.log('  │ 🔍 查看热门    ✅ 已完成                    │');
  } else if (task59) {
    console.log('  │ 🔍 查看热门    ❌ 未完成                    │');
  } else if (!wafAvailable) {
    console.log('  │ 🔍 查看热门    ⏭️ 跳过(无WAF)               │');
  } else {
    console.log('  │ 🔍 查看热门    ❌ 未完成                    │');
  }

  // task 62 汇总
  var task62 = taskList ? findTask(taskList, 62) : null;
  if (task62Triggered) {
    console.log('  │ ⭐ Star项目    ✅ +' + task62Score + ' 分                     │');
  } else if (task62 && (task62.status === 1 || task62.status === 0)) {
    console.log('  │ ⭐ Star项目    ✅ 已完成                    │');
  } else if (task62) {
    console.log('  │ ⭐ Star项目    ❌ 未完成                    │');
  } else if (!wafAvailable) {
    console.log('  │ ⭐ Star项目    ⏭️ 跳过(无WAF)               │');
  } else {
    console.log('  │ ⭐ Star项目    ❌ 未完成                    │');
  }

  // task 77 汇总
  var task77Summary = taskList ? findTask(taskList, 77) : null;
  if (task77Triggered) {
    console.log('  │ 📤 每日分享    ✅ +' + task77Score + ' 分                     │');
  } else if (task77Summary && (task77Summary.status === 1 || task77Summary.status === 0)) {
    console.log('  │ 📤 每日分享    ✅ 已完成                    │');
  } else if (task77Summary) {
    console.log('  │ 📤 每日分享    ❌ 未完成                    │');
  }

  // 文件更新汇总
  if (repo && repo.length > 0) {
    console.log('  │ 📝 更新README  ✅ 已执行                    │');
  } else {
    console.log('  │ 📝 更新README  ⏭️ 未配置                    │');
  }

  console.log('  ├────────────────────────────────────┤');
  console.log(
    '  │ 🎁 今日获得: +' + totalGained + ' 分  |  总积分: ' + scoreAfter + '             │'
  );
  console.log('  └────────────────────────────────────┘');
}

// ============================================================
// 账号处理（签到 + 每日任务）
// ============================================================

/**
 * 执行单个账号的完整流程：签到 + 每日任务。
 *
 * 流程：
 *   1. 检查并刷新 access_token（如果有 refresh_token）
 *   2. 查询用户信息（验证 token 有效性 + 获取签到前积分）
 *   3. 查询签到状态
 *   4. 若未签到，执行签到
 *   5. 签到后查询状态和积分，输出结果
 *   6. V4.1：执行每日任务（分享 + 查看项目 + Star项目 + 更新项目文件 + 领取奖励）
 *
 * @param {{accessToken: string, refreshToken: string, username: string, cookieStr: string}} auth
 *        认证信息
 * @param {number} accountIndex 账号序号（用于日志标识）
 * @param {string} projectId 项目ID（用于每日任务）
 * @param {string} repo 仓库全名（owner/repo，用于文件更新，为空则跳过）
 * @return {Promise<boolean>} true=流程成功完成, false=出现错误
 */
async function processAccount(auth, accountIndex, projectId, repo) {
  var displayName = auth.username || ('账号' + accountIndex);
  console.log('\n┌─ 账号' + accountIndex + ': ' + displayName);

  // 步骤0：检查并刷新 Token
  var accessToken = await ensureValidToken(
    auth.accessToken, auth.refreshToken, auth.username
  );

  var headers = buildHeaders(accessToken, auth.username);

  // 步骤1：查询用户信息（验证 token）
  console.log('  │ ✏️  查询用户信息...');
  var userInfoBefore = null;
  try {
    userInfoBefore = await getUserInfo(headers);
  } catch (e) {
    console.log('  [错误] 获取用户信息失败: ' + e.message);
    console.log('  可能原因: Token 已过期或网络异常，请重新获取');
    return false;
  }

  if (!userInfoBefore) {
    console.log('  [错误] 用户信息为空，Token 可能已失效');
    return false;
  }

  var scoreBefore = userInfoBefore.score || 0;
  var growthBefore = userInfoBefore.growth || 0;
  var level = userInfoBefore.level || 1;
  var nextLevel = userInfoBefore.next_level || 0;
  console.log('  用户名: ' + (userInfoBefore.username || displayName));
  console.log('  昵称: ' + (userInfoBefore.nickname || '未知'));
  console.log('  当前积分: ' + scoreBefore);
  console.log('  当前成长值: ' + growthBefore);
  console.log('  当前等级: Lv.' + level + (nextLevel > 0 ? ' (下一级需 ' + nextLevel + ' 成长值)' : ''));

  // 步骤2：查询签到状态
  console.log('  │ 🔖 查询签到状态...');
  var signStatusBefore = null;
  try {
    signStatusBefore = await getSignStatus(headers);
  } catch (e) {
    console.log('  [错误] 获取签到状态失败: ' + e.message);
    return false;
  }

  if (!signStatusBefore) {
    console.log('  [错误] 签到状态为空');
    return false;
  }

  var alreadySignedIn = signStatusBefore.is_sign_in === true;
  var awardIndex = signStatusBefore.award_index || 0;
  var scoresArr = signStatusBefore.scores || [];
  var todayScore = scoresArr[awardIndex] || 0;
  var weekdayName = WEEKDAY_NAMES[awardIndex] || ('第' + (awardIndex + 1) + '天');

  if (alreadySignedIn) {
    console.log('  │ 🔖 今日已签到 ✓');
    console.log('  │ ' + todayScore + ' 积分 (' + weekdayName + ')');
  } else {
    // 步骤3：执行签到
    console.log('  │ ✍️  正在签到...');
    var signInSuccess = false;
    try {
      signInSuccess = await doSignIn(headers);
    } catch (e) {
      console.log('  [错误] 签到请求异常: ' + e.message);
      return false;
    }

    if (!signInSuccess) {
      console.log('  [结果] 签到失败');
      return false;
    }

    console.log('  签到请求已发送（HTTP 200）');

    // 步骤4：签到后查询状态和积分
    console.log('  │ 📊 查询签到结果...');

    // 等待 1 秒让服务端处理完成
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });

    var signStatusAfter = null;
    try {
      signStatusAfter = await getSignStatus(headers);
    } catch (e) {
      console.log('  [警告] 签到后查询状态失败: ' + e.message);
    }

    if (signStatusAfter && signStatusAfter.is_sign_in === true) {
      console.log('  签到状态确认: 已签到');
    } else if (signStatusAfter) {
      console.log('  [警告] 签到后状态仍为未签到，可能签到未生效');
    }

    var userInfoAfter = null;
    try {
      userInfoAfter = await getUserInfo(headers);
    } catch (e) {
      console.log('  [警告] 签到后查询积分失败: ' + e.message);
    }

    if (userInfoAfter) {
      var scoreAfter = userInfoAfter.score || 0;
      var scoreGained = scoreAfter - scoreBefore;
      console.log('');
      console.log('  ┌─ 签到结果 ─────────────────────────┐');
      console.log('  │ 状态: ✅ 成功                      │');
      console.log('  │ 获得: +' + (scoreGained > 0 ? scoreGained : todayScore) + ' 积分                          │');
      console.log('  │ 总积分: ' + scoreAfter + '   成长值: ' + (userInfoAfter.growth || 0) + '   等级: Lv.' + (userInfoAfter.level || level) + ' │');
      console.log('  └────────────────────────────────────┘');
    } else {
      console.log('  [结果] 签到已完成（预计获得 ' + todayScore + ' 积分）');
    }
  }

  // 步骤5（V4）：执行每日任务
  try {
    await processDailyTasks(auth, accessToken, headers, projectId, repo, accountIndex);
  } catch (e) {
    console.log('  [每日任务] 执行异常: ' + e.message);
    // 每日任务异常不阻断签到流程
  }

  return true;
}

// ============================================================
// 项目 ID / 仓库管理
// ============================================================

/**
 * 从环境变量读取项目 ID 列表。
 *
 * 读取 GITCODE_PROJECT_ID 环境变量，按 & 或换行分隔。
 * 未设置时返回默认项目 ID [10397774]。
 *
 * @return {string[]} 项目 ID 数组
 */
function getProjectIds() {
  var envProjectId =
    process.env.GITCODE_PROJECT_ID ||
    process.env.gitcode_project_id ||
    '';
  if (!envProjectId || envProjectId.trim().length === 0) {
    return [DEFAULT_PROJECT_ID];
  }
  var ids = splitMultiAccount(envProjectId);
  return ids.length > 0 ? ids : [DEFAULT_PROJECT_ID];
}

/**
 * 为指定账号选择项目 ID。
 *
 * 选择策略：
 *   - 如果只有一个项目 ID，直接使用
 *   - 如果有多个项目 ID，按"一年中的第几天 + 账号序号"取模轮换
 *     确保不同账号在同一天使用不同项目，同一账号在不同天使用不同项目
 *
 * @param {string[]} projectIds 项目 ID 数组
 * @param {number} accountIndex 账号序号（从 1 开始）
 * @return {string} 选中的项目 ID
 */
function selectProjectId(projectIds, accountIndex) {
  if (!projectIds || projectIds.length === 0) {
    return DEFAULT_PROJECT_ID;
  }
  if (projectIds.length === 1) {
    return projectIds[0];
  }
  // 按天轮换 + 账号偏移
  var now = new Date();
  var startOfYear = new Date(now.getFullYear(), 0, 0);
  var dayOfYear = Math.floor((now - startOfYear) / 86400000);
  var index = (dayOfYear + accountIndex - 1) % projectIds.length;
  return projectIds[index];
}

/**
 * 从环境变量读取仓库列表（V4 新增）。
 *
 * 读取 GITCODE_REPO 环境变量，按 & 或换行分隔。
 * 格式为 owner/repo（如 QQ111QQ/codex）。
 * 未设置时返回空数组（跳过文件更新）。
 *
 * 多账号时，每个账号对应一个 repo（与 GITCODE_COOKIE 的多账号一一对应）。
 * 如果账号数多于 repo 数，多余的账号跳过文件更新。
 *
 * @return {string[]} 仓库全名数组（owner/repo 格式）
 */
function getRepos() {
  var envRepo =
    process.env.GITCODE_REPO ||
    process.env.gitcode_repo ||
    '';
  if (!envRepo || envRepo.trim().length === 0) {
    return [];
  }
  return splitMultiAccount(envRepo);
}

// ============================================================
// 主入口
// ============================================================

/**
 * 脚本主函数。
 * 读取环境变量，解析多账号，依次执行签到 + 每日任务。
 */
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   GitCode 每日签到  V4.3            ║');
  console.log('║   签到 + 刷新 + 分享/查看/Star + 更新 ║');
  console.log('║   ' + new Date().toLocaleString('zh-CN') + '          ║');
  console.log('╚══════════════════════════════════════╝');

  // 读取环境变量（兼容青龙面板多种变量名）
  var envCookie =
    process.env.GITCODE_COOKIE ||
    process.env.gitcode_cookie ||
    '';

  if (!envCookie || envCookie.trim().length === 0) {
    console.log('');
    console.log('[错误] 未检测到环境变量 GITCODE_COOKIE');
    console.log('');
    console.log('请在青龙面板「环境变量」页面添加:');
    console.log('  名称: GITCODE_COOKIE');
    console.log('  值:   GitCode 的 Cookie / Token');
    console.log('');
    console.log('支持以下格式（自动识别）：');
    console.log('  1. 完整 Cookie 字符串（推荐，支持每日任务 + 自动刷新）：');
    console.log('     uuid_tt_dd=...; GITCODE_ACCESS_TOKEN=eyJ...; GITCODE_REFRESH_TOKEN=eyJ...; HWWAFSESID=...; ...');
    console.log('  2. access_token|refresh_token（竖线分隔，仅签到）');
    console.log('  3. 纯 access_token 或 Bearer access_token（旧版兼容，仅签到）');
    console.log('');
    console.log('获取方式（推荐完整 Cookie 串）：');
    console.log('  1. 浏览器打开 gitcode.com 并登录');
    console.log('  2. 按 F12 打开开发者工具 → Application → Cookies');
    console.log('  3. 复制 GITCODE_ACCESS_TOKEN 和 GITCODE_REFRESH_TOKEN 的值');
    console.log('  4. 或直接复制完整 Cookie 串粘贴到环境变量中');
    console.log('  5. 确保包含 WAF Cookie（HWWAFSESID 等），否则查看项目/Star 无法执行');
    console.log('     （文件更新不需要 WAF Cookie，始终可用）');
    console.log('');
    console.log('可选环境变量：');
    console.log('  GITCODE_PROJECT_ID: 用于查看/Star/GET commits 的项目ID，默认 10397774');
    console.log('    支持多个（用 & 或换行分隔），每天轮换使用');
    console.log('  GITCODE_REPO: 要更新文件的仓库（owner/repo 格式，如 QQ111QQ/codex）');
    console.log('    未配置时跳过文件更新；支持多账号（用 & 或换行分隔）');
    console.log('    文件更新不需要 WAF Cookie，比 Star/查看项目更可靠');
    console.log('');
    console.log('多账号: 用 & 或换行符分隔');
    return;
  }

  // 拆分多账号
  var accountStrs = splitMultiAccount(envCookie);
  if (accountStrs.length === 0) {
    console.log('[错误] 环境变量内容为空');
    return;
  }

  // 读取项目 ID 列表
  var projectIds = getProjectIds();

  // 读取仓库列表（V4 新增）
  var repos = getRepos();

  console.log('');
  console.log('检测到 ' + accountStrs.length + ' 个账号');
  console.log('项目ID: ' + projectIds.join(', ') + (projectIds.length > 1 ? '（轮换使用）' : ''));
  if (repos.length > 0) {
    console.log('仓库: ' + repos.join(', '));
  } else {
    console.log('仓库: 未配置 GITCODE_REPO（跳过文件更新）');
  }

  // 逐个处理账号
  var successCount = 0;
  var failCount = 0;

  for (var i = 0; i < accountStrs.length; i++) {
    var auth = parseAuthToken(accountStrs[i]);
    if (!auth) {
      console.log('\n┌─ 账号' + (i + 1) + ': [解析失败] ─────────────────┐');
      console.log('  [错误] 无法解析 Token，请检查格式');
      failCount++;
      continue;
    }

    // 为当前账号选择项目 ID
    var projectId = selectProjectId(projectIds, i + 1);

    // 为当前账号选择仓库（V4 新增，按索引一一对应）
    var repo = repos[i] || '';

    try {
      var ok = await processAccount(auth, i + 1, projectId, repo);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      console.log('  [错误] 账号处理异常: ' + e.message);
      failCount++;
    }

    // 多账号之间间隔 2 秒，避免请求过快
    if (i < accountStrs.length - 1) {
      console.log('\n  等待 2 秒后处理下一个账号...');
      await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }
  }

  // 汇总
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   执行完毕 ✅                        ║');
  console.log('║   成功: ' + successCount + '  失败: ' + failCount + '                         ║');
  console.log('║   ' + new Date().toLocaleString('zh-CN') + '          ║');
  console.log('╚══════════════════════════════════════╝');
}

// 执行主函数
main().catch(function (err) {
  console.log('[致命错误] 脚本执行异常: ' + err.message);
  console.log(err.stack);
  process.exit(1);
});
