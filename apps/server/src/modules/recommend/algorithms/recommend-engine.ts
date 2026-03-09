import { Injectable } from '@nestjs/common';

/**
 * 推荐引擎 - 冲稳保策略计算
 */
@Injectable()
export class RecommendEngine {
  /**
   * 计算位次差
   */
  calculateRankDiff(userRank: number, admissionRank: number): number {
    return admissionRank - userRank;
  }

  /**
   * 计算录取概率
   */
  calculateAcceptRate(rankDiff: number): number {
    if (rankDiff > 10000) return 0.1;
    if (rankDiff > 5000) return 0.3;
    if (rankDiff > 0) return 0.5;
    if (rankDiff > -3000) return 0.7;
    if (rankDiff > -5000) return 0.85;
    return 0.95;
  }

  /**
   * 分类策略
   */
  classifyStrategy(rankDiff: number): 'rush' | 'stable' | 'safe' {
    if (rankDiff > 3000) return 'rush';
    if (rankDiff > -3000) return 'stable';
    return 'safe';
  }

  /**
   * 获取风险等级
   */
  getRiskLevel(acceptRate: number): 'high' | 'medium' | 'low' {
    if (acceptRate < 0.4) return 'high';
    if (acceptRate < 0.7) return 'medium';
    return 'low';
  }

  /**
   * 综合评分
   */
  calculateScore(
    item: {
      acceptRate: number;
      university: {
        is985?: boolean;
        is211?: boolean;
        isDoubleFirstClass?: boolean;
        province?: string | null;
        [key: string]: any;
      };
      major: {
        category?: string | null;
        [key: string]: any;
      };
    },
    preferences?: {
      provinces?: string[];
      majorCategories?: string[];
    },
  ): number {
    let score = 0;

    // 录取概率权重 (40%)
    score += item.acceptRate * 40;

    // 院校质量权重 (25%)
    if (item.university.is985) score += 25;
    else if (item.university.is211) score += 20;
    else if (item.university.isDoubleFirstClass) score += 15;
    else score += 10;

    // 地域偏好权重 (15%)
    if (preferences?.provinces?.includes(item.university.province || '')) {
      score += 15;
    }

    // 专业匹配权重 (20%)
    if (preferences?.majorCategories?.includes(item.major.category || '')) {
      score += 20;
    }

    return score;
  }
}
