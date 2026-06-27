# 多稿（二稿）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让草稿态(DRAFT)的初稿能一键「另存为二稿」——冻结初稿为只读、复制出可编辑的二稿，复用现成的版本对比 diff 看删除/新增。

**Architecture:** 复用已存在的 `deriveVersion`（拷贝 PlanItem + 版本链）。后端解锁 `canDeriveVersion` 允许 DRAFT、派生时把初稿状态置 `OUTDATED`（复用现成状态，`canEditItems` 天然只读，零迁移）、并改用 `max(versionNo)+1` 防撞号。前端在方案详情页 DRAFT 主动作区加「另存为二稿」按钮（带备注 Modal）+ OUTDATED 只读 banner。版本对比 diff / 列表 / 生成页全部复用不改。

**Tech Stack:** NestJS + Prisma(MySQL) 后端 · Next.js 14 + antd + react-query 前端 · Jest 单测。

设计文档：`docs/superpowers/specs/2026-06-28-plan-multidraft-design.md`

---

### Task 1: 后端状态机 `canDeriveVersion` 解锁 DRAFT

**Files:**
- Modify: `apps/server/src/modules/plan/plan-state-machine.service.ts:50-52`
- Test: `apps/server/src/modules/plan/plan-state-machine.service.spec.ts:90-98`

- [ ] **Step 1: 改单测断言（RED）**

把 `apps/server/src/modules/plan/plan-state-machine.service.spec.ts` 第 90-98 行那个用例改成 DRAFT 可派生：

```ts
  it('canDeriveVersion: DRAFT/APPROVED/PARENT_CONFIRMED/REJECTED/FINALIZED 可派生，PENDING_REVIEW/REVIEWING 不可', () => {
    expect(sm.canDeriveVersion('DRAFT')).toBe(true);
    expect(sm.canDeriveVersion('APPROVED')).toBe(true);
    expect(sm.canDeriveVersion('PARENT_CONFIRMED')).toBe(true);
    expect(sm.canDeriveVersion('REJECTED')).toBe(true);
    expect(sm.canDeriveVersion('FINALIZED')).toBe(true);
    expect(sm.canDeriveVersion('PENDING_REVIEW')).toBe(false);
    expect(sm.canDeriveVersion('REVIEWING')).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && pnpm jest plan-state-machine.service.spec -t canDeriveVersion`
Expected: FAIL —— `canDeriveVersion('DRAFT')` 当前返回 false。

- [ ] **Step 3: 实现（GREEN）**

`apps/server/src/modules/plan/plan-state-machine.service.ts` 第 51 行改为：

```ts
  canDeriveVersion(from: PlanStatus): boolean {
    return (
      from === 'DRAFT' ||
      from === 'APPROVED' ||
      from === 'PARENT_CONFIRMED' ||
      from === 'REJECTED' ||
      from === 'FINALIZED'
    );
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && pnpm jest plan-state-machine.service.spec`
Expected: PASS（全文件通过）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan/plan-state-machine.service.ts apps/server/src/modules/plan/plan-state-machine.service.spec.ts
git commit -m "feat(plan): canDeriveVersion 允许从 DRAFT 派生"
```

---

### Task 2: 后端 `deriveVersion` —— versionNote + max+1 版本号 + 初稿置 OUTDATED

**Files:**
- Modify: `apps/server/src/modules/plan/plan.service.ts:603-673`
- Test: `apps/server/src/modules/plan/plan.service.spec.ts`（新增用例，放在 review 相关用例区，约第 423 行后）

- [ ] **Step 1: 写失败测试（RED）**

在 `apps/server/src/modules/plan/plan.service.spec.ts` 里、与 review 通知用例同一 `describe` 内新增（该块 `$transaction` 已 mock 为 `cb => cb(prisma)`，见文件第 359 行）：

```ts
  it('deriveVersion: 从 DRAFT 初稿派生二稿并把初稿置 OUTDATED', async () => {
    jest.spyOn(service, 'findById').mockResolvedValue({
      id: 1, status: 'DRAFT', createdById: 20, studentId: 10, batchConfigId: 22,
      versionNo: 1, name: '小王-本科批-v1', year: 2026, province: '四川',
      batchName: '本科批', notes: null,
    } as any);
    prisma.planItem.findMany.mockResolvedValue([]);
    prisma.volunteerPlan.findFirst.mockResolvedValue({ versionNo: 1 });
    prisma.volunteerPlan.create.mockResolvedValue({ id: 99, versionNo: 2, status: 'DRAFT' });
    prisma.volunteerPlan.update.mockResolvedValue({ id: 1, status: 'OUTDATED' });

    const result = await service.deriveVersion(1, 20, '二稿—删A加B');

    expect(prisma.volunteerPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 10, parentVersionId: 1, versionNo: 2,
          status: 'DRAFT', versionNote: '二稿—删A加B', batchConfigId: 22,
        }),
      }),
    );
    expect(prisma.volunteerPlan.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { status: 'OUTDATED' },
    });
    expect(result).toEqual({ id: 99, versionNo: 2, status: 'DRAFT' });
  });

  it('deriveVersion: 非出方案老师派生报 403', async () => {
    jest.spyOn(service, 'findById').mockResolvedValue({
      id: 1, status: 'DRAFT', createdById: 20, studentId: 10, name: 'X', versionNo: 1,
    } as any);
    await expect(service.deriveVersion(1, 999)).rejects.toThrow('只有出方案老师可以派生新版本');
  });
