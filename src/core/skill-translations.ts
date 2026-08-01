import type { SkillRecord, SkillResource } from "@/core/skills/types";

const DESCRIPTION_ZH: Record<string, string> = {
  "artifact-template-analytics-dashboard": "使用 Analytics Dashboard 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；通过图表监控获客、参与度、留存、收入和转化漏斗等关键指标。",
  "control-in-app-browser": "控制应用内浏览器，用于打开页面、导航、检查可见或可交互状态、点击、输入、截图和测试本地网页。它可以使用已有的登录会话。处理链接资源的语义操作时，应优先使用专用连接器、API 或命令行工具。",
  "build-engineering-harness": "为新建或现有的软件仓库建立、改进并完成工程保障体系。适用于评估项目准备度、明确目标和成功标准、记录架构与开发流程、划分人机职责、沉淀仓库知识、加强测试或评估、建立反馈学习闭环，以及用复盘和新人指南完成项目收尾。对于包含 AI 或智能体的项目，还会检查提示词、上下文、工具、记忆、输出结构、失败处理、成本、延迟和可靠性。",
  "artifact-template-business-review": "使用 Business Review 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；用于回顾经营表现、关键指标、分部结果、战略重点、决策和未来展望。",
  "gh-fix-ci": "用于调试或修复 GitHub 拉取请求中失败的 GitHub Actions 检查。先通过 GitHub 应用读取拉取请求元数据和补丁上下文，再使用 `gh` 查看 Actions 检查和日志，获得批准后再实施修复。",
  "codebase-design": "提供设计深层模块的共享术语。适用于设计或改进模块接口、寻找深化模块的机会、决定边界位置、提升代码的可测试性或 AI 可导航性，也可为其他 Skill 提供深层模块设计语言。",
  "computer-use": "通过 ChatGPT 控制 Windows 应用程序。",
  "control-chrome": "控制用户的 Chrome 浏览器，适用于依赖当前标签页、已登录会话或扩展程序的任务。如有专用连接器、API 或命令行工具，应优先使用。",
  "define-goal": "在开始工作前帮助用户定义具体、可衡量的目标。适用于创建目标、明确成功标准或把模糊意图转化为量化结果；仅负责目标创建和完善，不管理持久快照、决策日志或长期执行资料。",
  "artifact-template-design-report": "使用 Design Report 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；生成包含执行摘要、关键发现、影响、建议和附录的设计报告。",
  "documents": "创建、编辑、修订和批注 `.docx`、Word 或面向 Google Docs 的文档，并执行严格的渲染与验证流程。使用 `render_docx.py` 生成页面图片和可选 PDF，反复检查并修正布局后再交付。",
  "domain-modeling": "建立并完善项目的领域模型。适用于明确领域术语和统一语言、记录架构决策，或为其他 Skill 维护领域模型。",
  "exa-search": "通过用户配置的 Exa API 搜索网络，返回带来源链接的结果或有依据的结构化综合分析。适用于明确要求使用 Exa、需要当前网络研究、原始高亮内容，或带引用的深度比较与研究。",
  "excel-live-control": "通过 ChatGPT 加载项或已连接会话控制打开或活动中的 Microsoft Excel 工作簿。适用于用户在 Codex 中点名 Excel 应用或继续已有的实时 Excel 任务；不用于独立表格文件或 Google Sheets。",
  "artifact-template-experiment-analysis": "使用 Experiment Analysis 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；按照假设、方法、结果、解释、局限和后续步骤分析实验。",
  "artifact-template-financial-budget": "使用 Financial Budget 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；建立实际值、预算、情景预测、差异、现金跑道和部门计划模型。",
  "find-skills": "帮助用户发现并安装智能体 Skill。适用于用户询问“怎样完成某件事”“寻找某类 Skill”“是否存在能做某事的 Skill”，或希望扩展现有能力的场景。",
  "frontend-design-review": "审查并创建具有鲜明特色、可用于生产环境且符合设计系统的前端界面。围绕洞察到行动的顺畅度、制作质量和可信构建三个方面评估。适用于拉取请求审查、设计评审、无障碍审计、设计系统合规、创意前端设计、界面代码和组件审查、响应式检查、主题测试；不用于后端、数据库、基础设施或纯业务逻辑。",
  "frontend-design": "为新建界面或重塑现有界面提供鲜明而有意图的视觉设计指导，帮助确定审美方向、字体排印，并避免生成千篇一律的模板化设计。",
  "github": "通过已连接的 GitHub 应用对仓库、拉取请求和议题工作进行分类与定位。适用于常规 GitHub 帮助、拉取请求或议题摘要，以及在选择更具体流程前获取仓库上下文。",
  "grill-me": "通过持续追问和严格访谈，帮助完善计划或设计。",
  "grill-with-docs": "通过持续追问完善计划或设计，并在过程中同步创建架构决策记录和术语表等文档。",
  "grilling": "围绕计划、决策或想法对用户进行连续而严格的追问。适用于用户希望对思路进行压力测试，或明确使用相关触发语的场景。",
  "handoff": "把当前对话压缩成一份交接文档，便于另一个智能体继续工作。",
  "hatch-pet": "根据角色原画、生成图片、品牌线索或视觉参考创建、修复、验证、目视检查并打包兼容 Codex 的第二版动态宠物。支持自定义吉祥物、非像素风格、品牌化宠物和现有宠物修复，以及包含 9 行标准动画、16 个观察方向、确定性拼装和质量检查资料的 8×11 精灵图流程。",
  "imagegen": "生成或编辑光栅图像，适用于照片、插画、纹理、精灵、模型图和透明背景素材等位图视觉。可新建图像、转换现有图像或根据参考生成变体；不适用于更适合用 SVG、矢量、代码原生素材或 HTML/CSS/Canvas 完成的工作。",
  "improve-codebase-architecture": "扫描代码库中的模块深化机会，生成可视化 HTML 报告，然后围绕用户选中的改进项进行深入追问。",
  "artifact-template-investment-committee-memo": "使用 Investment Committee Memo 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；编写包含投资论点、交易细节、财务分析、风险和建议的投委会备忘录。",
  "jupyter-notebook": "创建、搭建或编辑用于实验、探索和教程的 Jupyter Notebook（`.ipynb`）。优先使用随附模板，并运行 `new_notebook.py` 生成干净的起始文件。",
  "latex-document-skill": "创建、编辑、编译、转换、检查并目视验证专业 LaTeX 文档和 PDF。适用于论文、学位论文、简历、报告、信函、发票、图书、试卷、海报、Beamer 幻灯片、中文文档、参考文献、表格、图表、流程图、表单、邮件合并、版本差异、OCR、PDF 转 LaTeX、文档转换、编译排错、检查和无障碍验证，并支持常用 LaTeX 引擎及相关工具。",
  "artifact-template-legal-memorandum": "使用 Legal Memorandum 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；按照争议问题、简要结论、相关事实、分析和最终结论起草法律备忘录。",
  "artifact-template-market-trends-report": "使用 Market Trends Report 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；呈现市场或行业趋势、支持证据、影响和建议的应对措施。",
  "artifact-template-minimal-letterhead": "使用 Minimal Letterhead 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；采用简洁信头布局撰写包含发件人、收件人、正文和签名字段的专业商务信函。",
  "openai-docs": "用于解答如何使用 OpenAI 产品或 API 构建应用、Codex 本身或不同 Codex 使用界面的选择、需要带引用的最新官方文档、模型选择、当前提示词指导，以及模型或提示词升级等问题。非 Codex 文档问题使用 OpenAI 文档工具，广泛的 Codex 自身知识优先使用 Codex 手册，并把备用网络搜索限制在 OpenAI 官方域名。",
  "artifact-template-operating-calendar": "使用 Operating Calendar 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；规划年度和月度运营里程碑、活动、发布、截止日期和周期性事件。",
  "artifact-template-operating-review": "使用 Operating Review 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；通过记分卡、职能更新、风险、决策和行动项开展每周运营复盘。",
  "pdf": "读取、创建、检查、渲染和验证对视觉布局有要求的 PDF 文件，包括可填写的 AcroForm 表单。使用 Poppler 渲染，并结合 reportlab、pdfplumber 和 pypdf 等 Python 工具进行生成和提取。",
  "plugin-creator": "为 Codex 创建并搭建插件目录，包括必需的 `.codex-plugin/plugin.json`、可选目录和文件、有效的清单默认值，以及默认的个人市场条目。适用于创建个人插件、增加插件结构、生成或更新市场排序和可用性元数据，或通过命令行缓存刷新与重装流程更新本地插件。",
  "presentations": "读取、创建或编辑 PowerPoint 与 Google Slides 演示文稿。适用于演示、幻灯片、PowerPoint、PPT、PPTX 和 Google Slides 相关任务。",
  "artifact-template-project-kickoff": "使用 Project Kickoff 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；帮助团队对齐项目目标、范围、角色、里程碑、风险和协作方式。",
  "artifact-template-project-tracker": "使用 Project Tracker 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；管理工作流、任务、负责人、状态、优先级、日期、发布节奏和甘特计划。",
  "yeet": "在确认范围后，有意识地提交并推送本地更改，再通过 GitHub 应用创建草稿拉取请求；当连接器覆盖不足时才使用 `gh` 作为备用方式。",
  "review-agent": "对指定代码更改执行只读、缺陷优先的审查，并返回所有可操作问题。适用于其他智能体委托审查未提交更改、相对基础分支的差异、某个提交或自定义审查要求。",
  "gh-address-comments": "处理 GitHub 拉取请求中可操作的评审反馈。先检查未解决的评审线程、修改请求或行内评论，再实施选定修复；使用 GitHub 应用读取元数据和普通评论，需要线程状态、解决状态或行内上下文时通过 `gh` 运行随附的 GraphQL 脚本。",
  "artifact-template-sales-pipeline": "使用 Sales Pipeline 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；跟踪销售机会、阶段、负责人、交易金额、概率、预测、下一步和风险。",
  "artifact-template-simple-dark-mode": "使用 Simple Dark Mode 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；通过醒目字体、简洁章节、图表和图像制作清爽的深色演示。",
  "artifact-template-simple-light-mode": "使用 Simple Light Mode 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；通过宽松排版、简洁章节、图表和图像制作清爽的浅色演示。",
  "sites-building": "使用 Sites 构建网站，包括落地页、作品集、仪表盘、门户、跟踪器、信息中心和内部工具。当项目包含 `.openai/hosting.json` 时必须使用 Sites。",
  "sites-hosting": "使用 Sites 托管网站。应在 `sites-building` 之后使用，也适用于网站发布、部署、托管管理或包含 `.openai/hosting.json` 的项目。",
  "skill-creator": "创建高质量 Skill 的指南。适用于新建或更新 Skill，通过专业知识、工作流程或工具集成扩展 Codex 的能力。",
  "skill-installer": "把精选列表或 GitHub 仓库中的 Codex Skill 安装到 `$CODEX_HOME/skills`。适用于列出可安装 Skill、安装精选 Skill，或从公开和私有仓库安装 Skill。",
  "spreadsheets": "创建、编辑、分析并验证独立电子表格文件或可导入 Google Sheets 的工作簿，包括 `.xlsx`、`.xls`、`.csv` 和 `.tsv`。不用于实时控制 Microsoft Excel 应用或当前 Excel 会话。",
  "artifact-template-strategy-memorandum": "使用 Strategy Memorandum 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；呈现战略背景、可选方案、理由、风险、里程碑和明确建议。",
  "artifact-template-system-design": "使用 System Design 模板及其保留的参考文件创建文档。当用户选择或点名该 Skill 时使用；记录系统架构、需求、组件、数据流、API、权衡和运维考虑。",
  "artifact-template-team-alignment": "使用 Team Alignment 模板及其保留的参考文件创建演示文稿。当用户选择或点名该 Skill 时使用；通过背景、目标、优先事项、决策和行动项支持团队活动与规划。",
  "template-creator": "创建或更新可复用的个人 Codex 资料模板 Skill。适用于根据参考文档、演示文稿、电子表格、图像、邮件或 Slack 消息创建模板，或明确更新已有资料模板 Skill；不用于基于现有模板的一次性创作。",
  "artifact-template-three-statement-forecast": "使用 Three-Statement Forecast 模板及其保留的参考文件创建电子表格。当用户选择或点名该 Skill 时使用；建立包含假设、校验和执行摘要的一体化利润表、资产负债表和现金流预测。",
  "to-tickets": "把计划、规格说明或当前对话拆分成一组贯穿式任务单，每个任务单都声明阻塞关系。可在本地为每个任务单生成一个文件并以文字记录依赖，也可在真实任务跟踪器中建立原生阻塞链接。",
  "ui-ux-pro-max": "面向网页和移动端的 UI/UX 设计知识库，包含风格、配色、字体搭配、产品类型、体验准则、图标、动效预设和图表类型，并覆盖 React、Next.js、Vue、Svelte、Flutter、SwiftUI、Tailwind 等多种技术栈。适用于设计、构建或审查页面、组件、配色、排版、布局、无障碍、动画和数据可视化。",
  "visualize": "直接在对话中创建可视化和交互工具。适用于展示工作原理、制作模拟器或实验室、地图、图表、对比、界面模型、场景和可调参数，以及超出普通文字说明的交互探索。",
  "web-design-guidelines": "依据 Vercel Web Interface Guidelines 审查网页界面代码。适用于设计审计、体验评审、无障碍检查、设计清单、产品界面标准，以及布局、字体、颜色、动效、交互、响应式和前端实现质量审查。",
};

