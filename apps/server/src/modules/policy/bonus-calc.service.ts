import { Injectable } from '@nestjs/common';
import {
  BonusCalcInput,
  BonusCalcResult,
  BonusItemEvaluation,
  BonusItemType,
} from './bonus-calc.types';
import { isInEthnicArea } from './constants/ethnic-areas';

/**
 * 加分计算 Service —— 四川 2026 招生政策第十一节"录取照顾政策"。
 *
 * 第一版定位：纯计算 service，不接入推荐 pipeline。
 *   - 给老师/学生页面展示"该生实际能享受多少分加分及依据"
 *   - 不影响 totalScore / rank / 推荐结果
 *
 * 关键规则：
 *   1. 多项符合只取最高一项，不累加
 *   2. 优先录取项不计入 bonusValue，但单独标记
 *   3. 民族地区加分采用"三州十七县两区"地理范围 best-effort 判定（"三统一"年限字段
 *      尚未在 student profile 中采集，需老师/学生人工确认）
 *   4. 加分例外（艺术不分省/高水平运动队/民语为主/加授民文/预科）通过 caveats
 *      文案提示，不在 service 内做批次过滤（该工作属第二版，需先做 batch 词汇表对齐）
 */
@Injectable()
export class BonusCalcService {
  /** 各加分项的固定分值 */
  private readonly ITEM_VALUE: Record<BonusItemType, number> = {
    VETERAN_SELF_EMPLOYED: 10,
    VETERAN_MERIT_LEVEL_2_PLUS: 20,
    OVERSEAS_RETURNED: 5,
    OVERSEAS_CHILD: 5,
    TAIWAN_REGISTRY: 5,
    MARTYR_CHILD: 20,
    ETHNIC_AREA_MINORITY: 20,
    ETHNIC_AREA_HAN: 10,
    PRIORITY_RETIRED_OFFICER: 0,
    PRIORITY_DISABLED_POLICE: 0,
    PRIORITY_5A_VOLUNTEER: 0,
    PRIORITY_POLICE_HERO_CHILD: 0,
    PRIORITY_RIGHTEOUS_CHILD: 0,
    PRIORITY_MILITARY_CHILD: 0,
    PRIORITY_FIREFIGHTER_CHILD: 0,
    PRIORITY_JUDICIAL_POLICE_CHILD: 0,
  };

  /** 优先录取类（不加分但标记） */
  private readonly PRIORITY_TYPES = new Set<BonusItemType>([
    'PRIORITY_RETIRED_OFFICER',
    'PRIORITY_DISABLED_POLICE',
    'PRIORITY_5A_VOLUNTEER',
    'PRIORITY_POLICE_HERO_CHILD',
    'PRIORITY_RIGHTEOUS_CHILD',
    'PRIORITY_MILITARY_CHILD',
    'PRIORITY_FIREFIGHTER_CHILD',
    'PRIORITY_JUDICIAL_POLICE_CHILD',
  ]);

  /** 各项加分类的简短中文说明 */
  private readonly ITEM_LABEL: Record<BonusItemType, string> = {
    VETERAN_SELF_EMPLOYED: '自主就业退役士兵',
    VETERAN_MERIT_LEVEL_2_PLUS: '服役期间二等功+/战区授荣退役军人',
    OVERSEAS_RETURNED: '归侨',
    OVERSEAS_CHILD: '归侨子女/华侨子女',
    TAIWAN_REGISTRY: '台湾省籍/台湾户籍',
    MARTYR_CHILD: '烈士子女',
    ETHNIC_AREA_MINORITY: '三州十七县两区少数民族',
    ETHNIC_AREA_HAN: '三州十七县两区汉族',
    PRIORITY_RETIRED_OFFICER: '退役/现役军人优先录取',
    PRIORITY_DISABLED_POLICE: '残疾人民警察优先录取',
    PRIORITY_5A_VOLUNTEER: '5A 级青年志愿者优先录取',
    PRIORITY_POLICE_HERO_CHILD: '公安英模/因公牺牲伤残民警子女优先录取',
    PRIORITY_RIGHTEOUS_CHILD: '见义勇为死亡或致残人员子女优先录取',
    PRIORITY_MILITARY_CHILD: '相关军人子女优先录取',
    PRIORITY_FIREFIGHTER_CHILD: '国家综合性消防救援队伍同类人员子女优先录取',
    PRIORITY_JUDICIAL_POLICE_CHILD: '司法行政机关人民警察子女优先录取',
  };

