# 🏸 羽毛球AI教练

基于 MediaPipe Pose Landmarker 的羽毛球动作分析与等级评估应用。

## 功能

- 🎥 **视频上传分析** — 上传挥拍视频，逐帧姿态检测 + 综合评分
- 📷 **实时摄像头** — CameraX 原生摄像头采集，实时骨架叠加（仅 Android）
- 🏃 **30 种羽毛球动作库** — 高远球、杀球、吊球、网前球等
- 📊 **综合等级评估** — 动作感知动态权重评分 + 间帧指标
- 🏆 **24 项成就系统** — 训练次数/时长/技术/体能/实战/成长
- 📅 **每日打卡签到** — 打卡日历 + 连续天数徽章
- 📈 **趋势图表** — Chart.js 雷达图 + 评分趋势折线图
- 📋 **技能清单** — 25 项技能 pass/fail 评估
- 📄 **PDF 报告导出** — 含等级徽章、维度评分、骨架对比、诊断建议
- 🎉 **撒花庆祝动画** — 升级/解锁成就时触发的粒子动画

## 技术栈

- **姿态检测**: MediaPipe Pose Landmarker (CDN: jsDelivr)
- **图表**: Chart.js
- **PDF**: html2canvas + jsPDF
- **数据库**: IndexedDB + localStorage
- **移动端**: Capacitor 6 + Android CameraX (Java)
- **前端**: 原生 HTML/CSS/JS (ES Modules)

## 构建 APK

```bash
npm install
npx cap sync android
cd android
export ANDROID_HOME="C:/Android"
./gradlew assembleRelease
```

APK 输出位置: `android/app/build/outputs/apk/release/app-release.apk`

## 项目结构

```
BadmintonCoachApp/
├── www/index.html      # 主应用（单体 HTML，嵌入 MediaPipe 模型）
├── android/            # Capacitor Android 项目（含 CameraX 原生插件）
├── capacitor.config.json
├── package.json
└── README.md
```

## License

MIT
