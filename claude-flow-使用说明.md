https://github.com/ruvnet/claude-flow
# Claude-Flow 中文使用说明

## 📋 目录
- [简介](#简介)
- [核心功能](#核心功能)
- [如何提高编程效率](#如何提高编程效率)
- [实用场景](#实用场景)
- [最佳实践](#最佳实践)

---

## 简介

**Claude-Flow** 是一个强大的 AI 辅助编程工具，通过 MCP (Model Context Protocol) 服务器提供智能化的开发工作流。它集成了多种先进的 AI 技术，帮助开发者提升编程效率。

### 当前版本
- **版本**: 3.0.0-alpha.102
- **状态**: 健康运行
- **模型**: Claude Opus 4.5 (`claude-opus-4-5-20251101`)

---

## 核心功能

### 1. 🧠 智能系统 (Intelligence System)

#### RuVector 智能层
- **SONA 优化器**: 从开发轨迹中学习，持续优化工作流
- **MoE 路由器**: 8 个专家代理（编码、测试、审查、架构、安全、性能、研究、协调）
- **HNSW 向量索引**: 150x-12,500x 的搜索加速
- **Flash Attention**: O(N) 内存复杂度，2.49x-7.47x 加速
- **EWC++ 巩固**: 防止灾难性遗忘
- **LoRA 适配器**: 128x 内存压缩

#### 如何提高效率
```bash
# 查看智能系统状态
使用工具: hooks_intelligence (showStatus: true)

# 搜索相似模式
使用工具: hooks_intelligence_pattern-search
参数: { query: "错误处理模式", topK: 5 }
```

**效率提升点**:
- ✅ 自动学习你的编码模式
- ✅ 智能推荐最佳实践
- ✅ 快速检索历史解决方案

---

### 2. 🤖 代理管理 (Agent Management)

#### 多代理协作
- 创建专门的代理处理不同任务
- 支持并行执行
- 智能模型路由（Haiku/Opus/Opus）

#### 如何提高效率
```bash
# 创建代理
使用工具: agent_spawn
参数: {
  agentType: "coder",
  model: "haiku",  # 快速任务用 haiku，复杂任务用 opus
  task: "重构用户认证模块"
}

# 查看代理状态
使用工具: agent_list
```

**效率提升点**:
- ✅ 并行处理多个任务
- ✅ 根据任务复杂度自动选择模型
- ✅ 降低成本（简单任务用便宜的模型）

---

### 3. 🐝 蜂群模式 (Hive-Mind)

#### 集体智能
- 多个工作节点协同工作
- 共享内存和知识
- 共识机制

#### 如何提高效率
```bash
# 初始化蜂群
使用工具: hive-mind_init
参数: { topology: "mesh" }

# 生成并加入工作节点
使用工具: hive-mind_spawn
参数: { count: 3, role: "worker" }

# 广播任务
使用工具: hive-mind_broadcast
参数: { message: "分析所有 API 端点的性能" }
```

**效率提升点**:
- ✅ 大规模任务并行处理
- ✅ 知识共享，避免重复工作
- ✅ 适合代码审查、测试覆盖等批量任务

---

### 4. 📊 任务管理 (Task Management)

#### 智能任务编排
- 创建、分配、跟踪任务
- 优先级管理
- 自动状态更新

#### 如何提高效率
```bash
# 创建任务
使用工具: task_create
参数: {
  type: "feature",
  description: "实现用户登录功能",
  priority: "high",
  tags: ["authentication", "frontend"]
}

# 查看任务列表
使用工具: task_list
参数: { status: "pending", priority: "high" }
```

**效率提升点**:
- ✅ 清晰的任务追踪
- ✅ 自动优先级排序
- ✅ 团队协作透明化

---

### 5. 🔒 AI 防御 (AIDefence)

#### 安全扫描
- 检测提示注入攻击
- 识别 PII（个人身份信息）
- 越狱检测

#### 如何提高效率
```bash
# 扫描输入
使用工具: aidefence_scan
参数: { input: "用户提交的内容" }

# 检查是否包含 PII
使用工具: aidefence_has_pii
参数: { input: "邮箱: user@example.com" }
```

**效率提升点**:
- ✅ 自动安全检查
- ✅ 防止数据泄露
- ✅ 符合隐私法规

---

### 6. 📝 声明系统 (Claims System)

#### 工作声明
- 声明正在处理的问题
- 防止重复工作
- 支持工作交接

#### 如何提高效率
```bash
# 声明问题
使用工具: claims_claim
参数: {
  issueId: "123",
  claimant: "agent:coder-1:coder"
}

# 查看所有声明
使用工具: claims_list

# 工作交接
使用工具: claims_handoff
参数: {
  issueId: "123",
  from: "agent:coder-1",
  to: "agent:reviewer-1",
  progress: 80
}
```

**效率提升点**:
- ✅ 避免团队成员重复工作
- ✅ 清晰的工作所有权
- ✅ 平滑的工作交接

---

### 7. 🔍 代码分析 (Code Analysis)

#### Git Diff 分析
- 风险评估
- 变更分类
- 推荐审查者

#### 如何提高效率
```bash
# 分析 diff
使用工具: analyze_diff
参数: { ref: "HEAD", includeReviewers: true }

# 快速风险评估
使用工具: analyze_diff-risk
参数: { ref: "main..feature" }

# 获取统计信息
使用工具: analyze_diff-stats
```

**效率提升点**:
- ✅ 自动识别高风险变更
- ✅ 智能推荐审查者
- ✅ 加速代码审查流程

---

### 8. 🌐 浏览器自动化 (Browser Automation)

#### Web 测试
- 自动化浏览器操作
- 截图和快照
- 表单填充

#### 如何提高效率
```bash
# 打开网页
使用工具: browser_open
参数: { url: "http://localhost:3000" }

# 获取页面快照
使用工具: browser_snapshot
参数: { interactive: true }

# 点击元素
使用工具: browser_click
参数: { target: "@e1" }

# 填充表单
使用工具: browser_fill
参数: { target: "#username", value: "testuser" }
```

**效率提升点**:
- ✅ 自动化 E2E 测试
- ✅ 快速验证 UI 变更
- ✅ 减少手动测试时间

---

### 9. 💾 持久化内存 (Memory Store)

#### 知识存储
- 存储和检索模式
- 语义搜索
- 跨会话持久化

#### 如何提高效率
```bash
# 存储知识
使用工具: memory_store
参数: {
  key: "auth-pattern",
  value: { pattern: "JWT + Refresh Token", reason: "安全且用户友好" }
}

# 搜索记忆
使用工具: memory_search
参数: { query: "认证模式", limit: 5 }

# 检索特定记忆
使用工具: memory_retrieve
参数: { key: "auth-pattern" }
```

**效率提升点**:
- ✅ 保存项目知识
- ✅ 快速查找历史决策
- ✅ 团队知识共享

---

### 10. 🔄 工作流编排 (Workflow)

#### 自动化流程
- 创建多步骤工作流
- 条件分支
- 并行执行

#### 如何提高效率
```bash
# 创建工作流
使用工具: workflow_create
参数: {
  name: "部署流程",
  steps: [
    { type: "task", name: "运行测试" },
    { type: "condition", name: "检查测试结果" },
    { type: "task", name: "构建镜像" },
    { type: "task", name: "部署到生产" }
  ]
}

# 执行工作流
使用工具: workflow_execute
参数: { workflowId: "workflow-123" }
```

**效率提升点**:
- ✅ 标准化开发流程
- ✅ 减少人为错误
- ✅ 一键执行复杂操作

---

### 11. 📈 性能监控 (Performance)

#### 性能分析
- 瓶颈检测
- 基准测试
- 性能报告

#### 如何提高效率
```bash
# 生成性能报告
使用工具: performance_report
参数: { timeRange: "24h", format: "detailed" }

# 检测瓶颈
使用工具: performance_bottleneck
参数: { component: "api", deep: true }

# 运行基准测试
使用工具: performance_benchmark
参数: { suite: "all", iterations: 100 }
```

**效率提升点**:
- ✅ 快速定位性能问题
- ✅ 数据驱动的优化决策
- ✅ 持续性能监控

---

### 12. 🔗 GitHub 集成

#### 仓库管理
- PR 管理
- Issue 跟踪
- 工作流触发

#### 如何提高效率
```bash
# 分析仓库
使用工具: github_repo_analyze
参数: { owner: "myorg", repo: "myproject", deep: true }

# 创建 PR
使用工具: github_pr_manage
参数: {
  action: "create",
  owner: "myorg",
  repo: "myproject",
  title: "添加用户认证",
  body: "实现 JWT 认证"
}

# 管理 Issue
使用工具: github_issue_track
参数: {
  action: "create",
  title: "修复登录 bug",
  labels: ["bug", "high-priority"]
}
```

**效率提升点**:
- ✅ 自动化 GitHub 操作
- ✅ 集成开发工作流
- ✅ 减少上下文切换

---

## 实用场景

### 场景 1: 快速原型开发

```bash
1. 使用 hooks_pretrain 分析现有代码库
2. 使用 agent_spawn 创建 coder 代理
3. 使用 task_create 创建功能任务
4. 使用 workflow_create 自动化测试和部署
```

**预期效率提升**: 50-70%

---

### 场景 2: 代码审查

```bash
1. 使用 analyze_diff 分析变更
2. 使用 aidefence_scan 检查安全问题
3. 使用 claims_claim 声明审查任务
4. 使用 github_pr_manage 提交审查意见
```

**预期效率提升**: 60-80%

---

### 场景 3: 大规模重构

```bash
1. 使用 hive-mind_init 初始化蜂群
2. 使用 hive-mind_spawn 创建多个工作节点
3. 使用 hive-mind_broadcast 分配重构任务
4. 使用 performance_benchmark 验证性能
```

**预期效率提升**: 70-90%

---

### 场景 4: 自动化测试

```bash
1. 使用 browser_open 启动测试环境
2. 使用 browser_snapshot 获取页面状态
3. 使用 browser_fill 和 browser_click 执行操作
4. 使用 workflow_create 创建测试套件
```

**预期效率提升**: 80-95%

---

## 最佳实践

### 1. 智能模型选择
- **Haiku**: 简单任务（代码格式化、简单重构）
- **Opus**: 中等任务（功能开发、bug 修复）
- **Opus**: 复杂任务（架构设计、复杂算法）

### 2. 并行处理
```bash
# 同时运行多个独立任务
使用 hive-mind 或多个 agent_spawn
```

### 3. 知识积累
```bash
# 定期保存重要决策和模式
使用 memory_store 和 hooks_intelligence_pattern-store
```

### 4. 持续学习
```bash
# 记录成功的工作轨迹
使用 hooks_intelligence_trajectory-start/step/end
```

### 5. 安全第一
```bash
# 所有用户输入都应该扫描
使用 aidefence_scan 和 aidefence_has_pii
```

---

## 进阶技巧

### 1. 自定义工作流
创建适合你团队的标准化流程，减少重复操作。

### 2. 模式库建设
使用 `memory_store` 和 `pattern-store` 建立团队知识库。

### 3. 性能基线
定期运行 `performance_benchmark` 建立性能基线，及时发现退化。

### 4. 智能路由
利用 `hooks_route` 让系统自动选择最合适的代理处理任务。

### 5. 会话管理
使用 `session_save` 和 `session_restore` 保存工作状态，随时恢复。

---

## 总结

Claude-Flow 通过以下方式显著提高编程效率：

1. **自动化**: 减少重复性手动操作
2. **智能化**: AI 辅助决策和代码生成
3. **并行化**: 多任务同时处理
4. **标准化**: 统一的工作流程
5. **知识化**: 积累和复用团队知识

**预期整体效率提升**: 60-80%

---

## 快速开始

```bash
# 1. 查看系统状态
使用工具: system_status (verbose: true)

# 2. 初始化智能系统
使用工具: hooks_intelligence (showStatus: true)

# 3. 创建第一个任务
使用工具: task_create
参数: {
  type: "feature",
  description: "你的第一个任务",
  priority: "normal"
}

# 4. 开始工作！
```

---

## 获取帮助

- 查看工具列表: `hooks_list`
- 系统状态: `system_status`
- 智能系统状态: `hooks_intelligence`
- 性能指标: `performance_metrics`

---

**版本**: 1.0.0
**更新日期**: 2026-01-23
**作者**: Claude Opus 4.5