```

> 注：若 `prisma.planItem.findMany` / `volunteerPlan.findFirst` 在该 spec 的 mock 工厂里尚未声明，需在文件顶部 `prisma` mock 对象补 `findFirst: jest.fn()`（volunteerPlan 下）和 `findMany: jest.fn()`（planItem 下）。先跑 Step 2 看报错决定。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/server && pnpm jest plan.service.spec -t deriveVersion`
Expected: FAIL —— 当前 `deriveVersion` 只接受 2 个参数、用 `parent.versionNo+1`、不置 OUTDATED。

- [ ] **Step 3: 实现（GREEN）**

`apps/server/src/modules/plan/plan.service.ts`：

(3a) 改签名（第 603 行）：

```ts
  async deriveVersion(planId: number, userId: number, versionNote?: string) {
```

(3b) 在 `$transaction(async (tx) => {` 内、`const baseName = ...` 之前插入 max+1 计算：

```ts
      // 下一版本号 = 同学生同批次现有最大版本号 + 1。
      // 防重复派生撞 @@unique([studentId, batchConfigId, versionNo])：
      // canDeriveVersion 含 FINALIZED，从同一已定稿版本派生两次会撞旧的 parent.versionNo+1。
      const latest = await tx.volunteerPlan.findFirst({
        where: { studentId: parent.studentId, batchConfigId: parent.batchConfigId },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      const nextVersionNo = (latest?.versionNo ?? parent.versionNo) + 1;
```

(3c) 把 `tx.volunteerPlan.create` 的 `data` 里两处版本号与备注改掉：`name` 用 `nextVersionNo`、`versionNo: nextVersionNo`、新增 `versionNote: versionNote ?? null`。即把第 622 行和第 629 行改为：

```ts
          name: `${baseName}-v${nextVersionNo}`,
```
```ts
          versionNo: nextVersionNo,
          parentVersionId: parent.id,
          versionNote: versionNote ?? null,
```

(3d) 在 `return newPlan;`（第 671 行）之前、`if (items.length > 0) {...}` 之后插入锁定初稿：

```ts
      // 锁定初稿：仅当父版本为 DRAFT 时置 OUTDATED（自动只读，见 canEditItems）。
      // 其它可派生态（REJECTED/FINALIZED 等）维持原行为，避免回归。
      if (parent.status === 'DRAFT') {
        await tx.volunteerPlan.update({
          where: { id: parent.id },
          data: { status: 'OUTDATED' },
        });
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/server && pnpm jest plan.service.spec`
Expected: PASS（含两条新用例 + 既有用例不回归）。

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/modules/plan/plan.service.ts apps/server/src/modules/plan/plan.service.spec.ts
git commit -m "feat(plan): deriveVersion 支持 versionNote+max版本号，DRAFT初稿派生后置OUTDATED"
```

---

### Task 3: controller 透传 versionNote

**Files:**
- Modify: `apps/server/src/modules/plan/plan.controller.ts:187-195`

- [ ] **Step 1: 改 derive 路由接收 body**

把 `apps/server/src/modules/plan/plan.controller.ts` 第 190-194 行改为：

```ts
  async derive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body: { versionNote?: string } = {},
  ) {
    return this.planService.deriveVersion(id, req.user.id, body.versionNote);
  }
