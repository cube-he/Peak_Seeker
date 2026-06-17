/**
 * Plan: batch recommendation page Task 4
 * 把 6 主批次的 eligibilityRules JSON (含 subsets) 写入 batch_configs 表
 *
 * 数据源:
 *   - 子类别规则: docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 五
 *   - 县名单 seed: data/seed/batch-region-counties.json
 *
 * 用法 (生产服):
 *   cd /home/ubuntu/apps/volunteer-helper/apps/server && \
 *   set -a && . ./.env && set +a && \
 *   ts-node --transpileOnly scripts/seed-batch-eligibility-rules.ts
 *
 * 幂等: 每次跑都全量 update, 可重复执行。
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';

// adapter-mariadb 7.x 期望:
//   1. 第一个参数是字符串 (config), 第二个是 options;
//   2. URL scheme 必须 'mariadb://' 而非 'mysql://' (rewriteConnectionString
//      会 reject "mysql://" 抛 "error parsing connection string").
// .env 里通常配的 mysql://, 这里 swap 成 mariadb:// 给 adapter.
const rawUrl = process.env.DATABASE_URL!;
const adapterUrl = rawUrl.startsWith('mysql://') ? 'mariadb://' + rawUrl.slice(8) : rawUrl;
const adapter = new PrismaMariaDb(adapterUrl);
const prisma = new PrismaClient({ adapter } as any);

const COUNTIES_JSON_PATH = join(__dirname, '../../../data/seed/batch-region-counties.json');

function flatten(json: any, key: string): string[] {
  return Object.values(json[key].counties).flat() as string[];
}

const counties = JSON.parse(readFileSync(COUNTIES_JSON_PATH, 'utf-8'));
const REGION_119 = flatten(counties, 'appendix_2_119');
const REGION_143 = flatten(counties, 'appendix_4_143');
const REGION_88 = flatten(counties, 'appendix_5_88');
const REGION_68 = flatten(counties, 'appendix_1_68'); // 集中连片特困+扶贫重点 (国家专项/地方优师)
const REGION_SANZHOU7 = flatten(counties, 'sanzhou_7xian_1qu_56'); // 三州七县一区 (区域教育均衡)
const REGION_SANZHOU17 = flatten(counties, 'sanzhou_17xian_2qu'); // 三州十七县两区 (省属少民预科)
const REGION_SANZHOU = flatten(counties, 'sanzhou_48'); // 阿坝/甘孜/凉山三州 (民语为主)

if (REGION_119.length !== 119) throw new Error(`119 expected, got ${REGION_119.length}`);
if (REGION_143.length !== 143) throw new Error(`143 expected, got ${REGION_143.length}`);
if (REGION_88.length !== 88) throw new Error(`88 expected, got ${REGION_88.length}`);
if (REGION_68.length !== 68) throw new Error(`68 expected, got ${REGION_68.length}`);
if (REGION_SANZHOU7.length !== 56) throw new Error(`56 expected, got ${REGION_SANZHOU7.length}`);
if (REGION_SANZHOU17.length !== 67) throw new Error(`67 expected, got ${REGION_SANZHOU17.length}`);
if (REGION_SANZHOU.length !== 48) throw new Error(`48 expected, got ${REGION_SANZHOU.length}`);

// 公共文件 references (复用)
const ref_119 = {
  title: '四川省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区 119 县名单',
  filename: 'policy_6_119_counties.xlsx',
  type: 'xlsx' as const,
};
const ref_143 = {
  title: '四川省 2024 省级公费师范生范围 143 县名单',
  filename: 'policy_2_143_shifan.xlsx',
  type: 'xlsx' as const,
};
const ref_88 = {
  title: '四川省乡村振兴 88 县名单',
  filename: 'policy_5_88_xiangcun.xlsx',
  type: 'xlsx' as const,
};

// —— 2025 县名单 PDF (逐县视觉核对、内嵌字体、预览无乱码) ——
const ref_fj1_68 = { title: '附件1 集中连片特困+国家扶贫重点县名单（68县）', filename: 'fj1_jizhonglianpian_68_2025.pdf', type: 'pdf' as const };
const ref_fj2_119 = { title: '附件2 民族地区/革命老区/边远名单（119县）', filename: 'fj2_minzu_bianyuan_119_2025.pdf', type: 'pdf' as const };
const ref_fj3_bushu = { title: '附件3 部属师范本研衔接公费履约任教范围', filename: 'fj3_bushu_shifan_2025.pdf', type: 'pdf' as const };
const ref_fj4_143 = { title: '附件4 省级公费师范生实施范围（143县）', filename: 'fj4_shengji_gongfei_shifan_143_2025.pdf', type: 'pdf' as const };
const ref_fj5_88 = { title: '附件5 乡村振兴实施范围（88县）', filename: 'fj5_xiangcun_zhenxing_88_2025.pdf', type: 'pdf' as const };
const ref_fj6_45 = { title: '附件6 原深度贫困县名单（45县）', filename: 'fj6_shendu_pinkun_45_2025.pdf', type: 'pdf' as const };
const ref_sanzhou17 = { title: '三州十七县两区（民族地区范围）', filename: 'fj_sanzhou17xian2qu_2025.pdf', type: 'pdf' as const };

// —— 招生考试报 2025 前言「三、招生范围」各项目原文文案（前端"招生考试报原文"展开显示） ——
const POLICY = {
  guojia_zhuanxiang: '国家专项计划实施区域为我省68个原集中连片特殊困难县和原国家级扶贫开发重点县（市、区）（见附件1）。其报考条件为：申请考生具有我省实施区域当地连续3年以上户籍和当地高中连续3年学籍并实际就读、其父亲或母亲或法定监护人具有当地户籍、符合我省今年普通高考报名条件。',
  difang_zhuanxiang: '地方专项计划实施区域为我省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区[119个县（市、区），见附件2]。其报考条件为：申请考生及其父亲或母亲或法定监护人户籍地须在实施区域的农村，本人须具有当地连续3年以上户籍和当地高中连续3年学籍并实际就读、符合我省今年普通高考报名条件。',
  gaoxiao_zhuanxiang: '高校专项计划实施区域为我省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区（见附件2）。其基本报考条件为：申请考生及其父亲或母亲或法定监护人户籍地须在实施区域的农村，本人须具有当地连续3年以上户籍和当地高中连续3年学籍并实际就读、符合我省今年普通高考报名条件。有关高校可在此基础上提出其他报考要求并在招生章程（简章）中明确，确保优惠政策惠及农村学生。',
  guojia_gongfei: '国家公费师范生招生范围为全省。相关政策详见《教育部直属师范大学本研衔接师范生公费教育实施办法》[可通过省教育考试院网站（www.sceea.cn）查阅]。分专业履约任教范围（见附件3）。',
  shengji_gongfei: '凡正住户口在省级公费师范生实施范围143个县（市、区）（见附件4）且连续3年以上户籍（截止报考今年9月1日，下同）、符合我省今年普通高考报名条件并参加今年普通高考的考生在报考本县（市、区）公费师范生时优先录取。生源不足时逐步扩大至全省，根据考生报考服务地志愿择优录取。省级公费师范生实施范围县（市、区）的考生第一次填报志愿时只能填报面向本县（市、区）的省级公费师范生计划。',
  guojia_youshi: '国家优师专项招生范围为全省。国家优师专项师范生承诺毕业后到定向县（市、区）（见附件1）中小学履约任教6年。',
  difang_youshi: '凡正住户口在地方优师专项实施范围县（市、区）（见附件1）且连续3年以上户籍、符合我省当年普通高考报名条件并参加当年普通高考的考生报考本县（市、区）地方优师专项时优先录取。生源不足时逐步扩大至全省生源，根据考生报考服务地志愿择优录取。地方优师专项实施范围县（市、区）的考生第一次填报志愿时只能填报面向本县（市、区）的地方优师专项计划。',
  xiangcun: '凡正住户口在88个乡村振兴实施范围县（市、区）（见附件5）且连续3年以上户籍、符合我省今年普通高考报名条件并参加普通高考的考生，均可报考。如生源不足时，全省符合今年高考报名条件的考生均可报考。每轮投档过程中，原45个深度贫困县（市、区）（见附件6）的定向计划生源不足时，对原45个深度贫困县（市、区）的合格生源可在普通类本科录取控制分数线下20分内适当降分。',
  nongcun_yixue: '农村订单定向医学生招生对象及条件为：参加我省2025年普通高考并填报农村订单定向医学生志愿的学生；本人及父亲或母亲或法定监护人户籍地须在农村，本人具有当地连续3年以上户籍；投档成绩达到我省普通类本科录取控制分数线。第一轮志愿限实施区域内本县（市、区）合格考生填报。',
  quyu_junheng: '区域教育均衡发展专项计划的实施区域为：阿坝、甘孜、凉山三州及盐边县、马边县、峨边县、宝兴县、汉源县、石棉县、荥经县、乐山市金口河区，共56个县（市、区）（统称“三州七县一区”），高考前在实施区域具有高中阶段三年完整户籍、学籍和实际就读的考生方可报考。',
  shengshu_yuke: '省属高校少数民族预科班只招收三州十七县两区的少数民族考生（考生须具有连续三年以上当地正式户籍，即户籍2022年8月31日以前已在当地）。',
  minzu_ban: '民族班招生工作按教育部教民函〔2020〕1号文规定执行。民族班招生对象为参加今年普通高校招生统一考试的少数民族考生。民族班录取时，投档成绩包含考生录取照顾政策加分。',
  yuke_lei: '中央部门所属高校和外省属院校少数民族预科班招生按照教育部教民函〔2020〕1号文规定执行，其招生对象为参加今年普通高考的少数民族考生。边防军人子女预科招生对象为经中央军委政治工作部、教育部审定合格的边防军人子女考生。重庆大学、湖南大学边防军人子女预科，符合条件的考生均可填报。西华大学、桂林电子科技大学、太原学院、福建商学院边防军人子女预科，符合条件的考生只能填报其中1所。四川大学国防科研试验基地预科班招收我省符合有关报考条件的考生。',
  dingxiang_jiuye: '定向就业招生生源范围为全省。录取标准为达到我省普通类本科批次录取控制分数线，且不得低于该校在我省相应批次院校专业组（预科、民族班、定向就业招生除外）最低调档分数线以下20分。',
  minyu_weizhu: '“民族语言授课为主”报考对象为具有阿坝州、甘孜州、凉山州户籍和“民族语言授课为主”普通高中正式学籍的2025年毕业生。其中，“民族语言授课为主”藏文考生为甘孜州、阿坝州2025年用藏语授课的高中毕业生；“民族语言授课为主”彝文考生为凉山州2025年用彝语授课的高中毕业生。',
  jiashou_minwen: '“加授民族语文”的藏文专业只招收具有阿坝州、甘孜州、凉山州和平武县、北川县、石棉县、汉源县、宝兴县户籍的藏族考生；“加授民族语文”的彝文专业只招收具有凉山州、甘孜州、攀枝花市、乐山市和雅安市户籍的彝族考生。',
};
const ref_zhaosheng_wuli = {
  title: '招生考试报 2025 物理类前言+附件',
  filename: 'zhaosheng_2025_wuli_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_zhaosheng_lishi = {
  title: '招生考试报 2025 历史类前言+附件',
  filename: 'zhaosheng_2025_lishi_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_junjian = {
  title: '军队选拔军官和文职人员体检标准',
  filename: 'junjian_tijian.pdf',
  type: 'pdf' as const,
};
// —— 军队/公安/司法政审 (POLITICAL_REVIEW_REQUIRED) 共用 4 个 references ——
const ref_zhengshen_biao = {
  title: '征集和招录人员政治考核表（式样）',
  filename: 'zhengshen_kaohe_biao.doc',
  type: 'doc' as const,
};
const ref_zhengshen_shuoming = {
  title: '《征集和招录人员政治考核表》填写说明',
  filename: 'zhengshen_kaohe_shuoming.docx',
  type: 'doc' as const,
};
const ref_zhengshen_tongji = {
  title: '政治考核情况统计表',
  filename: 'zhengshen_tongji.docx',
  type: 'doc' as const,
};
const ref_sceea_2026_zhengshen = {
  title: '四川教育考试院 2026 军队院校政考通知 (官网)',
  filename: null,
  externalUrl: 'https://www.sceea.cn/Html/202605/Newsdetail_4815.html',
  type: 'announcement' as const,
};
// —— 公安院校专有 references (2025 版本, 待 2026 出后替换) ——
const ref_gongan_xianchang_ceshi = {
  title: '公安院校现场招生测试有关注意事项 (2025)',
  filename: 'gongan_xianchang_ceshi_zhuyi.docx',
  type: 'doc' as const,
  sourceNote: '2025 版本, 待 2026 通知出后替换',
};
const ref_gongan_huanbing_shenbao = {
  title: '公安院校公安专业招生患病经历申报表 (2025)',
  filename: 'gongan_huanbing_shenbaobiao.docx',
  type: 'doc' as const,
  sourceNote: '2025 版本, 待 2026 通知出后替换',
};
const ref_gongan_2025_sichuan_zhaosheng = {
  title: '四川省 2025 年公安院校公安专业招生通知',
  filename: 'gongan_2025_sichuan_zhaosheng.docx',
  type: 'doc' as const,
  sourceNote: '2025 版本, 待 2026 通知出后替换',
};
const ref_sceea_2025_gongan = {
  title: '四川教育考试院 2025 公安院校招生通知 (官网, 待 2026 替换)',
  filename: null,
  externalUrl: 'https://www.sceea.cn/Html/202506/Newsdetail_4309.html',
  type: 'announcement' as const,
  sourceNote: '2025 版本, 待 2026 出后替换为今年链接',
};
// —— 公安招生稳定标准 (相对稳定, 不标"待替换") ——
const ref_gongan_tineng = {
  title: '公安院校公安专业招生体能测评标准',
  filename: 'gongan_tineng_ceping.docx',
  type: 'doc' as const,
};
const ref_gongan_zhengzhi = {
  title: '公安院校公安专业招生政治考察标准',
  filename: 'gongan_zhengzhi_kaocha.docx',
  type: 'doc' as const,
};
const ref_gongan_tijian = {
  title: '公安院校公安专业招生体检标准',
  filename: 'gongan_tijian.docx',
  type: 'doc' as const,
};
// —— 定向培养军士 (高职提前批 / dingxiang_junshi) ——
const ref_dxjs_2026_jihua = {
  // 2026 计划表来自公告 4840 二维码(草料活码)→ ncstatic.clewm.net 的 .wps, 已转 PDF
  title: '四川省 2026 年定向培养军士招生计划表',
  filename: 'dxjs_2026_jihua.pdf',
  type: 'pdf' as const,
};
const ref_yingzheng_tijian = {
  title: '《应征公民体格检查标准》(国家征兵体检通用标准)',
  filename: 'yingzheng_tijian.doc',
  type: 'doc' as const,
};
const ref_sceea_2026_dxjs = {
  title: '四川教育考试院 2026 定向培养军士公告 (官网)',
  filename: null,
  externalUrl: 'https://www.sceea.cn/Html/202606/Newsdetail_4840.html',
  type: 'announcement' as const,
};
// —— 农村订单定向医学生 (mianfei_yixue) ——
const ref_noddyxs_2025 = {
  title: '四川省 2025 年农村订单定向医学生通知',
  filename: 'noddyxs_2025_sichuan.docx',
  type: 'doc' as const,
  sourceNote: '2025 版本, 待 2026 通知出后替换',
};
const ref_sceea_2025_noddyxs = {
  title: '四川教育考试院 2025 农村订单定向医学生通知 (官网, 待 2026 替换)',
  filename: null,
  externalUrl: 'https://www.sceea.cn/Html/202506/Newsdetail_4325.html',
  type: 'announcement' as const,
  sourceNote: '2025 版本, 待 2026 出后替换为今年链接',
};
// —— 司法警官类 (中央司法警官学院, 2025 占位, 待 2026 出后替换) ——
const ref_sifa_2025_zhengzhi = {
  title: '中央司法警官学院 2025 年招生政治考察表',
  filename: 'sifa_2025_zhengzhi_kaocha.docx',
  type: 'doc' as const,
  sourceNote: '2025 版本, 待 2026 通知出后替换',
};
const ref_sifa_mianshi_tijian = {
  title: '中央司法警官学院面试体检体能测试登记表',
  filename: 'sifa_mianshi_tijian_tineng.docx',
  type: 'doc' as const,
};
// —— 司法警官类 2026 (中央司法警官学院, 本科提前批A段; 公告 Newsdetail_4843, 替换上面 2025 占位) ——
const ref_sifa_2026_zhengzhi = {
  title: '中央司法警官学院 2026 年招生政治考察表',
  filename: 'sifa_2026_zhengzhi_kaocha.pdf',
  type: 'pdf' as const,
};
const ref_sifa_2026_mianshi_tijian = {
  title: '中央司法警官学院面试体检体能测试登记表 (2026)',
  filename: 'sifa_2026_mianshi_tijian_tineng.pdf',
  type: 'pdf' as const,
};
const ref_sceea_2026_sifa = {
  title: '四川教育考试院 2026 司法警官类招生通知 (官网)',
  filename: null,
  externalUrl: 'https://www.sceea.cn/Html/202606/Newsdetail_4843.html',
  type: 'announcement' as const,
};
// —— 航海类: 国标 GB 30035-2021 船员健康检查要求 ——
const ref_chuanyuan_jiankang = {
  title: '《船员健康检查要求》GB 30035-2021 (国标)',
  filename: 'chuanyuan_jiankang_jiancha_gb30035.pdf',
  type: 'pdf' as const,
};

const RULES: Record<string, any> = {
  本科批A段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_a',
        name: '普通类',
        description: '一般本科, 无特殊资格要求',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'guojia_zhuanxiang',
        name: '国家专项计划',
        description: '面向68个集中连片特困+扶贫重点县（附件1），当地连续3年户籍+学籍（不限农村）',
        policyText: POLICY.guojia_zhuanxiang,
        hardRules: [
          {
            scope: 'SUBSET', subset: '国家专项',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_68 },
          },
        ],
        softHints: ['户籍连续 3 年 + 学籍连续 3 年, 老师核实'],
        references: [ref_fj1_68, ref_zhaosheng_wuli],
      },
      {
        code: 'difang_zhuanxiang',
        name: '地方专项计划',
        description: '省属高校招收实施区域（附件2=119县）农村学生，当地连续3年户籍+学籍',
        policyText: POLICY.difang_zhuanxiang,
        hardRules: [
          {
            scope: 'SUBSET', subset: '地方专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        references: [ref_fj2_119, ref_zhaosheng_wuli],
      },
      {
        code: 'gaoshui_yundong',
        name: '高水平运动队',
        description: '具有运动员等级证书的考生',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科批B段: {
    // 子类对齐 2025 批次结构表 (投档8): 普通类本科 / 职教改革试点 / 民族班 /
    // 非西藏生源定向西藏就业 / 其他定向招生 / 部委属少民预科·边防军人子女预科·川大国防预科。
    // 高校专项不属于本批次 (独立批次, 投档7), 已移到 本科批高校专项 独立定义。
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_b',
        name: '普通类本科',
        description: '一般本科 B 段, 部分原二本院校',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'zhijiao_shidian',
        name: '本科层次职业教育人才培养改革试点',
        description: '职教本科改革试点专业, 与普通类同批填报',
        hardRules: [],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'minzu_ban',
        name: '民族班',
        description: '少数民族考生, 录取时投档成绩包含照顾政策加分',
        policyText: POLICY.minzu_ban,
        hardRules: [
          { scope: 'SUBSET', subset: '民族班', rule: 'ETHNICITY_MINORITY' },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'dingxiang_xizang',
        name: '非西藏生源定向西藏就业',
        description: '生源范围全省, 毕业定向西藏就业, 需亲笔填写申请书',
        policyText: POLICY.dingxiang_jiuye,
        hardRules: [
          { scope: 'SUBSET', subset: '定向西藏', rule: 'SERVICE_COMMITMENT' },
        ],
        softHints: ['需考生亲笔填写《报考定向西藏就业志愿申请书》, 可在批次线下40分内投档, 老师核实'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'qita_dingxiang',
        name: '其他定向招生',
        description: '定向就业招生, 生源范围全省, 不低于该校相应专业组调档线下20分',
        policyText: POLICY.dingxiang_jiuye,
        hardRules: [
          { scope: 'SUBSET', subset: '定向就业', rule: 'SERVICE_COMMITMENT' },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'yuke_lei',
        name: '部委属少民预科 / 边防军人子女预科 / 川大国防预科',
        description: '部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科',
        policyText: POLICY.yuke_lei,
        hardRules: [],
        softHints: ['少民预科限少数民族考生; 边防军人子女预科需军委政治工作部+教育部审定; 按各自条件老师核实'],
        references: [ref_zhaosheng_wuli],
      },
    ],
  },
  本科提前批A段: {
    // 该批次混合: 军事/公安/司法/航海/消防都按本科线; 综合评价子类需达特控线 (老师面谈核实).
    // 取多数口径 BATCH_LINE; 综合评价子类设 dataPending 让老师人工把关.
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'junxiao',
        name: '军队院校',
        description: '军队 27 院校, 录取后入伍 (体检按《军队选拔军官和文职人员体检标准》)',
        hardRules: [
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 20, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          // 军队体检 第三条: 男 < 162cm / 女 < 158cm 不合格
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'HEIGHT_MIN_BY_GENDER',
            params: { male: 162, female: 158 },
          },
          // 军队体检 第四条: 男 17.5-30 / 女 17-24
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'BMI_RANGE',
            params: {
              male: { min: 17.5, max: 30 },
              female: { min: 17, max: 24 },
            },
          },
          // 军队体检 第三十六条: 任何一眼裸眼 < 4.5 不合格
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'VISION_NAKED_MIN',
            params: { value: 4.5 },
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'COLOR_VISION_NORMAL',
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        softHints: ['需通过体能测试, 体重身高视力具体标准看军检 PDF, 老师跟家长核实'],
        references: [
          ref_junjian,
          ref_zhengshen_biao,
          ref_zhengshen_shuoming,
          ref_zhengshen_tongji,
          ref_sceea_2026_zhengshen,
          ref_zhaosheng_wuli,
        ],
      },
      {
        code: 'gongan',
        name: '公安院校',
        description: '公安部直属院校, 政考要求高, 体检按公安院校招生体检标准',
        hardRules: [
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 22, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          // 公安院校体检 第一条: 男 ≥170cm, 女 ≥160cm
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'HEIGHT_MIN_BY_GENDER',
            params: { male: 170, female: 160 },
          },
          // 公安院校体检 第二条: 男 17.3-27.3 / 女 17.1-25.7 (男女不同)
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'BMI_RANGE',
            params: {
              male: { min: 17.3, max: 27.3 },
              female: { min: 17.1, max: 25.7 },
            },
          },
          // 公安院校体检 第二十九条: 任何一眼裸眼 < 4.8 不合格
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'VISION_NAKED_MIN',
            params: { value: 4.8 },
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'COLOR_VISION_NORMAL',
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [
          // 公安稳定标准 (体能/政治/体检, 不随年份变)
          ref_gongan_tineng,
          ref_gongan_zhengzhi,
          ref_gongan_tijian,
          // 公安专有 (2025 占位, 等今年通知出后替换)
          ref_gongan_2025_sichuan_zhaosheng,
          ref_gongan_xianchang_ceshi,
          ref_gongan_huanbing_shenbao,
          ref_sceea_2025_gongan,
          // 政审通用 (与军队/司法共用)
          ref_zhengshen_biao,
          ref_zhengshen_shuoming,
          ref_zhengshen_tongji,
          ref_sceea_2026_zhengshen,
          ref_zhaosheng_wuli,
        ],
      },
      {
        code: 'sifa',
        name: '司法警官类',
        description: '司法部院校, 警务方向 (按司法类面试/体检/体能测试标准)',
        // 2026 公告 (中央司法警官学院, Newsdetail_4843): 报考条件/体检体能标准/政考与体检时间地点
        policyText: '中央司法警官学院 2026 年在川所有专业（含专业方向）均为提前录取，志愿报考考生须参加政治考察、面试、体检和体能测试。【报考条件】高考成绩达本科第二批录取控制分数线；国家专项计划在控制分数线下一定分数内、符合报考条件者也可报考其在川农村贫困地区定向招生专项计划相应专业。【体检标准】五官端正、体形匀称、心理健康；双侧裸眼视力均≥4.7，无色盲色弱；两耳听力均>3米；男生身高≥1.68米、体重≥50公斤，女生身高≥1.58米、体重≥45公斤；面部无明显缺陷，无文身、驼背。【体能测试】男生：俯卧撑10秒≥6次、立定跳远≥2.3米；女生：仰卧起坐10秒≥5次、立定跳远≥1.6米（每项最多测3次，取最好一次）。【政治考察】须于2026年6月30日前持《政治考察表》、准考证及复印件、二代身份证、户口本到户籍地公安派出所完成。【面试/体检/体能测试】2026年6月30日—7月1日 8:30—12:00、14:00—17:00，地点：四川省司法警官总医院新体检中心（成都市双流区学府路二段9号）。',
        hardRules: [
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          // 司法类体检: 男身高 ≥168cm / 女 ≥158cm
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'HEIGHT_MIN_BY_GENDER',
            params: { male: 168, female: 158 },
          },
          // 司法类体检: 男体重 ≥50kg / 女 ≥45kg (绝对下限, 非 BMI 区间)
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'WEIGHT_MIN_BY_GENDER',
            params: { male: 50, female: 45 },
          },
          // 司法类体检: 双侧裸眼视力均 ≥4.7
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'VISION_NAKED_MIN',
            params: { value: 4.7 },
          },
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'COLOR_VISION_NORMAL',
          },
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [
          // 司法警官专有 (中央司法警官学院 2026, 公告 Newsdetail_4843)
          ref_sifa_2026_zhengzhi,
          ref_sifa_2026_mianshi_tijian,
          ref_sceea_2026_sifa,
          // 招生考试报前言 (报考须知)。军队征集口径政审表 (zhengshen_* + 4815 军队院校政考通知)
          // 已移除: 司法警官走该校《政治考察表》+户籍地派出所, 非军队《政治考核表》, 口径不符易误导。
          ref_zhaosheng_wuli,
        ],
      },
      {
        code: 'hanghai',
        name: '航海类',
        description: '航海技术、轮机工程等专业, 视力色觉要求',
        hardRules: [
          // TODO 人工校验: GB 30035-2021 是扫描版未能 OCR, 下列为招生章程通用值,
          // 待人工核对《船员健康检查要求》后精确化
          {
            scope: 'SUBSET', subset: '航海类',
            rule: 'VISION_NAKED_MIN',
            params: { value: 4.7 },
          },
          {
            scope: 'SUBSET', subset: '航海类',
            rule: 'COLOR_VISION_NORMAL',
          },
        ],
        softHints: ['裸眼视力 4.7 以上 + 无色盲色弱 (通用值待人工核对 GB 30035), 体检表参考招生章程'],
        references: [ref_chuanyuan_jiankang, ref_zhaosheng_wuli],
      },
      {
        code: 'gaoxiao_zonghe',
        name: '高校综合评价 (北电中传等)',
        description: '艺术综合评价, 单独招生流程。文化成绩需达特殊类型招生录取控制分数线 (特控线: 2025 物理 518 / 历史 533), 老师面谈核实。',
        dataPending: true,
        references: [],
      },
      {
        code: 'feixing_jishu',
        name: '飞行技术',
        description: '民航/军航招飞，需通过招飞体检（视力、身高、心理等）+ 背景调查',
        hardRules: [
          { scope: 'SUBSET', subset: '飞行技术', rule: 'PHYSICAL_EXAM_REQUIRED' },
        ],
        softHints: ['需参加招飞体检与背景审查（民航/空军招飞标准），老师核实招生章程'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'xiaofang_jiuyuan',
        name: '消防救援',
        description: '消防救援院校，需政审 + 体检 + 体能测试',
        hardRules: [
          { scope: 'SUBSET', subset: '消防救援', rule: 'POLITICAL_REVIEW_REQUIRED' },
          { scope: 'SUBSET', subset: '消防救援', rule: 'PHYSICAL_EXAM_REQUIRED' },
        ],
        softHints: ['政审 + 体检 + 体能测试合格，老师核实招生章程'],
        references: [ref_zhengshen_biao, ref_zhaosheng_wuli],
      },
      {
        code: 'qita_a',
        name: '其他',
        description: '经批准纳入本科提前批A段录取的其他招生类型，按院校招生章程执行',
        hardRules: [],
        references: [ref_zhaosheng_wuli],
      },
    ],
  },
  本科提前批B段: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'guojia_gongfei_shifan',
        name: '国家公费师范生',
        description: '教育部直属6所师范大学，招生范围全省（不限户籍），本研衔接，履约任教6年',
        policyText: POLICY.guojia_gongfei,
        hardRules: [
          { scope: 'SUBSET', subset: '国家公费师范生', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_fj3_bushu, ref_zhaosheng_wuli],
      },
      {
        code: 'guojia_youshi',
        name: '国家优师专项',
        description: '招生范围全省（不限户籍），毕业到定向县（附件1）中小学履约任教6年',
        policyText: POLICY.guojia_youshi,
        hardRules: [
          { scope: 'SUBSET', subset: '国家优师专项', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_fj1_68, ref_zhaosheng_wuli],
      },
      {
        code: 'nongcun_dingxiang_yixue',
        name: '农村订单定向医学生',
        description: '农村户籍+当地连续3年（无指定县名单），5+3全科医师定向培养，服务期6年',
        policyText: POLICY.nongcun_yixue,
        softHints: ['本人及父亲或母亲或法定监护人户籍地须在农村，本人当地连续3年以上户籍（无指定县名单，老师核对户口）'],
        hardRules: [
          { scope: 'SUBSET', subset: '农村订单定向医学生', rule: 'RURAL_HOUSEHOLD' },
          { scope: 'SUBSET', subset: '农村订单定向医学生', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_noddyxs_2025, ref_sceea_2025_noddyxs, ref_zhaosheng_wuli],
      },
      {
        code: 'sheng_gongfei_shifan',
        name: '省级公费师范生',
        description: '户籍在省级公费师范实施范围143县（附件4）+连续3年，服务期6年',
        policyText: POLICY.shengji_gongfei,
        hardRules: [
          { scope: 'SUBSET', subset: '省级公费师范生', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_143 } },
          { scope: 'SUBSET', subset: '省级公费师范生', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_fj4_143, ref_zhaosheng_wuli],
      },
      {
        code: 'difang_youshi',
        name: '地方优师计划',
        description: '户籍在地方优师实施范围（附件1=68县）+连续3年，定向本县任教',
        policyText: POLICY.difang_youshi,
        hardRules: [
          { scope: 'SUBSET', subset: '地方优师计划', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_68 } },
          { scope: 'SUBSET', subset: '地方优师计划', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_fj1_68, ref_zhaosheng_wuli],
      },
      {
        code: 'xiangcun_zhenxing',
        name: '乡村振兴计划',
        description: '户籍在88个乡村振兴实施范围县（附件5）+连续3年',
        policyText: POLICY.xiangcun,
        hardRules: [
          { scope: 'SUBSET', subset: '乡村振兴计划', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_88 } },
          { scope: 'SUBSET', subset: '乡村振兴计划', rule: 'SERVICE_COMMITMENT', params: { years: 6 } },
        ],
        references: [ref_fj5_88, ref_fj6_45, ref_zhaosheng_wuli],
      },
      {
        code: 'qita_b',
        name: '其他',
        description: '经批准纳入本科提前批B段录取的其他招生类型（如全国重点马克思主义学院相关专业等），按院校招生章程执行',
        hardRules: [],
        references: [ref_zhaosheng_wuli],
      },
    ],
  },
  高职提前批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'dingxiang_junshi',
        name: '定向培养军士',
        description: '部分高职院校面向陆海空军方向培养, 按《应征公民体格检查标准》',
        // 2026 公告 (Newsdetail_4840): 报考条件/计划/流程/时间节点
        policyText: '报考定向培养军士须为 2026 年参加全国统考的高级中等教育学校毕业生,年龄不超过20周岁(2006年8月31日以后出生),未婚,志愿至少服现役满5年,政治和身体条件按征集义务兵规定执行。2026 年在38所地方高校高职(专科)层次招生计划内,面向全省为解放军和武警部队招收定向培养军士998人(含女军士6人,具体计划见官网附件)。执行提前批录取:7月5日17时前在专科提前批志愿栏填报「定向培养军士生」志愿。体检控制线在本科批控制线下、专科批控制线上,按招生计划数4倍划定(超本科批线的填报考生全部纳入、不计比例);政治考核由户籍地县级征兵办会同招考机构、公安部门组织,办法与标准按征集义务兵执行。学制3年取大专学历,前2.5年在校、后0.5年入伍实习。',
        hardRules: [
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'AGE_RANGE',
            params: { min: 17, max: 20, asOf: '2026-08-31' },
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          // 应征公民体格检查标准 第一条: 男 ≥160cm, 女 ≥158cm
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'HEIGHT_MIN_BY_GENDER',
            params: { male: 160, female: 158 },
          },
          // 第二条: 男 17.5 ≤ BMI < 30, 女 17 ≤ BMI < 24
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'BMI_RANGE',
            params: {
              male: { min: 17.5, max: 30 },
              female: { min: 17, max: 24 },
            },
          },
          // 第三十五条: 任何一眼裸眼 < 4.5 → 不合格
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'VISION_NAKED_MIN',
            params: { value: 4.5 },
          },
          // 第三十六条: 色弱、色盲不合格
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'COLOR_VISION_NORMAL',
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [
          // 定向军士专有 (招生计划 / 国家征兵体检 / 官网公告)
          ref_dxjs_2026_jihua,
          ref_yingzheng_tijian,
          ref_sceea_2026_dxjs,
          // 政审通用 (与军队/公安/司法共用)
          ref_zhengshen_biao,
          ref_zhengshen_shuoming,
          ref_zhengshen_tongji,
          // 军队体检 + 招生考试报物理前言
          ref_junjian,
          ref_zhaosheng_wuli,
        ],
      },
      {
        code: 'gongan_zhuanke',
        name: '公安专科',
        description: '公安类高职, 政考/体检按公安院校招生标准（身高男170/女160, 裸眼4.8, 无色盲色弱）',
        hardRules: [
          { scope: 'SUBSET', subset: '公安专科', rule: 'AGE_RANGE', params: { min: 16, max: 22, asOf: '2025-08-31' } },
          { scope: 'SUBSET', subset: '公安专科', rule: 'POLITICAL_REVIEW_REQUIRED' },
          { scope: 'SUBSET', subset: '公安专科', rule: 'HEIGHT_MIN_BY_GENDER', params: { male: 170, female: 160 } },
          { scope: 'SUBSET', subset: '公安专科', rule: 'BMI_RANGE', params: { male: { min: 17.3, max: 27.3 }, female: { min: 17.1, max: 25.7 } } },
          { scope: 'SUBSET', subset: '公安专科', rule: 'VISION_NAKED_MIN', params: { value: 4.8 } },
          { scope: 'SUBSET', subset: '公安专科', rule: 'COLOR_VISION_NORMAL' },
          { scope: 'SUBSET', subset: '公安专科', rule: 'PHYSICAL_EXAM_REQUIRED' },
        ],
        softHints: ['需通过体能测评与现场招生测试, 老师核实'],
        references: [
          ref_gongan_tineng, ref_gongan_zhengzhi, ref_gongan_tijian,
          ref_gongan_2025_sichuan_zhaosheng, ref_zhengshen_biao, ref_zhaosheng_wuli,
        ],
      },
      {
        code: 'sifa_jingyuan',
        name: '司法警院',
        description: '司法类高职, 按司法类标准（身高男168/女158, 体重男50/女45kg, 裸眼4.7, 无色盲色弱）',
        hardRules: [
          { scope: 'SUBSET', subset: '司法警院', rule: 'POLITICAL_REVIEW_REQUIRED' },
          { scope: 'SUBSET', subset: '司法警院', rule: 'HEIGHT_MIN_BY_GENDER', params: { male: 168, female: 158 } },
          { scope: 'SUBSET', subset: '司法警院', rule: 'WEIGHT_MIN_BY_GENDER', params: { male: 50, female: 45 } },
          { scope: 'SUBSET', subset: '司法警院', rule: 'VISION_NAKED_MIN', params: { value: 4.7 } },
          { scope: 'SUBSET', subset: '司法警院', rule: 'COLOR_VISION_NORMAL' },
          { scope: 'SUBSET', subset: '司法警院', rule: 'PHYSICAL_EXAM_REQUIRED' },
        ],
        softHints: ['面试/体能测试合格, 老师核实'],
        references: [ref_sifa_2025_zhengzhi, ref_sifa_mianshi_tijian, ref_zhengshen_biao, ref_zhaosheng_wuli],
      },
      {
        code: 'hanghai_zk',
        name: '航海类（专科）',
        description: '航海技术、轮机工程等专科专业, 视力色觉要求',
        hardRules: [
          { scope: 'SUBSET', subset: '航海类', rule: 'VISION_NAKED_MIN', params: { value: 4.7 } },
          { scope: 'SUBSET', subset: '航海类', rule: 'COLOR_VISION_NORMAL' },
        ],
        softHints: ['体检按《船员健康检查要求》(GB 30035), 老师核实招生章程'],
        references: [ref_chuanyuan_jiankang, ref_zhaosheng_wuli],
      },
    ],
  },
  高职批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_zhuan',
        name: '普通高职',
        description: '常规专科, 无特殊资格',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
    ],
  },
};

// DB 中实际存在的细分批次名 → 共享哪个顶层规则
// 但每个细分批次卡片只展示自己专属的 subset, 避免 4 张本科批 A 卡片重复显示
// 解决 Plan A Task 12 遗留: DB 有"本科批A段（国家专项）"等细分行而无纯"本科批A段"
//
// scoreFloor 可选 override: 多数 alias 跟 parent 即可; 但高校专项/高水平运动队等
// 分数门槛与 parent 不同, 必须 override (见调研: 高校专项走特控线 SPECIAL_LINE).
type AliasScoreFloor = { type: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE'; leniency?: number };
const BATCH_ALIASES: Array<{
  alias: string;
  parent: string;
  onlySubsets: string[];
  scoreFloor?: AliasScoreFloor;
}> = [
  { alias: '本科批A段（国家专项）', parent: '本科批A段', onlySubsets: ['guojia_zhuanxiang'] },
  { alias: '本科批A段（地方专项）', parent: '本科批A段', onlySubsets: ['difang_zhuanxiang'] },
  // 高水平运动队: 双一流要本科线; 其他高校要本科线 80% (leniency=88 ≈ 442*0.2 @2025 物理);
  //   体测特别突出可降至本科线 65% (老师面谈把关, 不写死规则).
  { alias: '本科批高水平运动队', parent: '本科批A段', onlySubsets: ['gaoshui_yundong'],
    scoreFloor: { type: 'BATCH_LINE', leniency: 88 } },
  // 提前批国家专项: 走本科线 (2025 物理 442 / 历史 503).
  { alias: '本科提前批国家专项', parent: '本科批A段', onlySubsets: ['guojia_zhuanxiang'] },
  // 高校专项是独立批次 (2025 批次结构表投档3/投档7), 不属于本科批B段 —
  // 不再走 alias, 在 PLACEHOLDER_BATCHES 用 SUBSET_GAOXIAO_ZHUANXIANG 独立定义。
];

// 高校专项子类 (本科提前批高校专项 + 本科批高校专项 两个独立批次共用)
const SUBSET_GAOXIAO_ZHUANXIANG = {
  code: 'gaoxiao_zhuanxiang',
  name: '高校专项计划',
  description: '部分高校单列，实施区域（附件2=119县）农村学生，当地连续3年户籍+学籍',
  policyText: POLICY.gaoxiao_zhuanxiang,
  hardRules: [
    {
      scope: 'SUBSET' as const, subset: '高校专项',
      rule: 'RURAL_HOUSEHOLD_IN_REGION' as const,
      params: { regions: REGION_119 },
    },
  ],
  softHints: ['当地连续3年户籍 + 当地高中连续3年学籍并实际就读, 老师核实', '中学校长实名推荐, 通过高校审核, 老师核实'],
  references: [ref_fj2_119, ref_zhaosheng_wuli],
};

// 完全独立的占位批次 (只填 dataPending placeholder)
const PLACEHOLDER_BATCHES: Record<string, any> = {
  // 高校专项: 教育部规定走特殊类型招生录取控制分数线 (特控线 518 物理 / 533 历史 @2025)
  本科提前批高校专项: {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [SUBSET_GAOXIAO_ZHUANXIANG],
  },
  本科批高校专项: {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [SUBSET_GAOXIAO_ZHUANXIANG],
  },
  本科批区域教育均衡专项: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [{
      code: 'quyu_junheng',
      name: '区域教育均衡发展专项计划',
      description: '实施区域为“三州七县一区”共56个县（市、区），高中阶段三年完整户籍+学籍+实际就读',
      policyText: POLICY.quyu_junheng,
      hardRules: [
        { scope: 'SUBSET', subset: '区域教育均衡', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_SANZHOU7 } },
      ],
      softHints: ['高中阶段三年完整户籍、学籍和实际就读, 老师核实', '第一轮志愿限本市（州）合格生源填报'],
      references: [ref_zhaosheng_wuli],
    }],
  },
  强基计划: {
    scoreFloor: { type: 'SPECIAL_LINE' },  // 强基用特殊类型线 518, 不是本科线
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [{
      code: 'qiangji',
      name: '强基计划',
      description: '基础学科拔尖人才, 5+3 校测综合评价, 单独申报',
      hardRules: [
        {
          scope: 'SUBSET', subset: '强基计划',
          rule: 'SCHOOL_RECOMMENDATION',
        },
      ],
      softHints: ['需 5 月份单独申报, 6 月校测 (笔试+面试), 综合成绩录取'],
      references: [],
    }],
  },
  省属高校少民预科: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 80 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [{
      code: 'shaomin_yuke',
      name: '省属高校少数民族预科',
      description: '只招收三州十七县两区的少数民族考生 + 连续3年当地户籍，预科1年+本科',
      policyText: POLICY.shengshu_yuke,
      hardRules: [
        {
          scope: 'SUBSET', subset: '少数民族预科',
          rule: 'ETHNICITY_MINORITY',
        },
        {
          scope: 'SUBSET', subset: '少数民族预科',
          rule: 'HOUSEHOLD_IN_REGION',
          params: { regions: REGION_SANZHOU17 },
        },
      ],
      softHints: ['连续3年以上当地正式户籍（截止2022-08-31前已在当地），老师核实'],
      references: [ref_sanzhou17, ref_zhaosheng_wuli],
    }],
  },
  '民语为主本科（含预科）': {
    scoreFloor: { type: 'BATCH_LINE', leniency: 60 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    // 2025 批次结构表行28/29: 本批次分"本科 / 预科"两个招生类型
    subsets: [
      {
        code: 'minyu_weizhu',
        name: '本科（民族语言授课为主）',
        description: '具阿坝/甘孜/凉山三州户籍 + “民族语言授课为主”普通高中正式学籍（藏文/彝文）',
        policyText: POLICY.minyu_weizhu,
        hardRules: [
          { scope: 'SUBSET', subset: '民语为主', rule: 'ETHNICITY_MINORITY' },
          { scope: 'SUBSET', subset: '民语为主', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_SANZHOU } },
        ],
        softHints: ['须具“民族语言授课为主”普通高中正式学籍（藏语/彝语授课），老师核实'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'minyu_weizhu_yuke',
        name: '预科（民族语言授课为主）',
        description: '“民族语言授课为主”预科, 只招收参加“民族语言授课为主”的高中（中专）毕业生',
        policyText: POLICY.minyu_weizhu,
        hardRules: [
          { scope: 'SUBSET', subset: '民语为主预科', rule: 'ETHNICITY_MINORITY' },
          { scope: 'SUBSET', subset: '民语为主预科', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_SANZHOU } },
        ],
        softHints: ['“民族语言授课为主”预科只招收参加“民族语言授课为主”的高中（中专）毕业生，老师核实'],
        references: [ref_zhaosheng_wuli],
      },
    ],
  },
  '民语为主高职': {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [{
      code: 'minyu_weizhu_zk',
      name: '民族语言授课为主（专科）',
      description: '具三州户籍 + “民族语言授课为主”学籍（专科批）',
      policyText: POLICY.minyu_weizhu,
      hardRules: [
        { scope: 'SUBSET', subset: '民语为主', rule: 'ETHNICITY_MINORITY' },
        { scope: 'SUBSET', subset: '民语为主', rule: 'HOUSEHOLD_IN_REGION', params: { regions: REGION_SANZHOU } },
      ],
      softHints: ['须具“民族语言授课为主”普通高中正式学籍，老师核实'],
      references: [ref_zhaosheng_wuli],
    }],
  },
  '加授民文本科': {
    scoreFloor: { type: 'BATCH_LINE', leniency: 60 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [{
      code: 'jiashou_minwen',
      name: '加授民族语文',
      description: '藏文：三州+平武/北川/石棉/汉源/宝兴的藏族；彝文：凉山/甘孜/攀枝花/乐山/雅安的彝族',
      policyText: POLICY.jiashou_minwen,
      hardRules: [
        { scope: 'SUBSET', subset: '加授民文', rule: 'ETHNICITY_MINORITY' },
      ],
      softHints: ['按藏文/彝文分别核对户籍范围（见原文），藏族/彝族考生，老师核实'],
      references: [ref_zhaosheng_wuli],
    }],
  },
  '加授民文高职': {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [{
      code: 'jiashou_minwen_zk',
      name: '加授民族语文（专科）',
      description: '藏文/彝文加授，对应市州户籍的藏族/彝族（专科批）',
      policyText: POLICY.jiashou_minwen,
      hardRules: [
        { scope: 'SUBSET', subset: '加授民文', rule: 'ETHNICITY_MINORITY' },
      ],
      softHints: ['按藏文/彝文核对户籍范围（见原文），藏族/彝族考生，老师核实'],
      references: [ref_zhaosheng_wuli],
    }],
  },
};

async function main() {
  console.log('Seeding batch recommendation rules (V2 subsets) for 四川 year=2026...');
  console.log(`Regions: 119/${REGION_119.length} 143/${REGION_143.length} 88/${REGION_88.length}`);
  let updated = 0;
  // 合并 RULES + PLACEHOLDER_BATCHES + aliases 后, 一次循环 update
  // alias 批次只展示自己的 subset (避免老师看 4 张本科批 A 重复卡片)
  const allTargets: Array<{ batch: string; rules: any }> = [];
  for (const [batch, rules] of Object.entries(RULES)) {
    allTargets.push({ batch, rules });
  }
  for (const { alias, parent, onlySubsets, scoreFloor } of BATCH_ALIASES) {
    const parentRules = RULES[parent];
    if (!parentRules) {
      console.warn(`⚠ alias "${alias}" 找不到 parent "${parent}"`);
      continue;
    }
    const filteredSubsets = parentRules.subsets.filter((s: any) => onlySubsets.includes(s.code));
    if (filteredSubsets.length === 0) {
      console.warn(`⚠ alias "${alias}" 在 parent "${parent}" 下找不到任意 onlySubsets=${onlySubsets.join(',')}`);
      continue;
    }
    allTargets.push({
      batch: alias,
      // alias 可 override scoreFloor (e.g. 高校专项走特控线; 高水平运动队加 leniency).
      rules: {
        ...parentRules,
        subsets: filteredSubsets,
        scoreFloor: scoreFloor ?? parentRules.scoreFloor,
      },
    });
  }
  for (const [batch, rules] of Object.entries(PLACEHOLDER_BATCHES)) {
    allTargets.push({ batch, rules });
  }
  for (const { batch, rules } of allTargets) {
    const configs = await prisma.batchConfig.findMany({
      where: { batch, province: '四川', year: 2026 },
    });
    if (configs.length === 0) {
      console.warn(`⚠ no batchConfig found for batch="${batch}"`);
      continue;
    }
    for (const cfg of configs) {
      await prisma.batchConfig.update({
        where: { id: cfg.id },
        data: { eligibilityRules: rules as any },
      });
      updated++;
      const subsetCount = rules.subsets?.length ?? 0;
      console.log(`✓ updated batch_configs[id=${cfg.id}] ${batch} / ${cfg.examType} (${subsetCount} subsets)`);
    }
  }
  console.log(`Total updated: ${updated} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
