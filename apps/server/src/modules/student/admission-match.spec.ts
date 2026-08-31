import type {
  ParsedForm,
  ParsedVolunteer,
} from "../plan-import/volunteer-form.types";
import {
  AdmissionMatchStatus,
  matchAdmissionToVolunteerForm,
  type RecognizedAdmission,
} from "./admission-match";

function volunteer(overrides: Partial<ParsedVolunteer> = {}): ParsedVolunteer {
  return {
    seq: 18,
    schoolCode: "5122",
    schoolName: "西华师范大学",
    groupCode: "105",
    majors: [
      { code: "32", name: "数学与应用数学(师范)" },
      { code: "60", name: "化学(师范)" },
      { code: "67", name: "物理学(师范)" },
      { code: "77", name: "网络空间安全" },
      { code: "07", name: "科学教育(师范)" },
      { code: "33", name: "统计学" },
    ],
    acceptAdjust: true,
    ...overrides,
  };
}

function form(
  volunteers: ParsedVolunteer[] = [volunteer()],
  batch = "本科批次B段",
): ParsedForm {
  return {
    identity: { name: "测试学生" },
    batch,
    examTypeHint: "PHYSICS",
    volunteers,
  };
}

const recognized: RecognizedAdmission = {
  batchName: "本科批B段",
  universityCode: "5122",
  universityName: "西华师范大学",
  groupCode: "105",
  majorCode: "32",
  majorName: "数学与应用数学",
};

