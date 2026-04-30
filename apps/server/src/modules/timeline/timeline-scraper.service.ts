import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TimelineService } from './timeline.service';

export interface ScrapedAnnouncement {
  title: string;
  date: string;
  url: string;
}

export interface StatusMatch {
  key: string;       // 'gaokao' | 'score_query' | 'early_batch' | 'regular_batch' | 'vocational_batch'
  status: string;    // 目标状态
  sourceUrl: string; // 公告链接
}

@Injectable()
export class TimelineScraperService {
  private readonly logger = new Logger(TimelineScraperService.name);

  constructor(private readonly timelineService: TimelineService) {}

  /**
   * 从公告标题列表中分析出各节点的最新状态
   * 只处理包含特定年份的公告，按日期从新到旧排序
   */
  analyzeAnnouncements(announcements: ScrapedAnnouncement[], year: number): StatusMatch[] {
    const matches: StatusMatch[] = [];
    const matched = new Set<string>(); // 每个 key 只取最新的一条
    const yearStr = String(year);

    for (const ann of announcements) {
      // 只处理当年公告：日期以当年开头，或标题含当年年份
      const isCurrentYear = ann.date.startsWith(yearStr) || ann.title.includes(yearStr);
      // 部分通知标题不含年份（如"关于本科提前批次A段...征集志愿的通知"），
      // 但如果日期属于当年6-9月（高考录取期），也视为当年公告
      const dateMonth = this.extractMonth(ann.date);
      const isAdmissionPeriod = ann.date.startsWith(yearStr) && dateMonth >= 6 && dateMonth <= 9;

      if (!isCurrentYear && !isAdmissionPeriod) continue;

      const result = this.matchTitle(ann.title);
      if (result && !matched.has(result.key)) {
        matched.add(result.key);
        matches.push({ ...result, sourceUrl: ann.url });
      }
    }

    return matches;
  }

  /**
   * 标题 → (节点key, 目标状态) 的匹配逻辑
   * 基于2025年四川省教育考试院真实公告标题模式
   */
  matchTitle(title: string): { key: string; status: string } | null {
    // 全部录取结束 → 所有节点完成（调用方需特殊处理）
    if (/录取.*(顺利)?结束/.test(title)) {
      return { key: '__all__', status: 'completed' };
    }

    // 高考结束
    if (/高考.*(顺利)?结束/.test(title)) {
      return { key: 'gaokao', status: 'completed' };
    }

    // 成绩查询 / 分数线公布
    if (/成绩.*(查询|公布|分段统计)/.test(title) || /录取控制分数线/.test(title)) {
      return { key: 'score_query', status: 'available' };
    }

    // 志愿填报时间
    if (/志愿填报时间/.test(title)) {
      return { key: 'score_query', status: 'available' };
    }

    // --- 专科批（先匹配，避免被"本科"误匹配） ---
    if (/(专科|高职)/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'vocational_batch', status: `collecting_${round}` };
      }
      if (/(投档|开始录取|正在录取)/.test(title)) {
        return { key: 'vocational_batch', status: 'in_progress' };
      }
    }

    // --- 本科提前批 ---
    if (/本科提前批/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'early_batch', status: `collecting_${round}` };
      }
      if (/(投档录取开始|开始录取|正在录取|投档$)/.test(title)) {
        return { key: 'early_batch', status: 'in_progress' };
      }
    }

    // --- 本科批（非提前批） ---
    if (/本科批次/.test(title) && !/提前/.test(title)) {
      if (/征集志愿/.test(title)) {
        const round = this.extractRound(title);
        return { key: 'regular_batch', status: `collecting_${round}` };
      }
      if (/(投档|开始录取|正在录取)/.test(title)) {
        return { key: 'regular_batch', status: 'in_progress' };
      }
    }

    return null;
  }

  /**
   * 从标题中提取征集志愿轮次
   * 无"第N次"标注 → 1，"第二次" → 2，"第三次" → 3
   */
  /**
   * 从日期字符串提取月份 (e.g. "2025/7/10 21:41:30" → 7)
   */
  private extractMonth(dateStr: string): number {
    const parts = dateStr.split('/');
    return parts.length >= 2 ? parseInt(parts[1], 10) : 0;
  }

  extractRound(title: string): number {
    const m = title.match(/第([二三四五六七八九十]+)次/);
    if (!m) return 1;
    const map: Record<string, number> = {
      '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    };
    return map[m[1]] ?? 1;
  }

  /**
   * 解析 sceea.cn 新闻列表页 HTML，提取公告标题、日期、链接
   */
  parseListPage(html: string): ScrapedAnnouncement[] {
    const results: ScrapedAnnouncement[] = [];
    const regex = /<a\s+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[^<]*<\/a>\s*<p>(\d{4}\/\d{1,2}\/\d{1,2}\s[\d:]+)<\/p>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        url: `https://www.sceea.cn${match[1]}`,
        title: match[2].trim(),
        date: match[3],
      });
    }
    return results;
  }

  /**
   * 从 sceea.cn 抓取高考新闻列表页
   */
  async fetchNewsPage(): Promise<string> {
    const url = 'https://www.sceea.cn/List/NewsList_36_1.html';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch sceea.cn: ${response.status}`);
    }
    return response.text();
  }

  /**
   * 每天凌晨4:00执行一次
   */
  @Cron('0 4 * * *')
  async handleDailyScrape(): Promise<void> {
    this.logger.log('Starting daily timeline scrape...');
    await this.scrapeAndUpdate();
  }

  /**
   * 录取期间（6-8月）每天20:00额外执行一次
   */
  @Cron('0 20 * 6-8 *')
  async handleEveningScrape(): Promise<void> {
    this.logger.log('Starting evening timeline scrape (admission period)...');
    await this.scrapeAndUpdate();
  }

  /**
   * 核心流程：抓取 → 解析 → 匹配 → 更新
   */
  async scrapeAndUpdate(): Promise<void> {
    const year = new Date().getFullYear();

    // 确保种子数据存在
    await this.timelineService.seedYear(year);

    try {
      const html = await this.fetchNewsPage();
      const announcements = this.parseListPage(html);
      this.logger.log(`Parsed ${announcements.length} announcements from sceea.cn`);

      const matches = this.analyzeAnnouncements(announcements, year);
      this.logger.log(`Found ${matches.length} status matches`);

      for (const match of matches) {
        if (match.key === '__all__') {
          await this.timelineService.completeAll(year, match.sourceUrl);
        } else {
          await this.timelineService.updateStatus(
            match.key,
            year,
            match.status,
            match.sourceUrl,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Timeline scrape failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
