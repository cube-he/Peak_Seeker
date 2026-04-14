# 通知系统

## 概述

SSE 单向推送站内通知，支持断线重连补发。后期 AI 对话改 WebSocket。

## 数据模型引用

- Notification

## 技术方案

NestJS @Sse() 装饰器，零额外依赖。
选择 SSE 而非 WebSocket：通知是单向推送，SSE 基于 HTTP 自动重连。

## 通知事件

| 事件类型 | 接收者 | 触发条件 |
|---------|--------|---------|
| STUDENT_INFO_COMPLETE | 老师 | 学生完成信息填写 |
| PLAN_GENERATED | 老师 | 方案生成完成(Bull job完成) |
| PLAN_GENERATION_FAILED | 老师+管理员 | 方案生成失败 |
| REVIEW_REQUESTED | 主管老师 | 方案提交审核 |
| REVIEW_COMPLETED | 方案老师 | 审核通过或驳回 |
| PLAN_PUBLISHED | 学生 | 方案发布 |
| STUDENT_QUESTION | 老师 | 学生对志愿提疑问 |
| DATA_CHANGED | 受影响老师 | 招生计划变更 |
| STUDENT_ASSIGNED | 老师 | 管理员分配学生 |
| STUDENT_TRANSFERRED | 双方老师+学生 | 学生转移 |
| PLAN_REVOKED | 老师+学生 | 方案被撤回 |
| SCORE_UPDATED | 老师 | 学生成绩更新 |
| SYSTEM_ERROR | 管理员 | 系统级错误 |

## SSE 端点

```
@Sse('notifications/stream')
返回 Observable<MessageEvent>，每条消息携带 notification.id 作为 event id
```

## 断线重连补发

前端 EventSource.onopen 时：
→ GET /notifications/unread
→ 补发断线期间的未读消息

后端：
- SSE 每条消息携带 notification.id
- /notifications/unread 返回 isRead=false 的消息
- /notifications/:id/read 标记已读

## Redis 降级

Redis 不可用时 → SSE 端点返回 { type: 'DEGRADED', retryMs: 30000 }
前端降级为每30秒轮询 /notifications/unread

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET(SSE) | /notifications/stream | SSE 实时推送 |
| GET | /notifications/unread | 未读通知列表 |
| PATCH | /notifications/:id/read | 标记已读 |
| PATCH | /notifications/read-all | 全部标记已读 |

## 测试要点

- SSE 连接建立和消息接收
- 断线后重连补发正确性
- 降级模式切换
- 通知权限：用户只能收到自己的通知