```

确认文件顶部已 import `Body`（该 controller 多处用到 `@Body()`，如 `parentRequestChangeRoute`，无需新增 import）。

- [ ] **Step 2: 编译检查**

Run: `cd apps/server && pnpm build`
Expected: 构建通过，无类型错误。

- [ ] **Step 3: 提交**

```bash
git add apps/server/src/modules/plan/plan.controller.ts
git commit -m "feat(plan): derive-version 接口透传 versionNote"
```

---

### Task 4: 前端 plan-api `deriveVersion` 加 versionNote 参数

**Files:**
- Modify: `apps/web/src/services/plan-api.ts:234-240`

- [ ] **Step 1: 改方法签名透传 body**

把 `apps/web/src/services/plan-api.ts` 第 234-240 行改为：

```ts
  /**
   * 派生新版本(拷贝 PlanItem,状态回 DRAFT)。
   * DRAFT 初稿派生 = 另存为二稿(初稿自动置 OUTDATED 只读); REJECTED 同理继续通道。
   * versionNote: 可选版本备注(如"二稿—删A加B")。
   */
  deriveVersion(id: string | number, versionNote?: string): Promise<any> {
    return api.post(`/plans/${id}/derive-version`, versionNote ? { versionNote } : undefined) as any;
  },
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: 通过（现有 `deriveVersion(planId)` 无参调用仍合法，参数可选）。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/plan-api.ts
git commit -m "feat(plan-api): deriveVersion 透传 versionNote"
```

---

### Task 5: 详情页 —— DRAFT 态「另存为二稿」按钮 + 备注 Modal + 跳生成页

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`（import useRef · deriveNoteRef · deriveMutation 接受 note 并跳生成页 · DRAFT 主动作区加按钮）

- [ ] **Step 1: import 增加 useRef**

第 3 行：

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: deriveMutation 接受 note 并跳到生成页**

把 `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx` 第 461-473 行的 `deriveMutation` 改为：

```ts
  // 派生备注用 ref 存(Modal.confirm 的 onOk 闭包读 ref.current,避开 state 闭包过期)
  const deriveNoteRef = useRef('');

  const deriveMutation = useMutation({
    mutationFn: (note?: string) => planApi.deriveVersion(planId, note),
    onSuccess: (data: any) => {
      void message.success('已另存为新一版,初稿已锁为只读,继续在工作台修改');
      const newId = data?.id;
      if (newId) {
        // 跳生成工作台改二稿(增删院校都在那里)
        router.push(`/teacher/plans/generate/${plan.studentId}?planId=${newId}`);
      } else {
        refresh();
      }
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '另存新版本失败'),
  });

  // 弹备注框 → 派生二稿
  const openDeriveModal = () => {
    deriveNoteRef.current = '';
    Modal.confirm({
      title: '另存为二稿',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>会保留当前为只读初稿,复制一份可编辑的新版本继续修改。</p>
          <Input.TextArea
            rows={3}
            placeholder="版本备注(可留空),如:二稿—按学生意见删某校、加某校"
            onChange={(e) => { deriveNoteRef.current = e.target.value; }}
          />
        </div>
      ),
      okText: '另存为二稿',
      cancelText: '取消',
      onOk: () => deriveMutation.mutate(deriveNoteRef.current || undefined),
    });
  };
```

> 说明：原 REJECTED 分支调用的 `deriveMutation.mutate()`（无参）依然合法（note=undefined），且现在派生后统一跳生成工作台 —— 对 REJECTED 也是"继续改"的正确落点。

- [ ] **Step 3: DRAFT 主动作区加「另存为二稿」按钮**

把 `renderPrimaryActions` 的 `case 'DRAFT':`（第 639-658 行）的返回片段，在"继续编辑"和"提交审核"之间加一个按钮：

```tsx
      case 'DRAFT':
        return (
          <>
            <Button
              icon={<EditOutlined />}
              onClick={() => router.push(`/teacher/plans/generate/${plan.studentId}?planId=${plan.id}`)}
            >
              继续编辑
            </Button>
            <Button
              icon={<CopyOutlined />}
              loading={deriveMutation.isPending}
              onClick={openDeriveModal}
            >
              另存为二稿
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!items.length}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              提交审核
            </Button>
          </>
        );
```

