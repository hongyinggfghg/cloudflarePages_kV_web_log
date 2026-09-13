# cloudflarePages_kV_web_log

一个**纯静态、零构建、零框架、零成本**的无服务器博客：前端是普通 HTML/CSS/JS，后端是 Cloudflare Pages Functions，数据全部存在 Cloudflare Workers KV 里。文章通过自带的发布后台在线写作，不需要数据库、不需要本地环境。

> 作者：红云（sunset_red） Powered by Cloudflare Pages + Workers KV· + z.ai GLM-5.3




## ✨ 功能特性

- **单页应用**：hash 路由，`#/` 首页、`#/archive` 归档、`#/about` 关于、`#/post/:id` 文章页
- **KV 驱动**：文章与时间线存于 Workers KV，后台一键发布/编辑/删除/备份
- **Material Design 3 风格**：亮/暗双主题，View Transition 圆形扩散切换动画
- **全文搜索**：标题/摘要/标签匹配、命中高亮、`/` 快捷键、分类 chips 过滤、标签云
- **文章页**：h2/h3 自动生成目录 + 滚动高亮、顶部阅读进度条、代码卡片一键复制、上一篇/下一篇
- **互动**：喜欢、收藏、分享复制链接（存于浏览器 localStorage）
- **统计**：文章数、总字数、最近更新时间、建站天数、热门文章 Top4（按热度）
- **响应式**：桌面侧边导航栏（nav rail）/ 移动端底部导航栏
- **离线兜底**：KV 加载失败或本地 `file://` 打开时，自动使用 `script.js` 内置的演示文章

## 🏗️ 架构

```
浏览器
 ├── 静态资源：index.html / style.css / script.js   ← Cloudflare Pages
 ├── 数据请求：
 │    GET    /api/posts            ┐
 │    POST   /api/post             │
 │    DELETE /api/post?id=xxx      ├─ Pages Functions  ──►  Workers KV (BLOG_KV)
 │    GET    /api/timeline         │   (functions/api)      ├─ 键 posts    ：文章数组
 │    POST   /api/timeline         │                        └─ 键 timeline ：时间线数组
 │    PUT    /api/timeline         │
 │    DELETE /api/timeline?i=xxx   ┘
 └── 图床：
      POST   /api/upload           ┐  上传（multipart 字段 file，或图片二进制，兼容 PicGo / ShareX）
      DELETE /api/upload?key=xxx   ├─ Pages Functions  ──►  R2 存储桶 (IMG_R2)
      GET    /api/images           │   (functions/api)      └─ 键 img/年/月/时间戳-随机串.ext
      GET    /images/*             ┘   (functions/images)     从 R2 读图返回（隐藏 R2 原始域名，强缓存）
```

## 🖼️ 图床（R2）

- **存储**：图片存 R2 桶（绑定变量名 `IMG_R2`），键形如 `img/2026/09/xxxx.jpg`（按月归档，不含原始文件名）。
- **上传**：admin.html 图床卡片支持点击选择 / 拖拽 / Ctrl+V 粘贴（截图直接粘贴即可自动上传并插入正文）；第三方工具走 `/api/upload`，支持 multipart（字段 `file`）和原始二进制两种请求体，鉴权可用 `X-Admin-Token` / `Authorization: Bearer` / `?token=`。
- **访问**：默认经 `/images/<key>` 从 R2 读取（永久强缓存 + CSP 沙箱防 SVG 夹带脚本），自动隐藏 R2 原始域名；若想用自定义 CDN 域名，把环境变量 `IMG_CDN_URL` 设为 `https://img.你的域名`，上传返回的外链会直接指向它。
- **单张上限 20MB**，支持 jpg / png / gif / webp / avif / bmp / ico。 (R2 使用需要银行卡可选择不使用R2)


PicGo（自定义 Web 图床）：

```
API 地址   https://你的域名/api/upload
请求方式   POST
表单字段   file（文件字段）
请求头     X-Admin-Token: 你的发布密码
URL 后缀   data.url
```

ShareX（自定义上传器）：Method `POST`，URL `https://你的域名/api/upload`，Header `X-Admin-Token=密码`，Body 选 Form (Multipart)，文件字段名 `file`。

