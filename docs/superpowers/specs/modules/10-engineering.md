# 工程保障

## 概述

测试、CI/CD、部署、监控、备份、安全、降级——确保高考季稳定运行。

## 测试策略

### 单元测试（Jest）

最高优先级 — 推荐引擎每个子模块：
rank-calculator, scoring-engine, bin-sampler, candidate-filter,
dedup-limiter, reason-generator, tie-breaking

**选科匹配专项**：12种选科组合 × 所有选科要求 = 60+ 用例，必须 100% 通过

目标：推荐引擎 >90% 覆盖率，其他核心模块 >70%

### 集成测试（Jest + Prisma test utils）

- API 端点权限校验
- 方案状态流转全链路
- 数据导入事务（成功提交 + 失败回滚）
- Bull 队列完成链路

### 端到端冒烟测试（5条关键链路）

1. 老师创建学生→填信息→生成方案→编辑→定版→导出
2. 方案提交审核→主管通过→发布→学生查看
3. 管理员导入数据→验证报告→缓存刷新→方案生成验证
4. 出分后批量更新→批量重新生成→全部完成
5. 学生轻量推荐→院校浏览→收藏

**高考填报期间不允许推送未经冒烟测试的版本**

## CI/CD

GitHub Actions：push → lint → test → build → deploy staging（自动）
production 部署需手动审批

## 部署

版本化：每次打 tag v2026.MMDD.N，Docker 镜像同步
快速回滚（<5分钟）：docker pull 上一个 tag → restart
关键迁移附带反向 SQL 脚本（/migrations/rollback/）

## 高考填报冻结期（6/20 ~ 7/5）

- 代码冻结：仅 hotfix（主管审批）
- 数据冻结：仅增量更新
- 每个 hotfix：修复→测试→staging→production→冒烟

## API 安全

| 端点 | 限流 |
|------|------|
| 全局 | 60次/分/IP |
| 登录 | 5次/分/IP |
| 方案生成 | 3次/分/用户 |
| 导出 | 5次/分/用户 |

文件上传：白名单 MIME + magic bytes + 10MB

JWT：accessToken 30分钟 + refreshToken 7天 + 前端静默刷新

## 敏感数据保护

- 身份证号：AES-256-GCM 加密存储
- API 返回脱敏：前3后4位
- 管理员导出审计：AuditLog 记录
- CASL + 接口层双重检查

## 审计日志

Prisma Client Extension 自动记录方案相关的增删改：
操作者、操作类型、变更前后值、时间、IP

## Redis 降级

RedisHealthService 每30秒 ping：
- Bull 队列 → 降级为同步执行
- 备选池 → 直接重算
- SSE → 前端轮询
- JWT 黑名单 → 短期忽略
恢复后自动切回

## 监控

1. Winston 统一日志（console + error.log + combined.log）
2. 慢请求 Interceptor（>1s 告警）
3. Bull Queue Dashboard（/admin/queues）
4. 方案生成失败 → 通知老师+管理员
5. GET /health 健康检查（DB + Redis + OCR）

## 数据库备份

MySQL：每天凌晨 mysqldump，保留30天
关键操作前手动快照
Redis：RDB(5分钟) + AOF(每秒)
每周自动恢复验证

## 文件存储

统一抽象层 FileStorageService：
当前：LocalFileStorage → /data/uploads/{type}/{year-month}/{uuid}.{ext}
后期：可切换 AliyunOSSStorage
Nginx 配置 /uploads/ 静态目录

## 多年数据生命周期

- StudentProfile.serviceYear 隔离年份
- 每年9月归档：status→ARCHIVED，方案冻结
- 院校/专业库：累积（upsert），不按年重建
- 学生信息：serviceYear+3年后脱敏
- 方案：永久保留（算法回测用）
