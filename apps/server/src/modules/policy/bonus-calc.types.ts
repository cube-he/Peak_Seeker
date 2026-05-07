/**
 * 加分计算 Service 的输入与输出契约。
 * 来源：四川 2026 招生政策第十一节"录取照顾政策"
 *
 * 输入：从 student profile + user 拼出的最小信息集
 * 输出：可享受加分总值（取最高一项不累加）+ 命中项 + 被驳回项依据
 */

/** 加分项分类枚举（对应官方 5 类加分 + 优先录取标记） */
export type BonusItemType =
  // 加分类（普通类专业）
  | 'VETERAN_SELF_EMPLOYED'        // (2) 自主就业退役士兵 +10
  | 'VETERAN_MERIT_LEVEL_2_PLUS'   // (2) 服役二等功+/战区授荣 +20
  | 'OVERSEAS_RETURNED'            // (3) 归侨 +5
  | 'OVERSEAS_CHILD'               // (3) 归侨子女/华侨子女 +5
  | 'TAIWAN_REGISTRY'              // (3) 台湾省籍/台湾户籍 +5
  | 'MARTYR_CHILD'                 // (4) 烈士子女 +20
  | 'ETHNIC_AREA_MINORITY'         // (5) 三州十七县两区少数民族 +20
  | 'ETHNIC_AREA_HAN'              // (5) 三州十七县两区汉族 +10
  // 优先录取（不加分但同等条件优先；本服务不计入 bonusValue，仅记录）
  | 'PRIORITY_RETIRED_OFFICER'     // (1) 退役现役军人
  | 'PRIORITY_DISABLED_POLICE'     // (1) 残疾人民警察
  | 'PRIORITY_5A_VOLUNTEER'        // (1) 5A 级青年志愿者
  | 'PRIORITY_POLICE_HERO_CHILD'   // (1) 公安英模/因公牺牲伤残民警子女
  | 'PRIORITY_RIGHTEOUS_CHILD'     // (1) 见义勇为死亡或致残人员子女
  | 'PRIORITY_MILITARY_CHILD'      // (1) 平时二等功/战时三等功以上军人子女等
  | 'PRIORITY_FIREFIGHTER_CHILD'   // (1) 国家综合性消防救援队伍同类人员子女
  | 'PRIORITY_JUDICIAL_POLICE_CHILD'; // (1) 司法行政人民警察子女

/** 单条加分项的运行时实例（命中或被驳回） */
export interface BonusItemEvaluation {
  type: BonusItemType;
  /** 该项分值（优先录取项为 0） */
  value: number;
  /** 是否命中（满足该项申报条件） */
  matched: boolean;
  /** 命中或被驳回的简短说明（用户友好） */
  reason: string;
  /** 是否优先录取项（不加分但同等条件优先） */
  isPriority: boolean;
}

/** 加分计算输入：来自 student profile + user 的最小信息集 */
export interface BonusCalcInput {
  // 来自 user
  ethnicity?: string | null; // 民族中文名，如"汉族"/"藏族"/"彝族"

  // 来自 student profile
  province?: string | null;
  city?: string | null;
  county?: string | null;

  // 学生申报字段（来自 bonusItems Json，结构为 BonusItemDto[]）
  // 第一版只支持 type 字符串与 BonusItemType 对齐；不一致的项被忽略
  declaredItems?: Array<{ type?: string; value?: number; source?: string }> | null;
}

/** 加分计算输出 */
export interface BonusCalcResult {
  /** 实际可享受的加分（取最高一项不累加，按官方规则） */
  bonusValue: number;
  /** 应用的项（取最高那一条；多个并列最高取第一条） */
  appliedItem: BonusItemEvaluation | null;
  /** 全部命中项（包含未应用的更低分项，便于解释） */
  matchedItems: BonusItemEvaluation[];
  /** 全部驳回项（含驳回原因；便于学生理解为什么没拿到加分） */
  rejectedItems: BonusItemEvaluation[];
  /** 优先录取标记（不加分但同等条件优先） */
  priorityFlags: BonusItemEvaluation[];
  /** 重要约束提示（前端展示用） */
  caveats: string[];
}