## 📁 目录结构

```
.
├── index.html          # 博客前端（单页应用）
├── script.js           # 前端逻辑：路由、渲染、搜索、主题等（顶部含内置演示文章）
├── style.css           # Material Design 3 风格样式
├── admin.html          # 发布后台：写文章 / 图床管理 / 管理时间线 / 一键备份
├── functions/
│   ├── api/
│   │   ├── posts.js    # GET    /api/posts     读取全部文章
│   │   ├── post.js     # POST   /api/post      新建 / 覆盖更新（同 id）
│   │   │               # DELETE /api/post?id=  删除文章
│   │   ├── timeline.js # /api/timeline 的 GET / POST / PUT / DELETE
│   │   ├── upload.js   # POST   /api/upload    上传图片到 R2
│   │   │               # DELETE /api/upload?key= 删除图片
│   │   └── images.js   # GET    /api/images    列出图床图片
│   └── images/
│       └── [[path]].js # GET    /images/*      从 R2 读图返回（访问层）
└── 1788…a2.jpg         # 头像 / favicon（根目录引用）
```

## 🚀 部署到 Cloudflare Pages

### 1. 创建 KV 命名空间与 R2 图床桶

Dashboard → Workers & Pages → KV → Create namespace，命名如 `BLOG_KV`。
（命令行方式：`npx wrangler kv namespace create BLOG_KV`）

图床再建一个 R2 桶：Dashboard → R2 → Create bucket，命名如 `blog-img`（首次需开通 R2，免费额度 10GB 存储，足够图床用）。
（命令行方式：`npx wrangler r2 bucket create blog-img`）

### 2. 创建 Pages 项目

二选一：

- **连接 Git 仓库**：Build command 留空，构建输出目录填 `/`（根目录就是全部静态资源）；
- **命令行直传**：`npx wrangler pages deploy .`

### 3. 绑定 KV、R2 与设置密码

| 设置项 | 位置 | 值 |
|---|---|---|
| KV namespace binding | 项目 Settings → Bindings / Functions | 变量名 `BLOG_KV` → 选择第 1 步的命名空间 |
| R2 bucket binding | 项目 Settings → Bindings / Functions | 变量名 `IMG_R2` → 选择第 1 步的 `blog-img` 桶 |
| 环境变量 `ADMIN_TOKEN` | 项目 Settings → Environment variables | 你的发布密码（**生产与预览环境都设置**） |
| 环境变量 `IMG_CDN_URL`（可选） | 项目 Settings → Environment variables | 绑定到 R2 桶的自定义域名，如 `https://img.你的域名`（不填则走本站 `/images/`） |

Functions 目录会被 Pages 自动识别，无需任何构建配置。

### 4. 开始写作

访问 `https://你的域名/admin.html`，填入发布密码即可发布文章；图床卡片可直接传图，PicGo / ShareX 对接见上文「图床（R2）」。

### 本地开发

```bash
npx wrangler pages dev . --kv BLOG_KV --r2 IMG_R2 --binding ADMIN_TOKEN=本地测试密码
```

会同时模拟 Functions 与本地 KV。直接双击 `index.html`（`file://` 协议）也可以看，此时自动使用内置演示文章。

## 📝 文章数据结构（表示方法之一）

所有文章以 JSON 数组存于 KV 的 `posts` 键中，按 `date` 倒序排列。单篇文章的字段如下：

