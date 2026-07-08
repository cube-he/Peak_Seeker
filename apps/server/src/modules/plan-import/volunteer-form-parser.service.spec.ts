import { VolunteerFormParserService } from './volunteer-form-parser.service';

describe('VolunteerFormParserService.parseFormText', () => {
  let service: VolunteerFormParserService;
  beforeEach(() => { service = new VolunteerFormParserService(); });

  const HEADER = '本科批次B段 序号 院校 专业组 专业 是否服从 专业调剂';
  const PAGE_FOOTER = '26510108150957-测试-9班 2026-6-29';
  const IDENTITY = '四川省2026年普通高校招生考生志愿表 考生号：26510108150957 性别：女 考生姓名：测试 证件号：510181****0029 外语语种：英语 报考类别：普通类 选科组合：物理,化学,地理 考试类型：全国统考';

  it('解析批次 + 身份(姓名/考生号/证件号/班级/选科) + examTypeHint=PHYSICS', () => {
    const text = HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学与应用数学 是 ' + PAGE_FOOTER + ' ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.batch).toBe('本科批次B段');
    expect(r.identity.name).toBe('测试');
    expect(r.identity.examNumber).toBe('26510108150957');
    expect(r.identity.idMasked).toBe('510181****0029');
    expect(r.identity.classInfo).toBe('9班');
    expect(r.examTypeHint).toBe('PHYSICS');
    expect(r.volunteers).toHaveLength(1);
  });

  it('每条志愿: schoolCode/groupCode/majors(；分隔)/acceptAdjust=是→true; seq 来自第一志愿编号', () => {
    const text = HEADER + ' 第一志愿05 （平行志愿） 5002 重庆交通大学 501 40 新能源材料；44 低空技术 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers).toHaveLength(1);
    const v = r.volunteers[0];
    expect(v.seq).toBe(5);
    expect(v.schoolCode).toBe('5002');
    expect(v.schoolName).toBe('重庆交通大学');
    expect(v.groupCode).toBe('501');
    expect(v.acceptAdjust).toBe(true);
    expect(v.majors).toEqual([
      { code: '40', name: '新能源材料' },
      { code: '44', name: '低空技术' },
    ]);
  });

  it('行内换行空格清理: "水利水 电工程" → "水利水电工程"; "电子商 务" → "电子商务"', () => {
    const text = HEADER + ' 第一志愿01 （平行志愿） 5002 重庆交通大学 501 11 水利水 电工程；45 电子商 务 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers[0].majors).toEqual([
      { code: '11', name: '水利水电工程' },
      { code: '45', name: '电子商务' },
    ]);
  });

  it('acceptAdjust=否 → false', () => {
    const text = HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 否 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers[0].acceptAdjust).toBe(false);
  });

  it('翻页噪声(页脚 + 页头重复)出现在志愿之间不影响解析, 仍按 seq 顺序', () => {
    const text = HEADER
      + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 '
      + PAGE_FOOTER + ' ' + IDENTITY + ' ' + HEADER
      + ' 第一志愿02 （平行志愿） 5102 成都理工大学 112 1M 数学 是 '
      + PAGE_FOOTER;
    const r = service.parseFormText(text);
    expect(r.volunteers.map(v => v.seq)).toEqual([1, 2]);
    expect(r.volunteers.map(v => v.schoolCode)).toEqual(['5120', '5102']);
  });

  it('院校名跨行被 PDF 切成多 token 仍解析对(组代码定位法; 兼容"南京财经大学红 山学院")', () => {
    const text = HEADER + ' 第一志愿33 （平行志愿） 3916 南京财经大学红 山学院 102 0G 税收学 是 ' + IDENTITY;
    const r = service.parseFormText(text);
    expect(r.volunteers).toHaveLength(1);
    const v = r.volunteers[0];
    expect(v.seq).toBe(33);
    expect(v.schoolCode).toBe('3916');
    expect(v.schoolName).toBe('南京财经大学红山学院');
    expect(v.groupCode).toBe('102');
    expect(v.majors).toEqual([{ code: '0G', name: '税收学' }]);
  });

  it('examTypeHint: 选科组合含历史 → HISTORY', () => {
    const IDENT_HIST = IDENTITY.replace('物理,化学,地理', '历史,政治,地理');
    const text = HEADER + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 ' + IDENT_HIST;
    expect(service.parseFormText(text).examTypeHint).toBe('HISTORY');
  });

  it('examTypeHint: 身份块缺选科时, 可从 PDF 表头的物理类/历史类推断', () => {
    const identityWithoutSubjects = '四川省2026年普通高校招生考生志愿表 考生号：26510108150957 考生姓名：测试 证件号：510181****0029';
    const text = '物理类专科批次 序号 院校 专业组 专业 是否服从 专业调剂'
      + ' 第一志愿01 （平行志愿） 5120 四川师范大学 111 0G 数学 是 '
      + identityWithoutSubjects;

    const r = service.parseFormText(text);

    expect(r.batch).toBe('物理类专科批次');
    expect(r.examTypeHint).toBe('PHYSICS');
    expect(r.volunteers).toHaveLength(1);
  });
});