describe("matchAdmissionToVolunteerForm", () => {
  it("样例 5122/105/32 精确定位第 18 志愿、第 1 专业，名称师范后缀差异只警告", () => {
    const result = matchAdmissionToVolunteerForm(recognized, form());

    expect(result.status).toBe(AdmissionMatchStatus.EXACT);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBe(1);
    expect(result.isAdjusted).toBe(false);
    expect(result.methods).toEqual([
      "UNIVERSITY_CODE_AND_GROUP_CODE",
      "MAJOR_CODE",
    ]);
    expect(result.warnings).toEqual([expect.stringContaining("名称")]);
  });

  it("全角代码、空白和括号归一化后仍能精确匹配", () => {
    const result = matchAdmissionToVolunteerForm(
      {
        ...recognized,
        universityCode: "【５１２２】",
        groupCode: "（１０５）",
        majorCode: "[３２]",
        majorName: " 数学与应用数学（师范） ",
      },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.EXACT);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("专业代码命中但专业名称实质冲突时要求人工复核", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorName: "计算机科学与技术" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBeNull();
    expect(result.warnings).toContain(
      "录取专业代码虽命中，但专业名称实质不一致，请人工确认",
    );
  });

  it("院校代码缺失时可按规范化校名 + 专业组号匹配", () => {
    const result = matchAdmissionToVolunteerForm(
      {
        ...recognized,
        universityCode: null,
        universityName: "【5122】 西 华 师 范 大 学",
        majorCode: null,
        majorName: "数学与应用数学（师范）",
      },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.EXACT);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBe(1);
    expect(result.methods).toEqual([
      "UNIVERSITY_NAME_AND_GROUP_CODE",
      "MAJOR_NAME",
    ]);
  });

  it("六个专业均完整、服从调剂且组目录包含实际专业时判定组内调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      {
        ...recognized,
        majorCode: "88",
        majorName: "人工智能",
      },
      form(),
      {
        groupCatalogMajors: [
          { code: "32", name: "数学与应用数学(师范)" },
          { code: "60", name: "化学(师范)" },
          { code: "67", name: "物理学(师范)" },
          { code: "77", name: "网络空间安全" },
          { code: "07", name: "科学教育(师范)" },
          { code: "33", name: "统计学" },
          { code: "88", name: "人工智能" },
        ],
      },
    );

    expect(result.status).toBe(AdmissionMatchStatus.ADJUSTED);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBeNull();
    expect(result.isAdjusted).toBe(true);
  });

  it("六个已填专业中任一项无法与组目录按代码和名称唯一对应时不得判定调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form(),
      {
        groupCatalogMajors: [
          { code: "32", name: "数学与应用数学(师范)" },
          { code: "60", name: "应用化学" },
          { code: "67", name: "物理学(师范)" },
          { code: "77", name: "网络空间安全" },
          { code: "07", name: "科学教育(师范)" },
          { code: "33", name: "统计学" },
          { code: "88", name: "人工智能" },
        ],
      },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain(
      "六个已填专业未能逐一与同组完整目录唯一对应，不能据此判定调剂",
    );
  });

  it("院校代码和专业组命中但志愿 PDF 院校名称冲突时不得锁定顺序", () => {
    const result = matchAdmissionToVolunteerForm(
      recognized,
      form([volunteer({ schoolName: "成都理工大学" })]),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBeNull();
    expect(result.majorSequenceNo).toBeNull();
    expect(result.matchedGroup).toBeNull();
    expect(result.warnings).toContain(
      "录取院校名称与志愿表中该院校代码对应的院校名称不一致，请人工复核",
    );
  });

  it("只解析出五个专业时不能判定调剂", () => {
    const fiveMajors = volunteer().majors.slice(0, 5);
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form([volunteer({ majors: fiveMajors })]),
      { groupCatalogMajors: [{ code: "88", name: "人工智能" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBeNull();
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain(
      "志愿表未完整识别出六个专业，不能据此判定调剂",
    );
  });

  it("六个槽位含重复或空专业时不能判定调剂", () => {
    const incompleteMajors = [
      ...volunteer().majors.slice(0, 4),
      { ...volunteer().majors[0] },
      { code: "", name: "" },
    ];
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form([volunteer({ majors: incompleteMajors })]),
      { groupCatalogMajors: [{ code: "88", name: "人工智能" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain(
      "志愿表未完整识别出六个专业，不能据此判定调剂",
    );
  });

  it("六个专业的原始槽位重复时不能判定调剂", () => {
    const majors = volunteer().majors.map((major, index) => ({
      ...major,
      originalOrder: index === 5 ? 5 : index + 1,
    }));
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form([volunteer({ majors })]),
      { groupCatalogMajors: [{ code: "88", name: "人工智能" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.isAdjusted).toBeNull();
  });

  it("完整目录代码命中但专业名称冲突时不能判定调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form(),
      { groupCatalogMajors: [{ code: "88", name: "临床医学" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain("完整专业组目录未确认包含该录取专业");
  });

  it("完整目录代码命中但目录专业名称为空时不能判定调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form(),
      { groupCatalogMajors: [{ code: "88", name: "" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain("完整专业组目录未确认包含该录取专业");
  });

  it("专业代码未命中时不能只按相同专业名称判为精确匹配", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "99", majorName: "数学与应用数学" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBeNull();
    expect(result.warnings).toContain(
      "录取专业代码未命中，不能仅按专业名称自动锁定，请人工确认",
    );
  });

  it("第一个专业槽位未识别、第二个专业命中时不得错报为第一个专业", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "44", majorName: "低空技术" },
      form([
        volunteer({
          majors: [
            { code: "", name: "", originalOrder: 1 },
            { code: "44", name: "低空技术", originalOrder: 2 },
          ],
        }),
      ]),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.majorSequenceNo).toBeNull();
    expect(result.warnings).toContain(
      "录取专业之前存在未识别槽位或原始专业顺序不完整，请人工确认",
    );
  });

  it("明确不服从调剂时不能判定调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, majorCode: "88", majorName: "人工智能" },
      form([volunteer({ acceptAdjust: false })]),
      { groupCatalogMajors: [{ code: "88", name: "人工智能" }] },
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBe(18);
    expect(result.isAdjusted).toBeNull();
    expect(result.warnings).toContain("志愿表未明确服从专业调剂");
  });

  it("批次明显冲突时要求复核且不返回任何志愿顺序", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, batchName: "本科批A段" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBeNull();
    expect(result.majorSequenceNo).toBeNull();
    expect(result.matchedGroup).toBeNull();
  });

  it("一侧只有本科批而另一侧明确为本科批 B 段时不得自动锁定", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, batchName: "本科批" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBeNull();
    expect(result.majorSequenceNo).toBeNull();
    expect(result.matchedGroup).toBeNull();
  });

  it("批次、普通类和科类等同义写法归一化后仍可锁定", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, batchName: "普通类（物理类） 本科批 B段" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.EXACT);
    expect(result.sequenceNo).toBe(18);
    expect(result.majorSequenceNo).toBe(1);
  });

  it("专业组未命中时返回同校候选，但主结果不写志愿顺序且不判调剂", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, groupCode: "106" },
      form([
        volunteer(),
        volunteer({ seq: 24, groupCode: "107" }),
        volunteer({
          seq: 30,
          schoolCode: "5102",
          schoolName: "成都理工大学",
          groupCode: "106",
        }),
      ]),
    );

    expect(result.status).toBe(AdmissionMatchStatus.GROUP_NOT_FOUND);
    expect(result.sequenceNo).toBeNull();
    expect(result.majorSequenceNo).toBeNull();
    expect(result.isAdjusted).toBeNull();
    expect(result.candidates.map((candidate) => candidate.sequenceNo)).toEqual([
      18, 24,
    ]);
  });

  it("截图未识别出专业组号时只返回同校候选，不自动锁定志愿顺序", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, groupCode: "" },
      form([volunteer(), volunteer({ seq: 24, groupCode: "107" })]),
    );

    expect(result.status).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.sequenceNo).toBeNull();
    expect(result.majorSequenceNo).toBeNull();
    expect(result.candidates.map((candidate) => candidate.sequenceNo)).toEqual([
      18, 24,
    ]);
  });

  it("院校代码存在但不匹配时不降级为校名精确锁定，只返回校名候选", () => {
    const result = matchAdmissionToVolunteerForm(
      { ...recognized, universityCode: "9999" },
      form(),
    );

    expect(result.status).toBe(AdmissionMatchStatus.GROUP_NOT_FOUND);
    expect(result.sequenceNo).toBeNull();
    expect(result.candidates).toEqual([
      expect.objectContaining({
        sequenceNo: 18,
        reasons: ["SAME_UNIVERSITY_NAME"],
      }),
    ]);
  });

  it("院校、专业和专业组代码均保留前导零并按字符串匹配", () => {
    const result = matchAdmissionToVolunteerForm(
      {
        batchName: "本科批次B段",
        universityCode: "0357",
        universityName: "西南民族大学",
        groupCode: "011",
        majorCode: "01",
        majorName: "数学与应用数学",
      },
      form([
        volunteer({
          seq: 7,
          schoolCode: "0357",
          schoolName: "西南民族大学",
          groupCode: "011",
          majors: [
            {
              code: "01",
              name: "数学与应用数学",
              originalOrder: 1,
            },
          ],
        }),
      ]),
    );

    expect(result.status).toBe(AdmissionMatchStatus.EXACT);
    expect(result.sequenceNo).toBe(7);
    expect(result.majorSequenceNo).toBe(1);
  });
});
