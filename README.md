# LinguaDesk · 网页翻译工作台

纯前端（零部署）翻译工具：自定义多翻译引擎 · 翻译记忆库/语料库（TMX/CSV）· 语音实时字幕。
适合个人翻译/口译辅助使用，中英互译为主。

## 运行方式

ES Module + IndexedDB **必须通过本地服务器打开**（直接双击 `index.html` 会因 CORS 无法加载模块）。

```bash
cd translator
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765
```

> 任何静态服务器均可（VS Code Live Server、npx serve 等）。

## 功能一览

| 模块 | 说明 |
|------|------|
| API 设置 | 增删翻译引擎与 ASR 引擎；首次启动自动预置 Google 免费引擎 |
| 翻译 | 中英互译；翻译前自动在记忆库做**模糊匹配**并提示采用；可一键存入记忆库 |
| 翻译记忆库 | 句对积累、搜索、删除；支持 **TMX / CSV 导入导出**（行业标准格式） |
| 语料库 | 参考文本/术语/平行语料管理；支持 CSV 导入导出 |
| 实时字幕 | 麦克风实时识别 + 自动翻译，输出双语字幕 |
| 文件翻译 | 上传 PDF/TXT/MD/DOCX，自动分段翻译，导出双语对照或存记忆库 |
| 导入 / 导出 | 记忆库、语料库、整库 JSON 备份 |

## 翻译引擎配置

在「API 设置」点「+ 添加引擎」，选类型后填参数：

- **OpenAI 兼容**（ChatGPT / DeepSeek / Kimi / 本地 Ollama / Gemini 等）：填 `Base URL` + `模型名` + `API Key`。
  - DeepSeek：`https://api.deepseek.com/v1`，模型 `deepseek-chat`
  - 本地 Ollama：`http://localhost:11434/v1`，模型 `qwen2.5` 等（需 Ollama 开启并允许跨域）
  - Gemini：可用其 OpenAI 兼容端点，或填官方 Key
- **Google 翻译**：免费端点，无需任何配置即可用（适合快速验证）。
- **DeepL / 百度 / 有道 / 讯飞**：填对应 AppID / Key / Secret。

## ⚠️ 关于 CORS（重要）

浏览器直接调用各家 API 可能受跨域（CORS）限制：
- ✅ 通常可用：Google 免费端点、OpenAI/DeepSeek 等官方兼容接口、DeepL
- ⚠️ 可能受限：百度 / 有道 / 讯飞（其服务端未开放浏览器跨域）。若调用失败，可在这些厂商后台配置允许来源，或用一个极轻量的反向代理/浏览器插件（如「允许用户控制 CORS」）中转。

> 个人本机使用推荐：OpenAI 兼容接口（DeepSeek 等便宜稳定）或本地 Ollama。

## 语音实时字幕

- 默认使用浏览器内置 **Web Speech API**（Chrome / Edge 支持最佳，**需 HTTPS 或 localhost**）。
- 「API 设置」里可添加云端 ASR 引擎（配置预留；实时识别主路径仍为浏览器内置，可在后端对接 Whisper/讯飞后启用）。
- 识别语言取「翻译」页的**源语言**。

## 文件翻译

在「文件翻译」页：

1. 选源/目标语言（默认 英→中）+ 选择翻译引擎；
2. 上传 **PDF / TXT / MD / DOCX**，自动提取文本并按段落/换行切分；
3. 点「开始翻译」逐段调用引擎翻译（进度实时显示，译文可手动改）；
4. 导出：
   - **双语对照 HTML**：用浏览器「打印 → 另存为 PDF」即得对照版 PDF；
   - **译文 TXT**：纯译文文本；
   - **存入记忆库**：把每段句对写入翻译记忆库，后续复用。

> PDF 解析用 pdf.js、DOCX 解析用 mammoth，**均通过 CDN 加载，需联网**。

## 数据存储

所有数据存在浏览器 **IndexedDB**（库名 `linguadesk`），不联网、不上传，关掉网页仍在。
换设备/重装浏览器请用「导入/导出 → 导出全部(JSON)」备份迁移。

## 目录结构

```
translator/
├── index.html        界面与标签
├── styles.css        暗色主题样式
├── js/
│   ├── main.js       主逻辑/事件绑定/各视图
│   ├── store.js      IndexedDB 存储层
│   ├── engines.js    翻译引擎适配器（多厂商 + 签名）
│   ├── crypto.js     MD5/SHA256/HMAC 签名
│   ├── match.js      模糊匹配（相似度）
│   ├── tmx.js        TMX/CSV 导入导出
│   ├── speech.js     语音识别封装
│   └── file.js       文件翻译（PDF/DOCX 解析 + 分段翻译 + 导出）
```
