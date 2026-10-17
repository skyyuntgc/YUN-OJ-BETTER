# Yun OJ Better

**Yun OJ Better** 是一款通用的在线评测系统（OJ）增强用户脚本。它集成了 AI 解答、多源原题搜索、自定义翻译、样例一键复制等功能，旨在为你提供更丝滑的刷题体验。

## ✨ 核心功能

*   **🤖 AI 解答**：内置 AI 对话面板，支持流式输出、思考过程展示（Reasoning Content）、KaTeX 公式渲染、代码高亮与一键复制。支持多套 AI 配置无缝切换（兼容所有 OpenAI 格式接口，如 DeepSeek、智谱 GLM 等）。
*   **🌐 自动翻译**：支持一键翻译外文题面。内置 Google、MyMemory 翻译源，并**支持自定义翻译 API**（可接入大模型 API 进行高质量翻译）。
*   **🔍 原题搜索**：一键提取题面或选中文字，搜索原题出处。支持原题机、洛谷，以及智谱联网搜索（内置标准、进阶、夸克、搜狗引擎）。
*   **📋 题面与样例操作**：一键复制清洗后的纯文本题面；自动识别并生成「复制输入」和「复制输出」按钮。
*   **🎯 多 OJ 适配**：内置洛谷、Codeforces、AtCoder、VJudge、QOJ、Hydro 等 20+ 主流 OJ 的页面解析规则。
*   **🪄 高度自定义**：所有悬浮面板均可拖动并记忆位置；支持深色模式；支持手动配置未知 OJ 域名；脚本头部已开启 `@connect *`，方便接入各类第三方 API。

## 🚀 安装指南

1. 首先，请确保你的浏览器已经安装了用户脚本管理器：
   *   [Tampermonkey](https://www.tampermonkey.net/) (推荐)
   *   [Violentmonkey](https://violentmonkey.github.io/)
2. 点击下方的链接一键安装脚本：
   *   👉 **[点击这里安装 Yun OJ Better](https://raw.githubusercontent.com/skyyuntgc/YUN-OJ-BETTER/main/YunOJBetter.user.js)**
   *(注：请将上方链接中的 `YunOJBetter.user.js` 替换为你仓库中实际的脚本文件名)*

## ⚙️ 配置说明

安装完成后，打开任意 OJ 题目页面，点击右下角的 **⚙** 图标进入设置。

### 1. 配置 AI 解答
点击 **AI 设置**，你可以添加多套配置。以下是一些常用的免费/低成本 API 配置示例：

**智谱 GLM（推荐，免费额度高）**
*   **API 地址**：`https://open.bigmodel.cn/api/paas/v4`
*   **API Key**：在智谱开放平台申请
*   **模型**：`glm-4-flash` 或 `glm-5.2`

**DeepSeek 官方**
*   **API 地址**：`https://api.deepseek.com/v1`
*   **API Key**：在 DeepSeek 开放平台申请
*   **模型**：`deepseek-chat` 或 `deepseek-reasoner`

### 2. 配置自定义翻译
如果遇到内置翻译源限流（如 `MyMemory HTTP 429`），你可以点击 **翻译设置**，将引擎切换为 **自定义 API 接口**，利用大模型来翻译。
*   **请求 URL**：`https://api.openai.com/v1/chat/completions`
*   **请求体**：`{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Translate to {{target}} and only output the translation:\n\n{{text}}"}]}`
*   **响应提取路径**：`choices[0].message.content`

## 🛠️ 开发与反馈

*   项目作者：[SkyYun]
*   如果你在使用中遇到 Bug 或有新功能建议，欢迎提交 [Issue](https://github.com/skyyuntgc/YUN-OJ-BETTER/issues)。
*   如果你喜欢这个项目，欢迎点个 ⭐ **Star**！

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。