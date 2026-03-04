# 个人工具收集平台

轻量级、现代化的工具收集展示平台：静态 JSON 存储，卡片式展示，支持搜索与标签分类，并提供数据统计。

## 本地运行

1) 安装依赖

`npm install`

2) 启动开发服务

`npm run dev`

1) 构建产物

`npm run build`

1) 本地预览

`npm run preview`

## 数据结构

数据文件位于 `public/data.json`，前端会读取其中的数组元素。

已兼容字段：
- `name` (必填)
- `url` (必填)
- `description` (可选)
- `tags` (可选 string[])
- `categories` (可选 string[])
- `month` (可选，格式建议 yyyymm，如 202603)
- `Platform` / `platform` (可选 string[])

## 部署说明

这是一个纯静态站点：
- Build Command：`npm run build`
- Output Directory：`dist`