```json
{
  "id": "hello",
  "title": "hello",
  "excerpt": "你看到这个时kv容器已经死了",
  "category": "前端",
  "tags": ["Workers", "KV", "前端"],
  "date": "2026-08-20",
  "content": "<h2>你好</h2><p>正文是一段 HTML。</p>",
  "heat": 51,
  "featured": true,
  "seed": "kvblog",
  "cover": "https://example.com/my-cover.jpg"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|:---:|---|
| `id` | string | ✅ | 英文 ID，用作网址 `#/post/:id`；**同 id 再次发布 = 覆盖更新** |
| `title` | string | ✅ | 标题 |
| `content` | string | ✅ | 正文 **HTML 字符串**，写法见下一节 |
| `date` | string | ✅ | `YYYY-MM-DD`，排序与归档的依据 |
| `category` | string |  | 分类，内置 `前端` / `生活` / `game` |
| `excerpt` | string |  | 摘要；**留空自动截取正文纯文本前 60 字** |
| `tags` | string[] |  | 标签数组（后台用逗号分隔输入）；空则自动为 `["未分类"]` |
| `heat` | number |  | 热度，侧栏"热门文章"排序用，默认 20；喜欢数基数 = heat ÷ 5 |
| `featured` | boolean |  | `true` 时置顶为首页大卡片 |
| `seed` | string |  | 封面种子，同一 seed 生成的封面固定不变；留空用 `id` |
| `cover` | string |  | 自定义封面图 URL（后台“封面图片”输入框设置：可上传到 R2 图床或填任意外链；留空按分类自动生成），用于首页文章卡片与置顶大卡片 |

**封面规则**：未指定 `cover` 时，按分类关键词自动取图（`前端`→computer,keyboard；`生活`→city,nature；`game`→game,military），来自 loremflickr.com，用 `seed` 保证同一篇文章每次封面相同；指定了 `cover`（如自建 R2 图床外链 `/images/img/…`）则直接使用它。封面只出现在首页列表卡片与置顶大卡片上，文章详情页不显示封面。

## ✍️ 正文 HTML 表示方法（写作语法）

`content` 就是一段 HTML。后台编辑器上方的"插入"按钮可以快速包裹选中文字；全部支持的写法如下。

### 1. 标题（自动进目录）

```html
<h2>二级标题</h2>
<h3>三级标题</h3>
```

`h2` / `h3` 会被自动收集进文章右侧的"目录"，支持点击跳转与滚动高亮。

### 2. 段落与加粗

```html
<p>这是一个普通段落。</p>
<p>这句话里有一个<strong>加粗的重点</strong>。</p>
```

### 3. 行内代码

```html
<p>在终端执行 <code>npm install</code> 即可。</p>
```

### 4. 代码块（免转义，任意语言）

```html
<pre data-lang="js"><code>const ok = 1 < 2 && 3 > 2;
console.log(ok);</code></pre>
```

- `data-lang` 会显示在代码卡片左上角，缺省为 `text`；
- **任何语言的 `<`、`>`、`&`、引号直接原样粘贴即可**，前端会统一按纯文本渲染，不需要写成 `&lt;`；
- 渲染后自动套上带"复制"按钮的代码卡片。

### 5. 引用

```html
<blockquote>这是一段引用的文字。</blockquote>
```

### 6. 无序列表

```html
<ul>
  <li>条目一</li>
  <li>条目二</li>
</ul>
```

### 7. 图片（带说明的 figure）

```html
<figure>
  <img src="https://example.com/pic.jpg" alt="图片说明" loading="lazy">
  <figcaption>图片下方的说明文字</figcaption>
</figure>
```

### 8. 链接

```html
<a href="https://example.com" target="_blank" rel="noopener">链接文字</a>
```

### 完整示例

一篇可以直接粘进后台"正文"框的文章：

```html
<h2>为什么选 Workers KV</h2>
<p>因为<strong>免费</strong>，而且离用户近。</p>
<p>创建命名空间只要一行命令：</p>
<pre data-lang="bash"><code>npx wrangler kv namespace create BLOG_KV</code></pre>
<blockquote>免费额度：每天 10 万次读、1000 次写。</blockquote>
<ul>
  <li>无服务器，没有冷启动负担</li>
  <li>数据缓存在全球边缘节点</li>
</ul>
<figure>
  <img src="https://loremflickr.com/900/600/landscape?lock=1" alt="配图" loading="lazy">
  <figcaption>一张风景配图</figcaption>
</figure>
```

### 字数与阅读时长的统计规则

- 字数 = 正文去除全部标签与空白后的字符数；
- 阅读时长 ≈ 字数 ÷ 400 字/分钟（最少 1 分钟）；
- 摘要留空时，自动取正文纯文本前 60 字。

## 🕰️ 时间线数据结构

存于 KV 的 `timeline` 键，JSON 数组，显示在"关于"页：

