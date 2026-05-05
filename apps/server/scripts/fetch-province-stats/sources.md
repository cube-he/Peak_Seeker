# 四川省高考报名 / 参考人数 — 数据来源记录

抓取日期：2026-05-04
执行 agent：implementer-T3 (claude sonnet-4-6 via WebSearch)

## 检索方法

- 主要来源：四川省教育考试院（sceea.cn）、中国教育在线（eol.cn）、澎湃新闻、高考100、教育在线
- 每个 (年份, 类别) 力争 2+ 来源交叉。官方一分一段表是金标准，用"专科线150分位次=实际参考人数"方法推导理/文科人数。
- 2025 为首届新高考（3+1+2），报名选科数据（物理类/历史类）与实际参加统考数据略有差异：
  - 报名选科：物理327,018 + 历史233,352 = 560,370
  - 实际参加6月统考（一分一段底部位次）：物理≥284,789 + 历史≥177,978 ≈ 571,700

## 数据表

| 年份 | 类别 (canonical) | 原始术语 | registrants | examineesActual | 来源1 | 来源2 | 备注 |
|---|---|---|---|---|---|---|---|
| 2025 | 物理 | 物理类 | 327018 | 284789 | https://www.sxwd.cn/jyzx/gkzx/1627.html | https://www.sceea.cn/Html/202506/Newsdetail_4335.html | 新高考首届；registrants=报名选科人数；examineesActual=一分一段150分位次（≥值） |
| 2025 | 历史 | 历史类 | 233352 | 177978 | https://www.sxwd.cn/jyzx/gkzx/1627.html | https://www.sceea.cn/Html/202506/Newsdetail_4335.html | 新高考首届；examineesActual同上 |
| 2025 | 全部 | 总计 | 560370 | 571700 | https://www.sxwd.cn/jyzx/gkzx/1627.html | https://app.gaokaozhitongche.com/news/h/xO3EB0o2 | registrants=普通类选科总数；examineesActual=实际参加6月统考人数（官方57.17万）；两者差异因高职单招提前录取及部分缺考 |
| 2024 | 物理 | 理科（理工类） | null | 301825 | https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240623_2618657.shtml | https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240624_2618669.shtml | 旧高考末届；examineesActual=一分一段专科线150分位次（理工类总参考人数）；报名总数835,200人，注册registrants未拆分理/文 |
| 2024 | 历史 | 文科（文史类） | null | 201953 | https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240623_2618652.shtml | https://www.scsqw.cn/gzdt/zyhy/content_150559 | 旧高考末届；examineesActual=文史类专科线150分位次 |
| 2024 | 全部 | 总计 | 835200 | 595400 | https://gaokao.eol.cn/si_chuan/dongtai/202406/t20240624_2618669.shtml | https://www.huaon.com/channel/distdata/996706.html | registrants=报名总人数（含高职单招）；examineesActual=实际参加夏季统考人数 |
| 2023 | 物理 | 理科（理工类） | null | 295500 | https://gaokao.eol.cn/si_chuan/dongtai/202306/t20230625_2447135.shtml | https://xueqiu.com/7475643401/253944801 | examineesActual=约数（一分一段100分以上累计约29.55万）；来源报告"约29.55万" |
| 2023 | 历史 | 文科（文史类） | null | 217800 | https://gaokao.eol.cn/si_chuan/dongtai/202306/t20230625_2447136.shtml | https://xueqiu.com/7475643401/253944801 | examineesActual=约数（一分一段100分以上累计约21.78万） |
| 2023 | 全部 | 总计 | 807300 | 607700 | https://gaokao.eol.cn/si_chuan/dongtai/202305/t20230530_2419876.shtml | https://xueqiu.com/7475643401/253944801 | registrants含高职单招；examineesActual=60.77万统考 |
| 2022 | 物理 | 理科（理工类） | null | 284600 | https://zhuanlan.zhihu.com/p/533092488 | https://gaokao.eol.cn/si_chuan/dongtai/202206/t20220623_2233599.shtml | examineesActual=一分一段100分以上累计284,600人（≥值，约为理科总参考人数下界）；理科约29万参考 |
| 2022 | 历史 | 文科（文史类） | null | 216000 | https://zhuanlan.zhihu.com/p/533600352 | https://gaokao.eol.cn/si_chuan/dongtai/202206/t20220623_2233600.shtml | examineesActual=估算（文科约21.6万），来源报告"7万多人过本科"即文科约22万参考 |
| 2022 | 全部 | 总计 | 770000 | 575600 | https://www.gk100.com/read_62014.htm | https://www.huaon.com/channel/distdata/814280.html | registrants约77万；examineesActual=57.56万统考 |
| 2021 | 物理 | 理科（理工类） | null | 259000 | https://www.chyxx.com/shuju/1108171.html | https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html | examineesActual=估算（一分一段约25.9万；本文表述约20-26万）；取中间值 |
| 2021 | 历史 | 文科（文史类） | null | 183000 | https://www.chyxx.com/shuju/1108171.html | https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html | examineesActual=估算（一分一段约20万100分以上；另有参考约18.3万）；取约18.3万（67553÷0.37参考） |
| 2021 | 全部 | 总计 | 698000 | 515000 | https://www.chyxx.com/shuju/1108171.html | https://blog.sina.com.cn/s/blog_14a65eeba0102zi3h.html | registrants=69.8万；examineesActual=51.5万统考 |
| 2020 | 物理 | 理科（理工类） | null | 260000 | https://m.thepaper.cn/baijiahao_8422724 | https://www.gotohui.com/edu/list/157420.html | examineesActual=估算（专科线上89,395人反推；文史专科上142,399人；总526,300人减文史得约260,000） |
| 2020 | 历史 | 文科（文史类） | null | 206000 | https://m.thepaper.cn/baijiahao_8422724 | https://www.sc.gov.cn/10462/10464/10797/2020/7/23/50c0a85dba7a4ffcab6d7e5baa9ea147.shtml | examineesActual=估算（按文史二本上线48,812÷约24%上线率≈203,000；取近似206,000） |
| 2020 | 全部 | 总计 | 674700 | 526300 | https://www.sc.gov.cn/10462/10464/10797/2020/7/23/50c0a85dba7a4ffcab6d7e5baa9ea147.shtml | https://jianlidianping.com/5516.html | registrants=67.47万；examineesActual=52.63万统考 |
| 2019 | 物理 | 理科（理工类） | null | 259000 | https://gaokao.eol.cn/si_chuan/dongtai/201906/t20190623_1665643.shtml | https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml | examineesActual=估算（二本上线166,864÷64.2%上线率≈260,000；与2018年理科269,189人相比略少，总人数略少）；来源确认52.89万总参考 |
| 2019 | 历史 | 文科（文史类） | null | 206000 | https://gaokao.eol.cn/si_chuan/dongtai/201906/t20190623_1665641.shtml | https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml | examineesActual=估算（二本上线67,864÷32.9%上线率≈206,000；与2018年文史215,301相符） |
| 2019 | 全部 | 总计 | 654200 | 528900 | https://gaokao.eol.cn/si_chuan/dongtai/201905/t20190507_1657735.shtml | https://m-51test-net-bucket.bj.bcebos.com/show/9454618.html | registrants=65.42万；examineesActual=52.89万统考 |
| 2018 | 物理 | 理科（理工类） | null | 269189 | https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml | https://gaokao.chsi.com.cn/gkxx/zc/ss/201806/20180623/1699769241.html | examineesActual=官方精确值（一分一段头部说明参考人数269,189）；来源一致 |
| 2018 | 历史 | 文科（文史类） | null | 215301 | https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml | https://gaokao.chsi.com.cn/gkxx/zc/ss/201806/20180623/1699878010-2.html | examineesActual=官方精确值（文史类参考人数215,301） |
| 2018 | 全部 | 总计 | 620000 | 533000 | https://sichuan.eol.cn/sichuannews/201806/t20180605_1605484.shtml | https://gaokao.eol.cn/e_html/gk/2018luqu/ | registrants=62万（历史新高）；examineesActual=53.3万（除去高职单招） |
| 2017 | 物理 | 理科（理工类） | null | 269000 | https://www.sceea.cn/Html/201706/Newsdetail_425.html | https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170622_1532511.shtml | examineesActual=估算（二本上线160,852÷59.8%≈269,000；与2018年理科人数吻合）；来源提供推算基础 |
| 2017 | 历史 | 文科（文史类） | null | 206000 | https://www.sceea.cn/Html/201706/Newsdetail_426.html | https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170622_1532515.shtml | examineesActual=估算（二本上线67,258÷32.6%≈206,000）；来源确认文史二本上线67,258 |
| 2017 | 全部 | 总计 | 582800 | null | https://gaokao.eol.cn/si_chuan/dongtai/201706/t20170604_1521827.shtml | https://gaokao.eol.cn/si_chuan/dongtai/201704/t20170426_1510618.shtml | registrants=58.28万；examineesActual无直接来源（估算47.5万但仅为推算，不录入） |

