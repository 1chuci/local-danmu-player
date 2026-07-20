# Local Danmu Player

一个轻量的浏览器本地番剧播放器，为本地视频提供作品匹配、弹幕显示和播放控制功能。

在线体验：<https://local-danmu-player.vercel.app>

项目定位为“本地视频 + 在线弹幕”的网页播放器。视频文件始终由浏览器本地读取和播放，不会上传到服务器。

应用只将匹配所需的文件信息发送到后端，用于查找节目、剧集和对应弹幕。

## 功能特性

- 支持拖放或选择本地视频文件
- 支持 MP4、MKV、WebM、AVI、MOV、M4V、TS 等常见格式
- 根据文件名、文件大小、视频时长和文件 Hash 匹配节目
- 支持手动搜索作品和剧集
- 支持滚动弹幕、顶部弹幕和底部弹幕
- 支持弹幕开关、透明度、字号和速度调整
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
6. 打开设置可以修改语言、弹幕透明度、字体大小和跳过秒数。

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

## API 代理

后端只提供播放器所需的接口代理：

```text
GET  /api/config
POST /api/dandanplay/match
GET  /api/dandanplay/search?anime=...
GET  /api/dandanplay/comments/:episodeId
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

- 视频文件只在浏览器本地读取和播放
- 文件 Hash 只用于节目匹配
- 播放进度、播放器设置和语言选择保存在浏览器本地
- 弹幕缓存保存在浏览器 IndexedDB
- 服务端不保存用户的视频文件
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
