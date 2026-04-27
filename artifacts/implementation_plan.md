# 实验小助手 - Western Blot (WB) 模块构建计划

本实施计划旨在为实验小助手应用引入完整的 Western Blot (WB) 流水线。新设计将充分借鉴并延续现有 PCR 模块的高效特性（全链路样本继承、免错计算与可视化交互），打造一个从“蛋白提取”到“抗体孵育”的一站式数据与操作管理闭环。

## User Review Required
> [!IMPORTANT]
> - 本计划提出了新增独立 JS 文件 (`wb.js`) 以分离逻辑，而非全量堆砌在既有文件上，这涉及 HTML 内引入新脚本，后续若继续做其他模块，也可采用同类插件化设计。
> - 在后端，我们将套用类似 `/api/pcr/...` 的动态路由 `api/wb/{category}/{type}` 来处理 WB 的读写结构。
> 请审阅本计划，若无异议，我们将进入执行阶段。

## 模块拆解与核心功能设计

如同 PCR 模块，我们将 WB 系列操作切分并用选项卡隔离为四个连贯的微节点：

### 阶段零：WB 独立样本组池 (WB Sample Groups)
**目标**：为 WB 流程构建专属且独立的样本流列。
- 与 PCR 完全隔离（避免样本池杂糅）。用户为 WB 专门录入、编组样本，这些样本将在整个 WB 的四个微节点内进行级联继承分配。

### 阶段一：蛋白提取与变性配平 (Extraction, BCA & Normalization)
**目标**：将定量与配平在同一面板无缝衔接，测完即算，配完即煮沸。
- **协议挂载计算**：加载方案库的“提取与BCA方案”。依据标准品要求，系统给出工作液配制表。
- **无缝标曲引擎**：填入标准品 OD 自动最小二乘法生成标曲系数与 $R^2$ 校验值。
- **一键解算与统筹配平 (核心操作)**：
    - 在同个表格中输入样本空白净 OD，得出蛋白浓度。
    - 页面右侧/下方紧接“超级上样配平器”，继承刚算好的浓度。设定上样质量（如 $30\mu g$）、上样总体积（如 $20\mu l$）和等体积 Loading Buffer ($5\times$)，秒出 [蛋白液、RIPA、Loading Buffer] 三者的精确加液方案（不达标容量会爆红警告）。
- **实验步骤提示**：从细胞裂解、超声抽提、BCA测算直到水浴煮沸变性，全程检查复选框跟踪。

### 阶段二：电泳跑胶与转膜 (Electrophoresis & Transfer)
**目标**：上样防错定位与半预制打勾追踪。
- **配置化制胶步骤**：从方案库调出用户配好的半预制凝胶或自配凝胶装配流程（纯 Checklist 打勾）。
- 引入**电泳槽虚拟排版交互**：设计 10/12/15孔 的梳形交互网格，拖动标记 Marker 位置，一键将“阶段一”配平好且变性完成的样本顺流拉入各孔道锁定，绝不会搞错点样顺序。
- **实验步骤提示**：显示胶板安装、加样、浓缩胶电压、分离胶电压调速以及三明治结构“转膜”参数（如 200mA 90分钟）的硬记步骤打勾。

### 阶段三：裁膜孵育与显影 (Membrane & Detection)
**目标**：规范孵育周期、精确计算抗体体积消耗。
- 提供简单的文本图例区，让你记录这张膜在哪个 Marker 刻度被裁开了。
- **抗体词典智能呼叫**：选定你要孵的一抗、二抗（从全局抗体词典获取如 $1:1000$ 稀释比），填入所需袋/盒的封闭液或孵育液体积（如 $5ml$），顺理算出几微升原液及粉末消耗。
- **实验步骤提示**：敷条、封闭阶段、一抗过夜、洗膜次数(TBST $10\mathrm{min} \times 3$次 等)、二抗孵育、直到最终 ECL 发光显影，通过 Checkbox 构建不遗漏的留痕记录流。

---

## Proposed Changes

### 后端 API (Backend)
通过复用或新增基础字典方法提供数据支持：
#### [MODIFY] app.py
- 设计类似于 PCR 的数据路由拦截：新增 `/api/wb/{category}/{type}` 以满足：
  - category: `samples`, `extract`, `electrophoresis`, `detection`
  - type: `groups`, `protocols`, `logs`
- 确保存档的 JSON 能经由这套基础接口透明地存储与恢复。

### 前端页面架构 (Frontend HTML)
#### [MODIFY] templates/index.html
- 在 `id="expHub"` 实验助手大厅中补充 WB 的进入入口卡片。
- 在页面中新增大框架 `<div id="mod-wb" class="module-view" style="display:none">`。
- 在内部建立 4 个主要 Tabs 占位区 (`wbBca`, `wbNorm`, `wbGel`, `wbAb`)。
- 在方案库界面 (`id="mod-protocols"`) 新加或改造 WB 相关表单挂载点（抗体库、配胶库等）。
- 在底部加载区添加 `<script src="/static/js/wb.js"></script>` 支持。

### 业务逻辑脚本 (Business Logic)
#### [NEW] static/js/wb.js
- **架构完全参考 `pcr.js`**：
  - 定义全局 `WB_STATE` 保存暂存数据及缓冲项。
  - 构建页面渲染主函数：`renderWbExtract()`, `renderWbElectro()`, `renderWbDetect()`。
  - 构建对应的 `_startNewWbXxx()` 及 `finishWbXxx()` 控制流水线流程和自动保存机制。
  - 实现具体的纯函数逻辑（如一元一次最小二乘回算 $R^2$ 与 BCA 标曲等）。

#### [MODIFY] static/js/app.js
- 更新全局路由跳转及状态切换 `openModule('wb')` 时一并启动 `loadWbData()` 数据预检程序。
- 扩展方案库展示逻辑，在 `renderProtocolsBox()` 中渲染属于 WB 的配胶及抗体记录。

#### [MODIFY] static/js/records.js
- 扩展 `renderRecordsCard()` 等函数，令所有关于 WB 的执行流水能在全局的历史记录池中像实验卡片一样地只读解析并展示状态。

---

## Open Questions
无明显阻碍。逻辑线已全部修订，每个卡点都保证完全的配置参数读取（无需硬编码试剂或方案）与全域的 Checkbox 实验步骤体验防遗忘设计。

## Verification Plan
1. API 集成完成且能正常写下全部 `wb_x_logs.json` 实体文件。
2. 方案库新增独立的【WB 样本设组库】与【WB 阶段方案库（提取配平/跑胶转膜/抗体实验方案配置）】。
3. Frontend 出现完整的 4 栏目标签页选项 (样本 / 提取配平 / 跑胶转膜 / 抗体显影)。
4. 全流程各阶段模块中的均配置实验步骤清单打勾机制（且刷新和关闭必须持久化保留）。
5. 成功走通 WB 提取配平 -> 跑胶 -> 显影 的全闭环流转状态机。
