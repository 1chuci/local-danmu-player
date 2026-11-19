# Local Danmu Player

一个轻量的浏览器本地番剧播放器，为本地视频提供作品匹配、弹幕显示和播放控制功能。

在线体验：<https://local-danmu-player.vercel.app>

发行版与更新日志：<https://github.com/1chuci/local-danmu-player/releases>

项目定位为“本地或 WebDAV 视频 + 在线弹幕”的网页播放器。用户选择的本地视频由浏览器读取，不会上传；WebDAV 视频及其字幕由后端代理读取。

应用只将匹配所需的文件信息发送到后端，用于查找节目、剧集和对应弹幕。

## 功能特性

- 支持拖放或选择本地视频文件
- 支持 MP4、MKV、WebM、AVI、MOV、M4V、TS 等常见格式
- 支持通过 WebDAV 连接网盘并流式播放其中的视频（按英文文件名匹配弹幕）
- 根据文件名、文件大小、视频时长和文件 Hash 匹配节目
- 支持手动搜索作品和剧集
- 支持统一滚动弹幕，并与视频时间、暂停、定位和播放倍速同步
- 支持弹幕开关、透明度、字号、显示区域和速度调整
- 输入 Bilibili BV 号或视频链接后自动加载弹幕，切换分 P 自动更新，也可导入 XML 文件
- 支持 WebDAV 同目录选集和可选自动连播
- 支持提取 MKV 内嵌文字字幕、选择字幕轨道，以及加载本地或 WebDAV 同级外挂字幕
- 支持拖动或点击进度条定位播放位置
- 提供可配置的快速跳转按钮，默认跳过 80 秒
- 支持网页全屏和浏览器全屏
- 支持中文和 English 界面切换
- 自动保存播放进度和播放器设置
- 使用 IndexedDB 缓存弹幕，减少重复请求
- 采用服务端 API 代理，避免在前端暴露应用密钥
- 提供与播放器风格一致的网页图标

## 使用方式

1. 打开播放器网页。
2. 点击“选择视频”，或将视频文件拖入播放器区域。
3. 等待节目匹配完成；如果没有自动匹配结果，可以打开“手动搜索”。
4. 从搜索结果中选择作品和剧集，播放器会加载对应弹幕。
5. 使用底部控制栏调整播放进度、弹幕显示和快速跳转。
6. 可在播放器设置中修改语言、弹幕显示参数、跳过秒数和自动连播。
7. 在“Bilibili 弹幕”面板输入 BV 号或视频链接，点击“获取弹幕”（或按回车）即自动读取视频信息并加载弹幕：BV 号默认第 1 P，链接带 `p=` 时加载指定分 P；之后切换分 P 会自动更新弹幕，无需再次点击加载。也可拖入或导入 XML 弹幕文件。

本地 MKV 视频可点击字幕按钮，按需在浏览器内提取第一条文字字幕轨道；第一次提取需要加载浏览器端 FFmpeg 组件。本地视频内容不会上传。WebDAV 视频可在字幕菜单中扫描并选择内嵌文字字幕轨道，或选择同目录、文件名前缀匹配的 ASS、SSA、SRT、VTT 外挂字幕；该过程由后端代理读取网盘数据。ASS/SSA 以纯文字显示，不保留完整排版和特效。PGS 等图像字幕轨道暂不支持。

未配置服务端密钥时，播放器仍可以读取本地视频，并显示内置示例弹幕；配置完成后可以使用实时匹配和弹幕接口。

## 播放器快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `←` / `→` | 后退 / 前进 5 秒 |
| `J` / `L` | 后退 / 前进 10 秒 |
| `K` | 播放 / 暂停 |
| `F` | 浏览器全屏 |
| `W` | 网页全屏 |
| `M` | 显示 / 隐藏弹幕 |
| `Home` | 跳到视频开头 |
| `End` | 跳到视频结尾 |
| `Esc` | 退出全屏或关闭设置 |

浏览器只会读取用户主动选择的视频文件。关闭网页后，播放记录、播放器设置和弹幕缓存仍保存在当前浏览器中。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- npm 10 或更高版本

安装依赖：

```powershell
npm install
```

启动开发环境：

```powershell
npm run dev
```

开发服务器启动后，访问：

```text
http://localhost:5173
```

## 生产构建

构建前端：

```powershell
npm run build
```

启动生产服务：

```powershell
node --env-file=.env server/index.mjs
```

默认服务地址：

```text
http://localhost:8787
```

## 环境变量

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