const TAG_ZH: Record<string, string> = {
  accessibility: "无障碍",
  agent: "智能体",
  animation: "动画",
  architecture: "架构",
  browser: "浏览器",
  code: "代码",
  dashboard: "仪表盘",
  design: "设计",
  document: "文档",
  engineering: "工程",
  frontend: "前端",
  github: "GitHub",
  image: "图像",
  installation: "安装",
  notebook: "笔记本",
  pdf: "PDF",
  presentation: "演示文稿",
  productivity: "效率",
  research: "研究",
  review: "审查",
  skill: "技能",
  spreadsheet: "电子表格",
  testing: "测试",
  ui: "界面",
  ux: "用户体验",
  web: "网页",
};

export function translatedSkillDescription(skill: Pick<SkillRecord, "name" | "description">): string {
  const translation = /\p{Script=Han}/u.test(skill.description) ? skill.description : DESCRIPTION_ZH[skill.name.toLocaleLowerCase()] ||
    `这是一个用于 ${skill.name} 相关任务的技能。中文机器译文尚未收录，可在详情页展开查看原始说明。`;
  return translation.replace(/\bSkills?\b/g, "技能").replace(/\bPrompt\b/g, "提示词");
}

export function translatedMarketplaceDescription(name: string, description: string): string {
  const translation = /\p{Script=Han}/u.test(description) ? description : DESCRIPTION_ZH[name.toLocaleLowerCase()] ||
    `这是来自市场的 ${name} 技能。当前结果尚无可核对的中文译文，请在安装前打开来源页面查看完整说明。`;
  return translation.replace(/\bSkills?\b/g, "技能").replace(/\bPrompt\b/g, "提示词");
}

