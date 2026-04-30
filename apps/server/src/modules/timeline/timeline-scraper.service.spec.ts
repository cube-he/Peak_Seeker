import { TimelineScraperService } from './timeline-scraper.service';
import { TimelineService } from './timeline.service';

describe('TimelineScraperService', () => {
  let service: TimelineScraperService;
  let mockTimelineService: Partial<TimelineService>;

  beforeEach(() => {
    mockTimelineService = {
      seedYear: jest.fn(),
    };
    service = new TimelineScraperService(mockTimelineService as TimelineService);
  });

  describe('matchTitle - 2025年真实公告标题', () => {
    it('should match 高考结束', () => {
      expect(service.matchTitle('我省2025年普通高考顺利结束'))
        .toEqual({ key: 'gaokao', status: 'completed' });
    });

    it('should match 成绩查询方式公布', () => {
      expect(service.matchTitle('考生注意！我省2025年高考成绩查询方式公布'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 成绩分段统计表', () => {
      expect(service.matchTitle('官方发布！四川省2025年普通高考物理类成绩分段统计表出炉'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 录取控制分数线', () => {
      expect(service.matchTitle('官方发布！四川省2025年普通高校招生录取控制分数线'))
        .toEqual({ key: 'score_query', status: 'available' });
    });

    it('should match 本科提前批A段投档录取开始', () => {
      expect(service.matchTitle('我省2025年普通类本科提前批A段投档录取开始 计划总体满足率高'))
        .toEqual({ key: 'early_batch', status: 'in_progress' });
    });

    it('should match 本科提前批A段征集志愿（第1次）', () => {
      expect(service.matchTitle('关于本科提前批次A段未完成计划高校征集志愿的通知'))
        .toEqual({ key: 'early_batch', status: 'collecting_1' });
    });

    it('should match 本科提前批B段投档录取开始', () => {
      expect(service.matchTitle('我省2025年普通类本科提前批次B段投档录取开始'))
        .toEqual({ key: 'early_batch', status: 'in_progress' });
    });

    it('should match 本科提前批B段第二次征集志愿', () => {
      expect(service.matchTitle('关于本科提前批次B段未完成计划高校第二次征集志愿的通知'))
        .toEqual({ key: 'early_batch', status: 'collecting_2' });
    });

    it('should match 本科批次A段国家专项征集志愿', () => {
      expect(service.matchTitle('关于本科批次A段国家专项计划未完成计划高校征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_1' });
    });

    it('should match 本科批次A段第二次征集', () => {
      expect(service.matchTitle('关于本科批次A段国家专项计划第二次、地方专项计划第一次征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_2' });
    });

    it('should match 本科批次B段投档', () => {
      expect(service.matchTitle('我省2025年普通类本科批次B段今日投档'))
        .toEqual({ key: 'regular_batch', status: 'in_progress' });
    });

    it('should match 本科批次B段第三次征集', () => {
      expect(service.matchTitle('关于本科批次B段第三次征集志愿的通知'))
        .toEqual({ key: 'regular_batch', status: 'collecting_3' });
    });

    it('should match 专科提前批正在录取', () => {
      expect(service.matchTitle('我省2025年普通类高职（专科）提前批次正在录取'))
        .toEqual({ key: 'vocational_batch', status: 'in_progress' });
    });

    it('should match 专科批次开始录取', () => {
      expect(service.matchTitle('我省2025年普通类高职（专科）批次开始录取'))
        .toEqual({ key: 'vocational_batch', status: 'in_progress' });
    });

    it('should match 专科批次征集志愿', () => {
      expect(service.matchTitle('关于专科批次征集志愿的通知（含物理类计划）'))
        .toEqual({ key: 'vocational_batch', status: 'collecting_1' });
    });

    it('should match 全部录取结束', () => {
      expect(service.matchTitle('我省2025年普通高校招生录取顺利结束 共录取68.71万人'))
        .toEqual({ key: '__all__', status: 'completed' });
    });

    it('should return null for unrelated announcements', () => {
      expect(service.matchTitle('四川省2026年普通高考网上报名操作指南')).toBeNull();
      expect(service.matchTitle('关于做好四川省2026年普通高校对口招生职业技能考试工作的通知')).toBeNull();
      expect(service.matchTitle('2025年下半年中小学教师资格考试（笔试）成绩即将发布')).toBeNull();
    });
  });

  describe('extractRound', () => {
    it('should return 1 when no round marker', () => {
      expect(service.extractRound('关于本科提前批次A段征集志愿的通知')).toBe(1);
    });

    it('should return 2 for 第二次', () => {
      expect(service.extractRound('关于本科提前批次B段第二次征集志愿的通知')).toBe(2);
    });

    it('should return 3 for 第三次', () => {
      expect(service.extractRound('关于本科批次B段第三次征集志愿的通知')).toBe(3);
    });
  });

  describe('parseListPage', () => {
    it('should parse announcements from HTML', () => {
      const html = `
        <ul id="list">
          <li>
            <a href="/Html/202506/Newsdetail_4308.html" target="_blank" title="我省2025年普通高考顺利结束">我省2025年普通高考顺利结束</a>
            <p>2025/6/9 18:28:00</p>
          </li>
          <li>
            <a href="/Html/202506/Newsdetail_4331.html" target="_blank" title="考生注意！我省2025年高考成绩查询方式公布">考生注意！我省2025年高考成绩查询方式公布</a>
            <p>2025/6/25 19:24:04</p>
          </li>
        </ul>
      `;
      const result = service.parseListPage(html);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: 'https://www.sceea.cn/Html/202506/Newsdetail_4308.html',
        title: '我省2025年普通高考顺利结束',
        date: '2025/6/9 18:28:00',
      });
      expect(result[1]).toEqual({
        url: 'https://www.sceea.cn/Html/202506/Newsdetail_4331.html',
        title: '考生注意！我省2025年高考成绩查询方式公布',
        date: '2025/6/25 19:24:04',
      });
    });
  });
});
