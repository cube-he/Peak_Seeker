# Empty-address Geocode Fallback Design

**日期**：2026-05-06
**状态**：implemented 2026-05-06 (v1 + v2 extension)

## 背景

`geo-backfill.ts` 跑完后，2237 所院校中有 32 所卡在 `geoStatus='pending'`。诊断结果：

- 这 32 所院校的 `address` 字段全部为空
- 脚本当前 fallback 到 `${province}${city}${name}` 拼接字符串，传给 `/geocode/geo`
- AMap 对这种字符串要么返回 `ENGINE_RESPONSE_DATA_ERROR`，要么返回省市中心点（被验证器拒绝）
- 直接用 `/place/text` 配 `types=141201`（高等院校）+ city 过滤即可拿到准确的学校 POI 坐标（已经实测验证，例如 `西南交通大学+成都` → `九里校区 104.053035,30.698718`）

值得注意的是：`geocoder.service.ts` 的 `geocodeCampus()` 方法已经实现了正确的 fallback 模式（`/geocode/geo` 失败时改用 `/place/text` + `types=141201`），但**主校区入口 `geocode()` 没有这个 fallback**。这是本次修复的核心。

## 目标

让 `geo-backfill.ts` 能正确处理 `address` 为空的院校，把 32 条 pending 推到 verified。

**成功标准**（可验证）：

- 部署后跑 `pnpm ts-node scripts/geo-backfill.ts --resume`
- 报告 `verified: 2168 → 2200`，`pending: 32 → 0`
- 抽样 3-5 所院校的坐标，肉眼对照地图，落点确实在校园内或紧邻

## 非目标

- **不重做** `verified` 状态的 2168 所院校（避免破坏既有数据 + 不必要消耗 AMap 额度）
- **不修复** 37 所 `invalid`（这是验证器主动判定的失败，独立问题）
- **不重构** retry-chain / strategies 体系（4 个 strategy 调用 `geocode()` 的语义保持不变）
- **不修复** `amap.client.ts` 把非 transient 失败响应缓存 24h 的 bug（独立问题，今天清缓存已临时绕开）

## 设计

### 修改清单（外科手术，2 个文件）

#### 1. `apps/server/src/modules/geo/services/geocoder.service.ts`

新增方法 `geocodeUniversity()`，与既有 `geocodeCampus()` 对称：

```ts
async geocodeUniversity(
  name: string,
  opts: { city?: string; address?: string } = {},
): Promise<GeoResult | null> {
  // 1. 有 address 时优先用 /geocode/geo
  if (opts.address?.trim()) {
    const direct = await this.amap.geocode(opts.address, { city: opts.city });
    if (direct) return this.fromGeocode(opts.address, direct);
  }
  // 2. address 为空或上一步无结果 → /place/text + 高校类目过滤
  const pois = await this.amap.searchPlaceText(name, {
    city: opts.city, types: '141201', // 高等院校
  });
  return pois.length > 0 ? this.fromPoi(pois[0]) : null;
}
```

行为契约：
- `opts.address` 为空、`undefined`、纯空格 → 跳过 geocode，直接走 POI
- `opts.address` 有值但 `/geocode/geo` 返回 `null`（无结果） → fallback POI
- `opts.address` 有值且 `/geocode/geo` 抛 `AmapApiError`（如 `ENGINE_RESPONSE_DATA_ERROR`）→ **不捕获**，让上游处理（保持与现有 `geocode()` 一致的错误传播）
- 两路都 null → 返回 null（上游已有相关处理）

#### 2. `apps/server/scripts/geo-backfill.ts:113-116`

将主校区入口的调用换成 `geocodeUniversity`：

```ts
// before
const main = await deps.geocoder.geocode(
  uni.address ?? `${uni.province ?? ''}${uni.city ?? ''}${uni.name}`,
  { city: uni.city ?? undefined },
);

// after
const main = await deps.geocoder.geocodeUniversity(uni.name, {
  city: uni.city ?? undefined,
  address: uni.address ?? undefined,
});
```

### 不动的部分

- `geocode()` 方法签名和行为
- `geocodeCampus()` 方法（已经有 POI fallback）
- 4 个 retry strategies（`geocode-with-province-city`, `geocode-without-bracket`, `re-geocode-campus`, `geocode-as-poi`）
- `validator.service`, `retry-chain.service`, `amap.client`
- `geo-refresh-poi.ts`（POI 刷新无关）
- 所有现有数据库行（不重新 geocode 已 verified 的院校）

## 测试

### 单元测试（geocoder.service.spec.ts 新增 cases）

按 TDD 流程，先写测试看 RED，再实现看 GREEN：

| 用例 | 输入 | mock 设置 | 预期 |
|---|---|---|---|
| `address` 有值 + geocode 成功 | name="X", address="北京市X路1号", city="北京市" | `amap.geocode` 返回 AmapGeocode | 走 geocode 分支，`source='amap_geocode'` |
| `address` 有值但 geocode 返回 null | 同上 | `amap.geocode` 返回 null，`amap.searchPlaceText` 返回 [poi] | fallback 到 POI，`source='amap_poi'` |
| `address` 为空 | name="西南交通大学", address=undefined, city="成都" | `amap.searchPlaceText` 返回 [poi] | 直接走 POI，未调用 `amap.geocode` |
| `address` 为纯空格 | address="   " | 同上 | 同上（跳过 geocode） |
| 两路都 null | address=undefined | `searchPlaceText` 返回 `[]` | 返回 null |