服务端支持以下变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DANDANPLAY_APP_ID` | 是 | 弹幕服务应用标识 |
| `DANDANPLAY_APP_SECRET` | 是 | 弹幕服务应用密钥 |
| `PORT` | 否 | 服务端端口，默认 `8787` |

应用密钥只应配置在服务端环境变量中，不要写入前端代码、提交到 Git 仓库或发布到静态资源目录。

## WebDAV 播放

点击选择区的“打开网盘”按钮或播放器工具栏的云朵按钮，在弹窗中输入 WebDAV 地址、用户名和密码即可连接网盘、浏览目录并直接播放视频。

- WebDAV 地址、用户名和密码保存在当前浏览器的 localStorage 中，不会写入 `.env`。同一浏览器配置文件的其他使用者或同源脚本可能读取这些信息，不建议在公共设备上保存凭据。
- 连接时凭据会发送到当前播放器后端，后端在内存中保存凭据与随机访问令牌的对应关系（24 小时过期），用于代理目录、视频和字幕请求，凭据本身不落盘。不同连接使用独立令牌；持有令牌即可访问该连接，请勿分享带令牌的链接。远程部署请使用 HTTPS，并仅连接可信后端。
- 弹幕匹配使用文件英文名，无需上传文件内容。
- 播放依赖浏览器对视频格式的原生支持；MP4 支持最佳（可拖动进度、可读取时长），MKV 等容器视浏览器而定。
- 当前 WebDAV 实现依赖单进程内存会话与长时间视频/字幕请求，适用于本地或自建常驻 Node 服务；不保证在 Vercel Serverless 环境中可用。

## API 代理

后端只提供播放器所需的接口代理：

```text
GET  /api/config
POST /api/dandanplay/match
GET  /api/dandanplay/search?anime=...
GET  /api/dandanplay/comments/:episodeId
GET  /api/bilibili/video?bvid=...
GET  /api/bilibili/comments?bvid=...&page=...
POST /api/webdav/authorize
GET  /api/webdav/list?token=...&path=...
GET  /api/webdav/stream?token=...&path=...
GET  /api/webdav/subtitle-tracks?token=...&path=...
GET  /api/webdav/subtitle?token=...&path=...&track=...
GET  /api/webdav/subtitle-files?token=...&path=...
GET  /api/webdav/subtitle-file?token=...&path=...
POST /api/webdav/match
```

后端负责生成请求签名并转发到弹幕服务，前端不会接触应用密钥。

应用使用的上游接口包括：

- `POST /api/v2/match`
- `GET /api/v2/search/episodes`
- `GET /api/v2/comment/{episodeId}`

弹幕数据默认在浏览器本地缓存 6 小时。缓存只用于改善加载速度，不会上传到第三方服务。

## 在线体验与 Vercel 部署

在线体验地址：

```text
https://local-danmu-player.vercel.app
```

项目已包含 `vercel.json`、Vercel Functions 入口和 `public/favicon.svg`，可以直接导入 Vercel 部署。

当前 API 函数入口包括：

```text
api/config.mjs
api/dandanplay/match.mjs
api/dandanplay/search.mjs
api/dandanplay/comments/[episodeId].mjs
api/bilibili/video.mjs
api/bilibili/comments.mjs
```

在 Vercel 中导入 GitHub 仓库后使用以下构建配置：

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

如果需要启用实时匹配和弹幕接口，在 Vercel 项目的环境变量中配置：

```text
DANDANPLAY_APP_ID
DANDANPLAY_APP_SECRET
```

环境变量修改后需要重新部署，使新的服务端配置生效。

### 请求失败排查

项目使用的弹弹play API 地址是 `https://api.dandanplay.net`，无需额外填写 API 地址。可以按下面顺序检查：

1. 启动本地项目后访问 `http://localhost:5173/api/config`，确认返回 `{"dandanplayConfigured":true}`。
2. 如果仍是演示模式，关闭旧的开发服务后重新运行 `npm run dev`，确保 Node 使用了 `.env` 文件。
3. 如果返回 `无法连接弹弹play API`，请检查本机网络、代理软件和防火墙是否允许 Node.js 访问 `api.dandanplay.net`。
4. 如果部署在 Vercel，请在项目的 Production、Preview 环境分别配置 `DANDANPLAY_APP_ID` 和 `DANDANPLAY_APP_SECRET`，然后重新部署。

服务端只会返回连接错误或上游错误状态，不会在日志和响应中输出应用密钥。

## 隐私与数据处理

- 用户选择的本地视频文件只在浏览器内读取和播放
- 文件 Hash 只用于节目匹配
- 播放进度、播放器设置和语言选择保存在浏览器本地
- 弹幕缓存保存在浏览器 IndexedDB
- 本地视频不上传；WebDAV 视频由后端代理读取。内嵌字幕提取通常按 Range 读取，不支持 Range 或超出读取预算时可能临时下载完整视频，处理结束后清理临时文件
- 应用密钥不写入前端资源

## 项目结构

```text
local-danmu-player/
├── api/                    # Vercel Function 入口
├── public/                 # 网页图标等静态资源
├── server/                 # 本地生产服务和 API 代理
├── src/
│   ├── components/         # Vue 组件
│   └── lib/                # API、弹幕解析、本地化和本地存储
├── index.html
├── package.json
├── vercel.json
└── vite.config.ts
```

## 开发命令

```powershell
npm run dev      # 启动前端和本地 API
npm run build    # 构建生产版本
npm run preview  # 预览前端构建结果
npm test         # 运行测试
```

## 使用说明

本项目提供本地视频播放、文件识别和弹幕展示能力。使用者应遵守所在地区的法律法规、视频内容授权要求以及相关开放接口的使用规范。