  calculate(input: BonusCalcInput): BonusCalcResult {
    const matched: BonusItemEvaluation[] = [];
    const rejected: BonusItemEvaluation[] = [];
    const priorityFlags: BonusItemEvaluation[] = [];

    // 1. 民族地区加分（地理范围 + 民族判定，自动）
    const ethnicEval = this.evaluateEthnicArea(input);
    if (ethnicEval) {
      if (ethnicEval.matched) matched.push(ethnicEval);
      else rejected.push(ethnicEval);
    }

    // 2. 申报项加分（学生 declaredItems 数组）
    const declared = input.declaredItems || [];
    for (const item of declared) {
      const type = item.type as BonusItemType | undefined;
      if (!type || !(type in this.ITEM_VALUE)) continue; // 未知 type 忽略

      const isPriority = this.PRIORITY_TYPES.has(type);
      const value = this.ITEM_VALUE[type];

      const evalItem: BonusItemEvaluation = {
        type,
        value,
        matched: true,
        reason: `已申报：${this.ITEM_LABEL[type]}`,
        isPriority,
      };

      if (isPriority) {
        priorityFlags.push(evalItem);
      } else {
        matched.push(evalItem);
      }
    }

    // 3. 取最高一项不累加
    const applied = matched.reduce<BonusItemEvaluation | null>(
      (best, cur) => (best === null || cur.value > best.value ? cur : best),
      null,
    );
    const bonusValue = applied?.value || 0;

    // 4. caveats（前端展示提示）
    const caveats: string[] = [];
    if (matched.length > 1) {
      caveats.push(
        `共命中 ${matched.length} 项加分，按官方规则取最高一项（+${bonusValue}），不累加`,
      );
    }
    if (bonusValue > 0) {
      caveats.push(
        '加分仅在普通类专业投档时生效；以下批次不享受加分：艺术类不分省专业、高水平运动队、民语为主/加授民文专业、各类预科',
      );
    }
    if (matched.some((m) => m.type === 'ETHNIC_AREA_MINORITY' || m.type === 'ETHNIC_AREA_HAN')) {
      caveats.push(
        '民族地区加分需满足"三统一"（高中阶段连续 3 年完整户籍 + 学籍 + 实际就读）；当前系统仅按地理范围 best-effort 判定，最终以教育考试院人工核验为准',
      );
    }

    return {
      bonusValue,
      appliedItem: applied,
      matchedItems: matched,
      rejectedItems: rejected,
      priorityFlags,
      caveats,
    };
  }

  /** 民族地区加分判定：地理范围 + 民族 */
  private evaluateEthnicArea(input: BonusCalcInput): BonusItemEvaluation | null {
    const inEthnicArea = isInEthnicArea(input.province, input.city, input.county);
    if (!inEthnicArea) return null;

    const ethnicity = (input.ethnicity || '').trim();
    if (!ethnicity) {
      return {
        type: 'ETHNIC_AREA_HAN', // 占位；实际未匹配
        value: 0,
        matched: false,
        reason: '位于三州十七县两区但未填写民族，无法判定加分',
        isPriority: false,
      };
    }

    const isHan = ethnicity === '汉族';
    if (isHan) {
      return {
        type: 'ETHNIC_AREA_HAN',
        value: 10,
        matched: true,
        reason: `${input.city || ''}${input.county || ''} 汉族（三州十七县两区 +10）`,
        isPriority: false,
      };
    }

    return {
      type: 'ETHNIC_AREA_MINORITY',
      value: 20,
      matched: true,
      reason: `${input.city || ''}${input.county || ''} ${ethnicity}（三州十七县两区少数民族 +20）`,
      isPriority: false,
    };
  }
}