export function translatedUseCases(skill: Pick<SkillRecord, "name" | "description">): string[] {
  return translatedSkillDescription(skill)
    .split(/[。；]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 8)
    .slice(0, 3);
}

export function translatedRecommendations(
  skill: Pick<SkillRecord, "name" | "description" | "allowImplicitInvocation" | "source">,
): string[] {
  const description = translatedSkillDescription(skill);
  const recommendations = [`当任务与“${description.slice(0, 68)}${description.length > 68 ? "…" : ""}”直接相关时优先调用。`];
  if (!skill.allowImplicitInvocation) recommendations.push("该技能需要显式点名，建议从详情页复制调用提示词。");
  if (skill.source.permission !== "manage") recommendations.push("该来源为只读或兼容目录，不应从控制面板直接修改。");
  return recommendations;
}

export function translatedTags(tags: string[]): string[] {
  return tags.map((tag) => TAG_ZH[tag.toLocaleLowerCase()] || tag);
}

export function resourceKindLabel(kind: SkillResource["kind"], language: "zh" | "en"): string {
  if (language === "en") return kind;
  return {
    instruction: "说明文件",
    script: "脚本",
    reference: "参考资料",
    asset: "素材",
    agent: "智能体配置",
    other: "其他",
  }[kind];
}

export function translatedInstructionOverview(skill: SkillRecord): string {
  const lines = [
    `用途概览：${translatedSkillDescription(skill)}`,
    `调用方式：${skill.allowImplicitInvocation ? "可根据任务自动触发，也可以使用 $" + skill.name + " 显式调用。" : "必须使用 $" + skill.name + " 显式调用。"}`,
    `技能依赖：${skill.dependencies.length ? skill.dependencies.join("、") : "未声明其他技能依赖。"}`,
    `工具要求：${skill.requiredTools.length ? skill.requiredTools.join("、") : "未声明额外工具要求。"}`,
    "译文说明：以上内容根据技能元数据和调用规则自动生成；为避免误改技术约束，完整原始说明保留在下方折叠区域。",
  ];
  return lines.join("\n\n");
}