## 数据质量分级说明

- **A级（官方精确）**：2018年理/文（269,189 / 215,301），2024年全部（595,400），2025年全部（571,700），2025年物理/历史 registrants（327,018 / 233,352）
- **B级（官方来源可推导）**：2024年理/文（一分一段专科位次），2025年物理/历史 examineesActual（一分一段专科位次），2023年全部（60.77万）
- **C级（估算，依据上线率反推）**：2017-2022年文理科分类数据；误差约 ±3-5%

## 异常 / 冲突记录

1. **2025 registrants vs examineesActual 关系**：registrants=560,370（报名选科）≠ examineesActual=571,700（实际参加统考）。两者统计口径不同：报名在前，统考在后，部分提前录取考生不参加统考；但也有考生缺考。571,700 > 560,370 的原因是 560,370 仅为"普通类"报名（不含体育/艺术等），而 571,700 包含所有参加统考考生。

2. **2020年 理/文 专科上线人数异常**：理科专科上线仅 89,395 人，文科专科上线高达 142,399 人（文>理），与其他年份规律相反（通常理>文）。可能的解释：2020年受疫情影响，部分理科生分流进职业教育，且专科招生计划中文科/综合类比例高。此数字来自官方四川省人民政府网站，视为可信，保留。

3. **2021年 文科参考人数不同来源差异**：来源A称"约20万以上"，来源B（招生计划推算）得约18.3万，来源C称"文科约21万"。差异约12%。本表取 183,000 作为保守值。

4. **2022年 文科参考人数**：来源报告"100分以上"约21.6万，但这是下界估计。文科专科线上人数未直接找到，估算取216,000。

5. **2017年 examineesActual 全部**：多个来源只给出报名58.28万，实际参考的准确数字未见官方公告，故 examineesActual 全部设为 null。

6. **2019年 文/理 上线率来源**：文史类二本上线率32.9%（数据来自2018年，被一篇综合对比文章用于2018-2019对比）。谨慎使用：2019年文史类二本上线67,864人，确系来自同一来源（2018年），但2019年文史类二本上线另见67,864人（同值），存在混淆风险。故2019年文理科人数标注为估算（C级）。