- [ ] **Step 4: import CopyOutlined**

在第 23-39 行的 `@ant-design/icons` import 块按字母序加入 `CopyOutlined`（放在 `CheckCircleOutlined` 之后、`DeleteOutlined` 之前）：

```ts
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
```

- [ ] **Step 5: 类型检查**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx
git commit -m "feat(plan): 详情页DRAFT态加「另存为二稿」按钮(备注Modal+跳生成页)"
```

---

### Task 6: 详情页 —— OUTDATED 只读 banner

**Files:**
- Modify: `apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx`（在 FINALIZED Alert 后加 OUTDATED banner）

- [ ] **Step 1: 加 OUTDATED 只读提示**

在第 839-841 行的 `status === 'FINALIZED'` Alert 之后，紧接着加：

```tsx
      {status === 'OUTDATED' ? (
        (() => {
          // 取代它的版本 = versions 里 parentVersionId 指向当前方案的那条
          const newer = versions.find((v) => v.parentVersionId === Number(planId));
          return (
            <Alert
              type="warning"
              showIcon
              message="此版本已被新一版取代 · 只读"
              description={
                newer ? (
                  <Link href={`/teacher/plans/${newer.id}`}>
                    打开 v{newer.versionNo} 继续编辑 →
                  </Link>
                ) : '此版本不可再编辑。'
              }
            />
          );
        })()
      ) : null}
```

`Link`（next/link）与 `versions` 变量本文件均已存在（第 5 行 import；第 328 行 `const versions = ...`）。

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/app/(teacher)/teacher/plans/[id]/page.tsx
git commit -m "feat(plan): 详情页OUTDATED版本显示只读banner+跳新版链接"
```

---

### Task 7: 整体验证（构建 + 测试 + 真人走查）

**Files:** 无（仅验证）

- [ ] **Step 1: 后端全量测试**

Run: `cd apps/server && pnpm jest plan`
Expected: plan 相关 spec 全绿（对照 baseline，无新增红）。

- [ ] **Step 2: 两端构建**

Run: `pnpm --filter server build && pnpm --filter web build`
Expected: 均成功。

- [ ] **Step 3: 真人走查（本地或部署后）**

1. 打开一个 DRAFT 方案详情页 → 看到「另存为二稿」按钮。
2. 点击 → 填备注"二稿—删X加Y" → 确认 → 跳到生成工作台（planId=新版本）。
3. 在工作台删 1 个院校、加 1 个院校。
4. 回初稿详情页 → 顶部出现「此版本已被 v2 取代 · 只读」banner + 跳 v2 链接；编辑动作消失。
5. 打开 v2 → 版本对比选初稿 → ComparePanel 显示 1 红(删除) + 1 绿(新增) + 汇总计数。

- [ ] **Step 4: 收尾提交（如有 baseline 文档/记忆更新）**

```bash
git add -A
git commit -m "chore(plan): 多稿功能验证收尾"
```

---

## Self-Review

**Spec coverage（逐条对照 spec §4 改动清单）**
- §4 后端1 canDeriveVersion 加 DRAFT → Task 1 ✓
- §4 后端2 deriveVersion versionNote/max+1/置OUTDATED → Task 2 ✓
- §4 后端3 controller 透传 versionNote → Task 3 ✓
- §4 前端4 plan-api versionNote → Task 4 ✓
- §4 前端5 DRAFT「另存为二稿」按钮+备注+跳转 → Task 5 ✓
- §4 前端6 OUTDATED 只读 banner → Task 6 ✓
- §7 测试计划（状态机/service/前端/真人）→ Task 1/2/7 ✓
- §4「复用不改」(diff/列表/生成页) → 计划未触碰 ✓

**Placeholder scan:** 无 TBD/TODO；每个改码步骤均给出完整代码块与确切命令。Task 7 Step 4 的收尾提交为条件性（如有更新），非占位。

**Type/命名一致性:** `deriveVersion(planId, userId, versionNote?)` 三处一致（service 定义 / controller 调用 / 测试）；`versionNote` 字段名贯穿后端 schema、service、controller、plan-api、前端 Modal；`deriveMutation.mutate(note?)` 与 mutationFn 签名一致；`nextVersionNo` 仅 Task 2 内部使用。`CopyOutlined` import 与使用对应。
