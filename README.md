# Local Danmu Player

一个轻量的浏览器本地视频播放器，为本地视频提供弹幕匹配与显示功能。

视频文件始终由浏览器本地读取和播放，不会上传到服务器。应用只将必要的文件信息发送到后端，用于匹配节目和获取对应弹幕。

## 功能特性

- 支持拖放或选择本地视频文件
- 支持 MP4、MKV、WebM、AVI、MOV、M4V、TS 等常见格式
- 根据文件名、文件大小、视频时长和文件 Hash 匹配节目
- 支持手动搜索作品和剧集
- 支持滚动弹幕、顶部弹幕和底部弹幕
- 支持弹幕开关、透明度、字号和速度调整
- 提供可配置的快速跳转按钮，默认跳过 80 秒
- 自动保存播放进度和播放器设置
- 使用 IndexedDB 缓存弹幕，减少重复请求
- 采用服务端 API 代理，避免在前端暴露应用密钥

## 使用方式

1. 打开播放器网页。
2. 点击选择视频，或将视频文件拖入播放器区域。
3. 等待节目匹配完成。
4. 如果自动匹配结果不正确，可使用“Manual search”手动选择作品和剧集。
5. 使用播放器底部的弹幕开关、快速跳转和播放设置调整观看体验。

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
node server/index.mjs
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

## Vercel 部署

项目已包含 `vercel.json` 和 `api/[...path].mjs`，可以直接导入 Vercel 部署。

构建配置：

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

在 Vercel 项目的环境变量中配置：

```text
DANDANPLAY_APP_ID
DANDANPLAY_APP_SECRET
```

修改环境变量后需要重新部署，使新的服务端配置生效。

## 隐私与数据处理

- 视频文件只在浏览器本地读取和播放
- 文件 Hash 只用于节目匹配
- 播放进度和播放器设置保存在浏览器本地
- 弹幕缓存保存在浏览器 IndexedDB
- 服务端不保存用户的视频文件
- 应用密钥不写入前端资源

## 项目结构

```text
local-danmu-player/
├── api/                    # Vercel Function 入口
├── server/                 # 本地生产服务和 API 代理
├── src/
│   ├── components/         # Vue 组件
│   └── lib/                # API、弹幕解析和本地存储
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

## 许可与使用说明

本项目仅提供播放器、文件识别和弹幕展示能力。使用者应遵守所在地区的法律法规、视频内容授权要求以及相关开放接口的使用规范。
