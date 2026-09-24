import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const deliveryDir = path.join(rootDir, 'delivery');
if (!fs.existsSync(deliveryDir)) {
  fs.mkdirSync(deliveryDir, { recursive: true });
}

const markedJsPath = path.join(rootDir, 'scratch', 'marked.min.js');

const pngPathInDelivery = path.join(deliveryDir, 'Octos_Learn_功能架构全景导图.png');
const pdfPathInDelivery = path.join(deliveryDir, 'Octos_Learn_产品详细功能全景清单.pdf');
const zipPathInDelivery = path.join(deliveryDir, 'Octos_Learn_产品架构与功能全景.zip');

const rootPngPath = path.join(rootDir, 'Octos_Learn_功能架构全景导图.png');
const rootPdfPath = path.join(rootDir, 'Octos_Learn_产品详细功能全景清单.pdf');
const rootZipPath = path.join(rootDir, 'Octos_Learn_产品架构与功能全景.zip');

// HTML Template matching Octos Learn's signature "Warm Parchment / Deep Sea Pine / Ivory Obsidian" aesthetic
const infographicHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Octos Learn 功能架构全景导图</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #f7f4ec; /* Octos Learn signature warm parchment */
      font-family: "Inter Variable", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", -apple-system, sans-serif;
      padding: 32px 36px;
      color: #243b40; /* Octos Learn deep slate text */
    }

    .canvas-container {
      width: 1360px;
      margin: 0 auto;
      background: #fffef9; /* Warm ivory card background */
      border: 1px solid rgba(40, 65, 67, 0.16);
      border-radius: 18px;
      padding: 30px 34px;
      box-shadow: 0 10px 32px rgba(36, 59, 64, 0.07);
    }

    /* Header Banner - Octos Learn Deep Sea Pine */
    .header-banner {
      background: linear-gradient(135deg, #166a79 0%, #105664 100%);
      border-radius: 14px;
      padding: 22px 28px;
      color: #ffffff;
      margin-bottom: 22px;
      box-shadow: 0 6px 18px rgba(22, 106, 121, 0.22);
    }
    .header-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .header-title {
      font-size: 25px;
      font-weight: 750;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-tagline {
      font-family: "JetBrains Mono Variable", monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      background: rgba(0, 0, 0, 0.20);
      border: 1px solid rgba(255, 255, 255, 0.32);
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 600;
      color: #ffffff;
    }
    .header-pillars {
      display: grid;
      grid-template-columns: 1fr 1.35fr 1fr;
      gap: 12px;
    }
    .pillar-item {
      background: rgba(0, 0, 0, 0.16);
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 9px;
      padding: 10px 14px;
      font-size: 11.5px;
      line-height: 1.55;
      color: rgba(255, 255, 255, 0.88);
    }
    .pillar-item strong {
      color: #ffffff;
      display: block;
      font-size: 13px;
      margin-bottom: 3px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    /* Grid Layout: 2 Columns + Wide Bottom */
    .modules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-bottom: 18px;
    }

    .module-card {
      background: #ffffff;
      border: 1px solid #e3e0d8;
      border-radius: 13px;
      padding: 18px 20px;
      box-shadow: 0 3px 10px rgba(46, 53, 44, 0.04);
      display: flex;
      flex-direction: column;
    }

    .module-card.span-2 {
      grid-column: span 2;
    }

    .module-header {
      display: flex;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 9px;
      border-bottom: 1.5px solid #ece7dc;
    }
    .module-badge {
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      background: #166a79; /* Teal */
      padding: 3px 8px;
      border-radius: 6px;
      margin-right: 9px;
      font-family: "JetBrains Mono Variable", monospace;
      letter-spacing: 0.05em;
    }
    .module-card.engine .module-badge { background: #b87a4a; } /* Warm Caramel / Amber */
    .module-card.packs .module-badge { background: #4a7c59; }  /* Warm Pine Green */
    .module-card.memory .module-badge { background: #ba533a; } /* Terracotta */
    .module-card.devices .module-badge { background: #2b5b66; }/* Slate Teal */

    .module-title {
      font-size: 16px;
      font-weight: 700;
      color: #243b40;
    }

    .module-sections {
      display: flex;
      flex-direction: column;
      gap: 11px;
      flex: 1;
    }

    .horizontal-sections {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .sub-section {
      background: #fdfcf7; /* Warm off-white */
      border: 1px solid #ebe6da;
      border-radius: 9px;
      padding: 11px 13px;
    }
    .sub-section-title {
      font-size: 13px;
      font-weight: 700;
      color: #166a79;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .sub-section-title::before {
      content: "";
      display: inline-block;
      width: 3.5px;
      height: 11px;
      background: #166a79;
      border-radius: 2px;
    }
    .module-card.engine .sub-section-title { color: #b87a4a; }
    .module-card.engine .sub-section-title::before { background: #b87a4a; }
    .module-card.packs .sub-section-title { color: #4a7c59; }
    .module-card.packs .sub-section-title::before { background: #4a7c59; }
    .module-card.memory .sub-section-title { color: #ba533a; }
    .module-card.memory .sub-section-title::before { background: #ba533a; }
    .module-card.devices .sub-section-title { color: #2b5b66; }
    .module-card.devices .sub-section-title::before { background: #2b5b66; }

    .sub-section ul {
      list-style: none;
      font-size: 11.5px;
      line-height: 1.62;
      color: #55686b;
    }
    .sub-section li {
      position: relative;
      padding-left: 13px;
      margin-bottom: 2.5px;
    }
    .sub-section li::before {
      content: "•";
      position: absolute;
      left: 1px;
      color: #8fa5a8;
      font-weight: bold;
    }
    .sub-section strong {
      color: #243b40;
      font-weight: 650;
    }

    .footer-note {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: "JetBrains Mono Variable", monospace;
      font-size: 10.5px;
      color: #8c9e9f;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #e3dfd5;
    }
  </style>
</head>
<body>
  <div class="canvas-container" id="capture-root">
    <!-- Header Banner -->
    <div class="header-banner">
      <div class="header-title-row">
        <div class="header-title">
          <span>Octos Learn 产品功能架构全景导图</span>
        </div>
        <div class="header-tagline">AI 原生无限白板学习空间 · 内部交流资料</div>
      </div>
      <div class="header-pillars">
        <div class="pillar-item">
          <strong>前端交互层 (Interaction)</strong>
          无限白板画布 + 真实向量书写 + 摄像头/实时语音多模态自然感知
        </div>
        <div class="pillar-item">
          <strong>教学核心引擎 (OLL Engine)</strong>
          确定性 DSL + 10 类理科渲染载体 + 9 类时序教学动作（消除理科幻觉）
        </div>
        <div class="pillar-item">
          <strong>通用底座 (Octos & Memory)</strong>
          Profile 物理沙箱隔离 + 长期认知记忆因材施教 + BYOK 零算力成本
        </div>
      </div>
    </div>

    <!-- Grid 2x2 -->
    <div class="modules-grid">
      <!-- 模块 1：白板多模态交互 -->
      <div class="module-card">
        <div class="module-header">
          <span class="module-badge">INTERACTION</span>
          <span class="module-title">白板多模态交互</span>
        </div>
        <div class="module-sections">
          <div class="sub-section">
            <div class="sub-section-title">画笔与基础编辑</div>
            <ul>
              <li><strong>基础向量画笔</strong>：集成调色板自选颜色，提供多档预设笔触粗细（px 菜单）</li>
              <li><strong>橡皮擦工具</strong>：按手写笔迹的组件对象精准擦除，不破坏背景与卡片</li>
              <li><strong>矩形框选与全选</strong>：拖拽矩形框批量框选多笔迹；内置一键“全选”按钮</li>
              <li><strong>独立撤销/重做</strong>：针对笔迹的独立 Undo / Redo 历史栈与快捷键支持</li>
              <li><strong>状态指示器</strong>：实时显示“X 项笔迹 · 已选 Y · 已保存”，笔迹自动持久化</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">多模态输入感知</div>
            <ul>
              <li><strong>错题拍照/截图上传</strong>：调用设备摄像头实时取景拍摄作业，或直接上传错题图片</li>
              <li><strong>实时私有语音输入</strong>：Agora RTC + 本地 SenseVoice ASR，毫秒级转写响应</li>
              <li><strong>端侧智能 VAD</strong>：端侧语音活动检测自动静音断句，边演算边语音追问</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">智能选区与原生板书</div>
            <ul>
              <li><strong>选区智能识别</strong>：框选后即时冻结像素，提供 4 大动作（解释/检查/画图/追问）</li>
              <li><strong>原生 AI 手写批注</strong>：AI 不弹卡片，直接在手稿旁以手写体笔迹批注纠错（可独立擦除/移动）</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 模块 2：OLL 确定性教学微课引擎 -->
      <div class="module-card engine">
        <div class="module-header">
          <span class="module-badge">OLL ENGINE</span>
          <span class="module-title">OLL 确定性教学微课引擎</span>
        </div>
        <div class="module-sections">
          <div class="sub-section">
            <div class="sub-section-title">10 类多模态教学渲染载体 (Node Kinds)</div>
            <ul>
              <li><strong>math (代数)</strong>：KaTeX 公式排版，支持片段级精准控制与局部步骤演进</li>
              <li><strong>plot (函数)</strong>：2D 直角坐标系（显式/隐式方程）、动态辅助线、极值/截距捕捉</li>
              <li><strong>geometry (几何)</strong>：点/线/圆/弧/扇形等组件，角度盘控件与切拼重排动画</li>
              <li><strong>scene3d (立体)</strong>：三维空间场景（点/线/面/曲面/动态截面），手势 360° 旋转缩放</li>
              <li><strong>table / diagram / shape / text / image / note</strong>：数据表、流程图、实物插图与重点便签</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">9 类虚拟教师时序教学动作 (Actions)</div>
            <ul>
              <li><strong>时序流动作</strong>：write (动态绘制), revise (公式原地演进), emphasize (脉冲高亮)</li>
              <li><strong>视听交互指示</strong>：point (激光笔指向), focus (运镜特写), connect (跨卡片指示连线)</li>
              <li><strong>结构与动画</strong>：group (逻辑成组), animate (变量补间动画)</li>
              <li><strong>音画严格同步</strong>：精细匹配在语音的 before / during / after 讲解阶段</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">探究控件与动手任务 (Interactive Tasks)</div>
            <ul>
              <li><strong>探究式交互控件</strong>：共享数值变量驱动，支持参数调节滑块（Slider）、角度盘联动</li>
              <li><strong>课后动手任务</strong>：student.tasks 任务系统，自动监听判定学生调节变量是否达标</li>
              <li><strong>相对语义空间布局</strong>：引擎动态计算碰撞与避让，大模型无需计算屏幕绝对像素</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 模块 3：精品课程包体系 -->
      <div class="module-card packs">
        <div class="module-header">
          <span class="module-badge">COURSE PACKS</span>
          <span class="module-title">精品课程包体系 (CoursePack)</span>
        </div>
        <div class="module-sections">
          <div class="sub-section">
            <div class="sub-section-title">不可变版本化课包资产</div>
            <ul>
              <li><strong>标准封装规范</strong>：含 manifest、DSL 脚本、预置资源、sha256 校验与能力声明</li>
              <li><strong>已产出精品课包</strong>：矩形面积切片 (0.1.5)、斜率与截距 (0.1.6)、线性函数三部曲等</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">Local-First 离线运行架构</div>
            <ul>
              <li><strong>单 APK 内嵌适配器</strong>：课包文件本地化存储，无网络环境完全离线交互播放</li>
              <li><strong>统一相机语义</strong>：保证在线生成课程与离线预制课包的镜头语言与视窗体验完全一致</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">学习进度实例与工具链</div>
            <ul>
              <li><strong>CourseInstance 实例</strong>：独立进度存档，支持学生对每门课断点续学或一键重置</li>
              <li><strong>CourseLauncher 启动器</strong>：课件时长、年级学科、封面缩略图与所需能力预览</li>
              <li><strong>AI 自动化流水线</strong>：知识图谱拆解目标 → 自动编译 OLL → 无头截图复核（推进中）</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 模块 4：Octos 底座与长期记忆 -->
      <div class="module-card memory">
        <div class="module-header">
          <span class="module-badge">OCTOS & MEMORY</span>
          <span class="module-title">Octos 长期记忆与底座</span>
        </div>
        <div class="module-sections">
          <div class="sub-section">
            <div class="sub-section-title">长期记忆引擎 (octos-memory)</div>
            <ul>
              <li><strong>情景记忆 (Episode)</strong>：基于 Rust 原生内核，自动从做题探究中提炼认知断点与错因</li>
              <li><strong>长期认知档案沉淀</strong>：沉淀薄弱知识项与认知偏好（直观型 vs 符号推演型）</li>
              <li><strong>混合检索 (Hybrid Recall)</strong>：向量语义嵌入 + BM25 关键词毫秒级混合召回</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">因材施教自适应教学</div>
            <ul>
              <li><strong>自适应步频调控</strong>：提问时毫秒级召回历史偏好，针对学生基础差异动态调节生成深度</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">账户隔离与成本模型</div>
            <ul>
              <li><strong>多租户 Profile 隔离</strong>：每个用户的白板数据、会话历史与密钥物理硬隔离在独立目录</li>
              <li><strong>BYOK 零算力成本</strong>：用户配置自带大模型 Key（0600 加密），平台零模型推理算力负担</li>
              <li><strong>平台代付 TTS</strong>：Hosted-TTS Sidecar（火山语音），提供免配置的旁白语音代付额度池</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 模块 5：多端交付形态 (跨两列铺开) -->
      <div class="module-card devices span-2">
        <div class="module-header">
          <span class="module-badge">DELIVERY</span>
          <span class="module-title">多端交付形态 (Web & Android 双端均支持预制课程)</span>
        </div>
        <div class="horizontal-sections">
          <div class="sub-section">
            <div class="sub-section-title">Web 全功能端 (learn.pitun.cc)</div>
            <ul>
              <li><strong>双入口设计</strong>：支持白板自由提问互动与精品预制课程集点播学习</li>
              <li><strong>现代浏览器秒开即学</strong>：支持邮箱验证码（OTP）注册与多租户数据隔离</li>
              <li><strong>多会话管理与回放</strong>：多白板会话标签页管理、会话持久化与课堂回放 (Replay)</li>
              <li><strong>教学体验保障</strong>：屏幕防休眠锁 (Wake Lock) 与 Trace 教学过程调试器</li>
            </ul>
          </div>
          <div class="sub-section">
            <div class="sub-section-title">Android 独立客户端 (cc.pitun.learn)</div>
            <ul>
              <li><strong>低门槛设备覆盖</strong>：针对 Android 8.0+ 深度优化，覆盖低成本学习平板及大屏设备</li>
              <li><strong>内置 Local-First 预制课包</strong>：预制精品课程离线内嵌，无网弱网环境流畅交互运行</li>
              <li><strong>原生音频 Bridge</strong>：Keystore AES 加密凭据、预取下一句旁白</li>
              <li><strong>高性能本地缓存</strong>：内嵌 LRU 语音缓存池（上限 512 剪辑 / 512MB）与离线课包管理</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-note">
      <span>Octos Learn · Product Architecture & Feature Matrix</span>
      <span>Base Architecture: Octos Agent Harness & OLL Runtime · 2026-09-22</span>
    </div>
  </div>
</body>
</html>`;

// Detailed Feature List Markdown
const detailedFeatureMarkdown = `# Octos Learn 产品详细功能全景清单

## 一、白板多模态交互模块（输入与操作层）

| 一级功能 | 具体功能点 | 功能说明与技术细节 | 研发状态 |
|:---|:---|:---|:---:|
| **画笔与擦除** | **向量书写** | 基础向量手写画笔，集成 \`InkColorControl\` 调色板自选颜色，提供多档预设笔触粗细（px 菜单）。 | ✅ **已上线** |
| | **笔迹擦除** | 橡皮擦工具，按手写笔迹的组件对象精准擦除，不破坏背景与卡片。 | ✅ **已上线** |
| **选区与编辑** | **矩形框选** | 拖拽生成矩形选区，一次性批量框选中单条或多条手写笔迹。 | ✅ **已上线** |
| | **一键全选** | 工具栏内置“全选”按钮，一键选中白板内全部笔迹。 | ✅ **已上线** |
| | **撤销与重做** | 针对笔迹的独立 Undo / Redo 历史记录栈，支持工具栏按钮与键盘快捷键。 | ✅ **已上线** |
| | **状态指示器** | 实时展示当前白板“X 项笔迹 · 已选 Y · 已保存 / 保存中”，笔迹变更自动持久化。 | ✅ **已上线** |
| | **画布漫游** | 手形工具平移浏览，支持双指触控手势缩放画布。防手掌误触（Palm Rejection）收尾中。 | 🔶 **90%就绪** |
| **多模态感知** | **错题拍照/截图** | 调用设备摄像头实时拍摄作业，或直接上传错题图片，带相机设置弹窗与画幅自适应。 | ✅ **已上线** |
| | **实时私有语音** | 基于 Agora RTC 实时音频流 + 本地部署的 SenseVoice ASR worker，结合端侧 VAD 自动断句。 | ✅ **已上线** |
| **选区与板书** | **智能选区识别** | 框选后即时冻结像素，显示“正在识别选区…”，并提供 4 大动作：\`解释这部分\`、\`检查并建议\`、\`生成函数图像\`、\`问小章鱼\`。 | ✅ **已上线** |
| | **原生手写板书** | 框选后 AI 不弹卡片，直接在手稿旁以**手写体笔迹**批改纠错；笔迹属于白板原生对象（带 \`origin: ai\` 标识，可擦除、可移动）。 | ✅ **代码已合入**<br/>*(Flag 灰度控制)* |

---

## 二、OLL 确定性教学微课引擎（核心壁垒层）

| 一级功能 | 具体功能点 | 功能说明与技术细节 | 研发状态 |
|:---|:---|:---|:---:|
| **架构与协议** | **双 Profile 机制** | 大模型输出语义级 Authoring Profile，引擎自动确定性编译为规范 Canonical Profile，彻底消除理科幻觉。 | ✅ **已上线** |
| **10 类教学卡片**<br/>*(Node Kinds)* | **\`math\` 代数推导** | KaTeX 高清数学公式渲染，支持公式片段级精准控制与局部步骤演进。 | ✅ **已上线** |
| | **\`plot\` 解析几何** | 2D 坐标系函数图象（显式/隐式方程）、动态辅助线、极值点/截距点智能捕捉标注。 | ✅ **已上线** |
| | **\`geometry\` 平面几何** | 点/线/圆/弧/扇形等几何组件，支持动态角度盘控件（\`angle_control\`）与切拼重排动画。 | ✅ **已上线** |
| | **\`scene3d\` 立体几何** | 三维空间场景，支持空间点/线/面、曲面、动态几何截面（Sections），支持手势 360° 旋转缩放。 | ✅ **已上线** |
| | **\`table\` 数据表** | 结构化数据表格，常用于函数自变量-因变量对照表与统计对照。 | ✅ **已上线** |
| | **\`diagram\` / \`shape\`** | 流程图、拓扑结构图与基础几何形状色块（用于几何阴影面积推导）。 | ✅ **已上线** |
| | **\`text\` / \`note\` / \`image\`** | 概念定义富文本卡片、课堂重点警示便签框，以及实物科学插图。 | ✅ **已上线** |
| **9 类时序动作**<br/>*(Actions)* | **教学动作时间轴** | 支持 \`write\` 动态绘制、\`revise\` 局部改写、\`emphasize\` 脉冲高亮、\`point\` 激光笔指向、\`focus\` 运镜特写、\`connect\` 跨卡片连线、\`group\` 成组、\`animate\` 变量动画。 | ✅ **已上线** |
| | **音画严格同步** | 动作精细匹配在语音讲解的 \`before_speech\`、\`during_speech\`、\`after_speech\` 阶段。 | ✅ **已上线** |
| **互动与布局** | **探究式交互控件** | 全局共享变量驱动，支持参数动态调节滑块（Slider）、角度盘，拖动可实时驱动图象多卡片联动。 | ✅ **已上线** |
| | **课后动手任务** | \`student.tasks\` 任务系统（\`variable_change\`、\`expression_target\`），自动监听判定变量达标。 | ✅ **已上线** |
| | **相对空间布局** | 相对空间语义排版（\`below\`, \`right_of\`, \`inside\` 等），引擎自动处理碰撞与避让，大模型无需计算像素坐标。 | ✅ **已上线** |

---

## 三、精品课程包体系（CoursePack 内容与资产层）

| 一级功能 | 具体功能点 | 功能说明与技术细节 | 研发状态 |
|:---|:---|:---|:---:|
| **课包规范** | **不可变课包标准** | 严格定义 CoursePack 规范（含 manifest、DSL 脚本、预置资源、sha256 校验与能力声明）。已落地矩形面积、斜率截距、线性函数三部曲等课包。 | ✅ **已上线** |
| **离线运行** | **Local-First 架构** | 单 APK 内嵌本地发布目录适配器，无需连接外网即可完整流畅离线交互播放。 | ✅ **已上线** |
| **进度管理** | **学习进度实例** | \`CourseInstance\` 进度存档模型，支持针对每门课独立存档、断点续学或一键重置。 | 🔶 **核心已就绪** |
| | **课件启动器** | \`CourseLauncher\` 组件，提供课件时长、年级学科、封面缩略图与能力预览。 | ✅ **已上线** |
| **课件生产** | **自动化生产流水线** | 知识图谱拆解教学目标 → 批量编译 OLL → 无头 Chrome 自动截屏复核。当前提供 CLI 构建脚本。 | 🔶 **推进中** |

---

## 四、Octos 长期记忆与通用底座（大脑与基础设施层）

| 一级功能 | 具体功能点 | 功能说明与技术细节 | 研发状态 |
|:---|:---|:---|:---:|
| **记忆引擎** | **情景记忆 (Episode)** | 基于 Rust 原生 \`octos-memory\` 模块，自动从探究做题中提炼认知断点与错因事件。 | ✅ **底座就绪** |
| | **长期档案与检索** | 沉淀学生的知识薄弱项与认知偏好（直观型 vs 符号型），支持向量语义 + BM25 关键词混合检索（Hybrid Recall）。 | ✅ **底座就绪** |
| | **因材施教自适应** | 提问时毫秒级混合召回历史偏好，动态调整生成的教学步频、推导深度与动画量。 | 🔶 **平台接入中** |
| **账号与安全** | **多租户物理隔离** | Profile 物理沙箱隔离，每个用户的白板数据、会话历史、模型密钥保存在独立目录中。 | ✅ **已上线** |
| **成本与服务** | **BYOK 成本模型** | 用户在个人设置中配置自己的大模型 Key（Gemini / Ark 等，\`0600\` 加密保存），平台零大模型推理算力负担。 | ✅ **已上线** |
| | **平台代付 TTS** | 独立 Hosted-TTS Sidecar（火山语音），提供限额代付池（10万字平台池/1万字用户池），个人 Key 优先，平台池兜底。 | ✅ **已上线** |

---

## 五、多端交付形态（终端与生态层）

| 一级功能 | 具体功能点 | 功能说明与技术细节 | 研发状态 |
|:---|:---|:---|:---:|
| **Web 全功能端** | **公网生产环境 (\`learn.pitun.cc\`)** | 稳定运行于现代主流浏览器，支持邮箱验证码（OTP）注册登录、多会话标签页管理、白板自由提问互动与精品预制课包学习。 | ✅ **已上线** |
| | **教学体验与调试保障** | 提供课堂完整回放（Replay）、屏幕防休眠锁（Wake Lock）以及面向教研的 Trace 教学过程调试器。 | ✅ **已上线** |
| **Android 客户端** | **低门槛设备适配 (\`cc.pitun.learn\`)** | 针对 Android 8.0+（API 26）优化，深度适配各型号低成本学习平板及交互大屏，支持预制课包与白板答疑。 | ✅ **已发版** |
| | **Local-First 离线课包** | 内置精品预制课包与离线运行适配器，在无网、弱网教室环境中亦可实现零延迟音画同步与交互式探究。 | ✅ **已发版** |
| | **原生音频与缓存 Bridge** | Android 原生 TTS 桥接：Keystore AES 加密凭据存储、下一句旁白异步预取、LRU 音频本地缓存池（上限 512 剪辑 / 512MB）。 | ✅ **已发版** |
`;

async function main() {
  console.log('Starting delivery pack generation with Octos Learn brand palette...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });

  // 1. Render High-Resolution Mindmap Infographic (PNG) in Octos Learn Theme
  console.log('Rendering Mindmap PNG with Octos Learn palette (2x Retina)...');
  const imgPage = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 2 // Crisp Retina quality
  });

  await imgPage.setContent(infographicHtml);
  await imgPage.waitForTimeout(400);

  const captureElement = await imgPage.$('#capture-root');
  await captureElement.screenshot({
    path: pngPathInDelivery,
    type: 'png'
  });
  fs.copyFileSync(pngPathInDelivery, rootPngPath);
  console.log('Mindmap PNG created successfully.');
  await imgPage.close();

  // 2. Render Detailed Feature List PDF with matching palette
  console.log('Rendering Detailed Feature List PDF...');
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Octos Learn 产品详细功能全景清单</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 14mm 20mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 11.5px;
      line-height: 1.6;
      color: #243b40; /* Octos Learn deep slate */
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }
    .container { max-width: 100%; margin: 0 auto; }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #166a79; /* Octos Learn Deep Teal */
      border-bottom: 2px solid #e3e0d8;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 14.5px;
      font-weight: 650;
      color: #243b40;
      border-bottom: 1px solid #e8e4dc;
      padding-bottom: 4px;
      margin-top: 18px;
      margin-bottom: 10px;
      break-after: avoid;
      page-break-after: avoid;
    }
    blockquote {
      margin: 10px 0;
      padding: 6px 12px;
      color: #607477;
      background-color: #f7f4ec;
      border-left: 4px solid #166a79;
      font-size: 11.5px;
      border-radius: 2px;
    }
    blockquote p:last-child { margin-bottom: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 16px 0;
      font-size: 11px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #d8d3c8;
      padding: 6.5px 8px;
      text-align: left;
      vertical-align: middle;
    }
    th {
      background-color: #f5f1e8;
      font-weight: 650;
      color: #243b40;
    }
    tr:nth-child(even) td { background-color: #faf8f3; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      background-color: #ece7db;
      padding: 1.5px 4px;
      border-radius: 3px;
      color: #9c422b;
    }
    hr {
      border: 0;
      height: 1px;
      background: #e3dfd5;
      margin: 14px 0;
    }
  </style>
</head>
<body>
  <div class="container" id="content"></div>
</body>
</html>`);

  await pdfPage.addScriptTag({ path: markedJsPath });
  await pdfPage.evaluate((md) => {
    marked.setOptions({ gfm: true, breaks: false });
    document.getElementById('content').innerHTML = marked.parse(md);
  }, detailedFeatureMarkdown);

  await pdfPage.waitForTimeout(400);

  await pdfPage.pdf({
    path: pdfPathInDelivery,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      bottom: '20mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 8px; color: #7f9193; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; font-family: -apple-system, sans-serif;">
        <span>Octos Learn 产品详细功能全景清单</span>
        <span>2026-09-22</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 8px; color: #7f9193; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; font-family: -apple-system, sans-serif;">
        <span>交流资料 · Confidential</span>
        <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
      </div>
    `
  });

  fs.copyFileSync(pdfPathInDelivery, rootPdfPath);
  console.log('Detailed Feature List PDF created successfully.');
  await pdfPage.close();

  await browser.close();

  // 3. Zip both files together with UTF-8 flags
  console.log('Packaging ZIP archive (UTF-8 enabled)...');
  execSync(`python3 -c "import zipfile, os; z = zipfile.ZipFile('${zipPathInDelivery}', 'w', zipfile.ZIP_DEFLATED); z.write('${pngPathInDelivery}', 'Octos_Learn_功能架构全景导图.png'); z.write('${pdfPathInDelivery}', 'Octos_Learn_产品详细功能全景清单.pdf'); z.close()"`);
  fs.copyFileSync(zipPathInDelivery, rootZipPath);
  console.log('ZIP package created successfully.');

  console.log('\n--- ALL ARTIFACTS READY ---');
  console.log('PNG File:', rootPngPath);
  console.log('PDF File:', rootPdfPath);
  console.log('ZIP File:', rootZipPath);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