### 生产验证

1. 部署到生产
2. 跑 `pnpm ts-node scripts/geo-backfill.ts --resume`
3. 检查 `geo-backfill-*.json` 报告：`verified=2200, invalid=0(or near 0), errors=0(or near 0)`
4. DB 查询：`SELECT COUNT(*) FROM University WHERE geoStatus='pending'` 应为 0
5. 抽样验证（成都/北京/南京/深圳/兰州 各 1 个），用 [高德地图坐标拾取](https://lbs.amap.com/tools/picker) 反查坐标

## 失败模式与回滚

### 失败模式 1：POI 搜索返回错误学校

部分院校名重名/类似（如多所"建筑大学"），`searchPlaceText` 取 `pois[0]` 可能选错。
**缓解**：当前 32 条都是名字唯一性较高的（西南交通大学、香港中文大学(深圳)等），且加了 `city` 过滤。如果出现错配，单独人工 patch（在 spec 之外的运营动作）。

### 失败模式 2：搜索仍返回省市中心

理论上 `types=141201` 应该过滤为高校，不会返回省中心。如发生，validator 会标 `address_ambiguous` 或类似，进入 invalid 状态而非 verified —— 不会污染数据。

### 回滚

- 代码回滚：`git revert <commit>`
- 数据回滚：本次新写入的 32 条 verified，如发现有问题，可手动 `UPDATE University SET geoStatus='pending', latitude=NULL, longitude=NULL WHERE id IN (...)` —— 不影响其他数据

## 调用预算

- 32 校 × 1 次 `/place/text` = 32 次 ≈ ¥0.1
- 32 校 × ~1.5 个校区 × 3 typecode `/place/around` = ~150 次（如果不带 `--skip-poi` 一起跑 POI）≈ ¥0.5
- 总成本对 2万次池子可忽略

## 实施顺序

1. 写单测（RED）
2. 实现 `geocodeUniversity()`（GREEN）
3. 改 `geo-backfill.ts:113-116`
4. 跑测试套件（确保未破坏既有 spec）
5. 部署生产（rsync + pnpm build:server + pm2 restart）
6. 跑 backfill 验证

## 风险评估

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 部分院校 POI 选错 | 低 | 局部数据偏差 | 抽样校验，人工 patch |
| `/place/text` 配额耗尽 | 极低 | 32 条仍然 pending | 等明天免费额度刷新 |
| 单测覆盖不到的边界场景 | 低 | 部署后小修小补 | 生产验证抽样 |

## 扩展（v2）：geocodeCampus 异常 fallback

### 背景

v1 实施后，32 校 pending 中只有 13 校转为 verified，剩 19 校仍报 `AMap unreachable after 6 attempts`。

诊断发现：`geocodeUniversity` 实际上 19 校全部能拿到坐标（直接 NestJS bootstrap 调用，0 错）。失败发生在后续的 **campus loop**：每个校区调用 `geocodeCampus(uniName, campusName, {city})` 走 `/geocode/geo`，对 `"西南交通大学(犀浦)"` / `"中央戏剧学院(昌平)"` 等查询，AMap 持续返回 `ENGINE_RESPONSE_DATA_ERROR`，6 次重试都失败 → 抛 `AmapUnavailableError`。

`geocodeCampus` 当前代码：

```ts
async geocodeCampus(...) {
  const direct = await this.amap.geocode(query, { city });  // 抛异常 → 直接传播
  if (direct) return this.fromGeocode(query, direct);
  const pois = await this.amap.searchPlaceText(...);  // 永远到不了
  return pois.length > 0 ? this.fromPoi(pois[0]) : null;
}
```

`amap.geocode` 用**异常**而不是 null 表达失败，导致设计中"geocode 失败 → POI fallback"的 fallback 永远进不到。这是 v1 已有的 bug，被 v1 暴露在 backfill 流程上。

### 修复

在 `geocodeCampus` 包 try/catch，让 `AmapUnavailableError` / `AmapApiError` 也走 fallback：

```ts
async geocodeCampus(...) {
  try {
    const direct = await this.amap.geocode(query, { city });
    if (direct) return this.fromGeocode(query, direct);
  } catch (e) {
    if (!(e instanceof AmapUnavailableError) && !(e instanceof AmapApiError)) throw e;
    // expected: fall through to POI fallback
  }
  const pois = await this.amap.searchPlaceText(...);
  return pois.length > 0 ? this.fromPoi(pois[0]) : null;
}
```

### 测试

新增 1 个单测 case：mock `amap.geocode` 抛 `AmapUnavailableError`，验证 `geocodeCampus` 调用 `searchPlaceText` 并返回 POI 结果（而不是把异常向上抛）。

### 验证

部署后重跑 `geo-backfill.ts --resume --skip-poi`，预期 19 校全部 verified（容许 ≤2 例 invalid）。

### 范围说明

**只**改 `geocodeCampus`。`geocode()` 主方法保持原异常传播行为（4 个 retry strategies 依赖它）。`geocodeUniversity()` 不变（其内部只调 `searchPlaceText`，无 `amap.geocode` 异常风险）。