```json
[
  { "date": "2026-08-16", "text": "建站" },
  { "date": "2026-09-10", "text": "第一次用 curl 发文" }
]
```

## 🔌 API 参考

所有接口返回 JSON，且开启 CORS（`Access-Control-Allow-Origin: *`）。写操作需要请求头 `X-Admin-Token`，值必须与服务端环境变量 `ADMIN_TOKEN` 一致。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|:---:|---|
| GET | `/api/posts` | 无 | 返回全部文章数组 |
| POST | `/api/post` | ✅ | 新建文章；body 中带已有 `id` 则覆盖更新 |
| DELETE | `/api/post?id=xxx` | ✅ | 删除指定文章 |
| GET | `/api/timeline` | 无 | 返回时间线数组 |
| POST | `/api/timeline` | ✅ | 追加一条，body：`{"date":"…","text":"…"}` |
| PUT | `/api/timeline` | ✅ | 修改第 i 条，body：`{"i":0,"date":"…","text":"…"}` |
| DELETE | `/api/timeline?i=2` | ✅ | 按索引删除一条 |
| POST | `/api/upload` | ✅ | 上传图片到 R2：multipart 字段 `file`，或直接发图片二进制（ShareX）；返回 `{url, key, size}` |
| DELETE | `/api/upload?key=img/…` | ✅ | 删除指定图片 |
| GET | `/api/images` | ✅ | 列出图床图片（游标分页：单页最多 1000 条，带 `?cursor=` 翻页，返回 `{images, truncated, cursor}`） |
| GET | `/images/<key>` | 无 | 读取图片（访问层，强缓存；此路径公开，等于图片外链） |

错误码：`401` 密码错误、`400` 缺字段或非法 JSON、`404` 文章/条目不存在。

## 🛠️ 发布后台 admin.html 使用指南

- **连接**：API 地址留空会自动填当前站点；填入 `ADMIN_TOKEN` 后点"测试连接"。可勾选"记住密码"（只存在本浏览器 localStorage，页面上不含任何密码，可放心公开部署）。
- **发布**：文章 ID、标题、正文三项必填；同 ID 发布即覆盖更新；`Ctrl+Enter` 快速发布；支持实时预览与字数统计。
- **封面**：表单“封面图片”处可填 URL、点“上传”传到图床自动填入、点“图库”从已上传图片点选；点“恢复默认”即删除自定义封面（回落 loremflickr 自动生成）。
- **编辑**：右侧"云端文章"列表点 ✏️ 载入到表单 → 修改 → 再点"发布文章"。
- **删除**：右侧列表点 🗑️，需确认。
- **时间线**：右侧卡片内追加 / 编辑 / 删除，编辑时"追加"按钮会变成"保存修改"。
- **备份**：一键导出全部文章 + 时间线为 JSON 文件（`hongyun-blog-backup-日期.json`）。

## 🎨 自定义

| 想改什么 | 改哪里 |
|---|---|
| 站点标题 | `index.html` 的 `<title>` / `<meta>`，以及 `script.js` 顶部 `SITE_TITLE` |
| 建站日期（关于页"建站天数"） | `script.js` 的 `SITE_START` |
| 分类下拉选项 | `admin.html` 的 `<select id="pCat">` |
| 分类图标 / 封面关键词 | `script.js` 的 `CATEGORY_ICON` 和 `CAT_IMG` |
| 离线兜底演示文章 | `script.js` 顶部内置 `POSTS` 数组 |
| 头像 / favicon | 替换根目录 jpg 并全局替换文件名 |
| 关于页文案、社交链接 | `index.html` 的 `view-about` 区块 |

## 🔒 安全说明

- 发布密码只在**运行时**由使用者输入（或存于本浏览器），`admin.html` 本身不含密码，可公开部署；
- 所有写操作（POST/PUT/DELETE）都要求请求头 `X-Admin-Token` 与服务端环境变量 `ADMIN_TOKEN` 一致，前端代码接触不到该变量；
- 读接口公开且 CORS 全开，若不希望文章数据被任意第三方站点读取，可收紧 `functions/api/*.js` 顶部的 `CORS` 常量。

