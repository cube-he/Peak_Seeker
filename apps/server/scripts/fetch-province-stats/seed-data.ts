import type { CanonicalSubject } from '../../src/scripts/etl-predict-rank/subject-normalize';

export interface ProvinceYearStatRow {
  province: '四川';
  year: number;
  examType: CanonicalSubject;
  registrants: number | null;
  examineesActual: number | null;
  source: string; // semicolon-separated URLs from sources.md
  notes: string | null;
}

/**
 * Researched values from sources.md (2026-05-04).
 * Each row cross-validated with at least 2 sources where possible.
 * rankedCount intentionally absent here — populated by ETL from score_segments.
 *
 * Data quality tiers:
 *   A = official precise (e.g. 2018 science/arts split from score-distribution table header)
 *   B = derivable from official source (e.g. cumulative count at 专科线 150 = total participants)
 *   C = estimated via pass-rate back-calculation; error ±3-5%
 *
 * 2025 note: registrants = 报名选科人数 (pre-exam); examineesActual = actual June test-takers
 * from one-per-score table. 327,018 + 233,352 = 560,370 (registrants);
 * 284,789 + 177,978 = 462,767 above 专科线, implying ~571,700 total exam-takers.
 */
export const PROVINCE_YEAR_STATS: ProvinceYearStatRow[] = [
  // ── 2025 (新高考首届, 3+1+2) ──────────────────────────────────────────────
  {
    province: '四川',
    year: 2025,
    examType: '物理',
    registrants: 327018,
    examineesActual: 284789,
    source:
      'https://www.sxwd.cn/jyzx/gkzx/1627.html; https://www.sceea.cn/Html/202506/Newsdetail_4335.html',
    notes:
      'registrants=报名选科人数(B级); examineesActual=一分一段150分位次(B级). 新高考首届.',
  },
  {
    // 物理类 + 选化学 子池 (用于 subjectRequirements 含化学的专业组)
    // 224,560 (化生) + 52,826 (化地) + 30,624 (化政) + 极少长尾 ≈ 307,910 (94.16% of 物理类)
    province: '四川',
    year: 2025,
    examType: '物理化学',
    registrants: 307910,
    examineesActual: null, // 不另算实参，按 物理 类 examineesActual × 94.16% 隐含
    source:
      'https://www.163.com/dy/article/K1C7VSSN0536NZ17.html; https://www.sxwd.cn/jyzx/gkzx/1627.html',
    notes:
      '化生224560 + 化地52826 + 化政30624 (A级官方公开数据汇总). 用于物理类专业组要求"化学"时缩小池子.',
  },
  {
    province: '四川',
    year: 2025,
    examType: '历史',
    registrants: 233352,
    examineesActual: 177978,
    source:
      'https://www.sxwd.cn/jyzx/gkzx/1627.html; https://www.sceea.cn/Html/202506/Newsdetail_4335.html',
    notes:
      'registrants=报名选科人数(B级); examineesActual=一分一段150分位次(B级). 新高考首届.',
  },
  {
    province: '四川',
    year: 2025,
    examType: '全部',
    registrants: 560370,
    examineesActual: 571700,
    source:
      'https://www.sxwd.cn/jyzx/gkzx/1627.html; https://app.gaokaozhitongche.com/news/h/xO3EB0o2',
    notes:
      'registrants仅含普通类选科考生(不含体艺); examineesActual=官方57.17万统考人数(B级). 两数口径不同.',
  },

  // ── 2024 (旧高考末届) ──────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2024,
    examType: '物理',
    registrants: null,
    examineesActual: 301825,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240623_2618657.shtml; https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240624_2618669.shtml',
    notes:
      'examineesActual=理工类一分一段专科线150分位次(B级); registrants未拆分到理/文.',
  },
  {
    province: '四川',
    year: 2024,
    examType: '历史',
    registrants: null,
    examineesActual: 201953,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240623_2618652.shtml; https://www.scsqw.cn/gzdt/zyhy/content_150559',
    notes: 'examineesActual=文史类一分一段专科线150分位次(B级).',
  },
  {
    province: '四川',
    year: 2024,
    examType: '全部',
    registrants: 835200,
    examineesActual: 595400,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240624_2618669.shtml; https://www.huaon.com/channel/distdata/996706.html',
    notes: 'registrants含高职单招(A级); examineesActual=实际参加夏季统考(A级).',
  },

  // ── 2023 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2023,
    examType: '物理',
    registrants: null,
    examineesActual: 295500,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202306/t20230625_2447135.shtml; https://xueqiu.com/7475643401/253944801',
    notes: 'examineesActual=约数(C级); 来源报"约29.55万", 取295,500.',
  },
  {
    province: '四川',
    year: 2023,
    examType: '历史',
    registrants: null,
    examineesActual: 217800,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202306/t20230625_2447136.shtml; https://xueqiu.com/7475643401/253944801',
    notes: 'examineesActual=约数(C级); 来源报"约21.78万", 取217,800.',
  },
  {
    province: '四川',
    year: 2023,
    examType: '全部',
    registrants: 807300,
    examineesActual: 607700,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/202305/t20230530_2419876.shtml; https://xueqiu.com/7475643401/253944801',
    notes: '来源一致(A级). 理+文合计约51.3万, 其余约10万为艺体生.',
  },

  // ── 2022 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2022,
    examType: '物理',
    registrants: null,
    examineesActual: 284600,
    source:
      'https://zhuanlan.zhihu.com/p/533092488; https://gaokao.eol.cn/si_chuan/dongtai/202206/t20220623_2233599.shtml',
    notes:
      'examineesActual=一分一段100分以上累计284,600(B级); 此为下界, 实际含100分以下, 理科约29万.',
  },
  {
    province: '四川',
    year: 2022,
    examType: '历史',
    registrants: null,
    examineesActual: 216000,
    source:
      'https://zhuanlan.zhihu.com/p/533600352; https://gaokao.eol.cn/si_chuan/dongtai/202206/t20220623_2233600.shtml',
    notes: 'examineesActual=估算(C级); 来源报文科约21.6万.',
  },
  {
    province: '四川',
    year: 2022,
    examType: '全部',
    registrants: 770000,
    examineesActual: 575600,
    source:
      'https://www.gk100.com/read_62014.htm; https://www.huaon.com/channel/distdata/814280.html',
    notes: '参考人数57.56万(A级).',
  },

  // ── 2021 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2021,
    examType: '物理',
    registrants: null,
    examineesActual: 259000,
    source:
      'https://www.chyxx.com/shuju/1108171.html; https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html',
    notes: 'examineesActual=估算(C级); 来源报"约25.9万". 不同来源差异约12%.',
  },
  {
    province: '四川',
    year: 2021,
    examType: '历史',
    registrants: null,
    examineesActual: 183000,
    source:
      'https://www.chyxx.com/shuju/1108171.html; https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html',
    notes:
      'examineesActual=估算(C级); 取文史二本上线67,553÷37%≈183,000. 来源存在15-20%不确定性.',
  },
  {
    province: '四川',
    year: 2021,
    examType: '全部',
    registrants: 698000,
    examineesActual: 515000,
    source:
      'https://www.chyxx.com/shuju/1108171.html; https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html',
    notes: 'registrants=69.8万; examineesActual=51.5万(A级).',
  },

  // ── 2020 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2020,
    examType: '物理',
    registrants: null,
    examineesActual: 260000,
    source:
      'https://m.thepaper.cn/baijiahao_8422724; https://www.gotohui.com/edu/list/157420.html',
    notes:
      'examineesActual=估算(C级); 总526,300-文206,000-艺体≈260,000. 注: 理科专科上线仅89,395(偏低,可能因统计口径).',
  },
  {
    province: '四川',
    year: 2020,
    examType: '历史',
    registrants: null,
    examineesActual: 206000,
    source:
      'https://m.thepaper.cn/baijiahao_8422724; https://www.sc.gov.cn/10462/10464/10797/2020/7/23/50c0a85dba7a4ffcab6d7e5baa9ea147.shtml',
    notes: 'examineesActual=估算(C级); 文史二本上线48,812÷约24%≈203,000.',
  },
  {
    province: '四川',
    year: 2020,
    examType: '全部',
    registrants: 674700,
    examineesActual: 526300,
    source:
      'https://www.sc.gov.cn/10462/10464/10797/2020/7/23/50c0a85dba7a4ffcab6d7e5baa9ea147.shtml; https://www.jianlidianping.com/5516.html',
    notes: 'registrants=67.47万(A级); examineesActual=52.63万(A级).',
  },

  // ── 2019 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2019,
    examType: '物理',
    registrants: null,
    examineesActual: 259000,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/201906/t20190623_1665643.shtml; https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml',
    notes: 'examineesActual=估算(C级); 理工二本上线166,864÷64.2%≈260,000.',
  },
  {
    province: '四川',
    year: 2019,
    examType: '历史',
    registrants: null,
    examineesActual: 206000,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/201906/t20190623_1665641.shtml; https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml',
    notes:
      'examineesActual=估算(C级); 文史二本上线67,864÷32.9%≈206,000. 注意67,864数值与2018年相同, 存在来源混淆风险.',
  },
  {
    province: '四川',
    year: 2019,
    examType: '全部',
    registrants: 654200,
    examineesActual: 528900,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml; https://m-51test-net-bucket.bj.bcebos.com/show/9454618.html',
    notes: 'registrants=65.42万(A级); examineesActual=52.89万(A级).',
  },

  // ── 2018 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2018,
    examType: '物理',
    registrants: null,
    examineesActual: 269189,
    source:
      'https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml; https://gaokao.chsi.com.cn/gkxx/zc/ss/201806/20180623/1699769241.html',
    notes: 'examineesActual=官方精确值(A级); 一分一段表头部明确注明参考人数.',
  },
  {
    province: '四川',
    year: 2018,
    examType: '历史',
    registrants: null,
    examineesActual: 215301,
    source:
      'https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml; https://gaokao.chsi.com.cn/gkxx/zc/ss/201806/20180623/1699878010-2.html',
    notes: 'examineesActual=官方精确值(A级); 来源一致.',
  },
  {
    province: '四川',
    year: 2018,
    examType: '全部',
    registrants: 620000,
    examineesActual: 533000,
    source:
      'https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml; https://gaokao.eol.cn/e_html/gk/2018luqu/',
    notes: 'registrants=62万历史新高(A级); examineesActual=53.3万(A级).',
  },

  // ── 2017 ───────────────────────────────────────────────────────────────────
  {
    province: '四川',
    year: 2017,
    examType: '物理',
    registrants: null,
    examineesActual: 269000,
    source:
      'https://www.sceea.cn/Html/201706/Newsdetail_425.html; https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170622_1532511.shtml',
    notes: 'examineesActual=估算(C级); 理工二本上线160,852÷59.8%≈269,000.',
  },
  {
    province: '四川',
    year: 2017,
    examType: '历史',
    registrants: null,
    examineesActual: 206000,
    source:
      'https://www.sceea.cn/Html/201706/Newsdetail_426.html; https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170622_1532515.shtml',
    notes: 'examineesActual=估算(C级); 文史二本上线67,258÷32.6%≈206,000.',
  },
  {
    province: '四川',
    year: 2017,
    examType: '全部',
    registrants: 582800,
    examineesActual: null,
    source:
      'https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170604_1521827.shtml; https://gaokao.eol.cn/si_chuan/dongtai/201704/t20170426_1510618.shtml',
    notes:
      'registrants=58.28万(A级). examineesActual: 无官方直接数据; 估算约47.5万但置信度低, 设null. ETL将从score_segments推算rankedCount.',
  },
];
