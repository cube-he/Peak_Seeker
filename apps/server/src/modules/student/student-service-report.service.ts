import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { PrismaService } from '../../prisma/prisma.service';

const FIELD_LABEL: Record<string, string> = {
  examType: '选科类型',
  examYear: '高考年份',
  totalScore: '模考总分',
  provincialRank: '预测位次',
  firstChoice: '首选科目',
  reChoices: '再选科目',
  subjectScores: '科目成绩',
  bonusPolicyStatus: '加分政策状态',
  bonusItems: '加分项目',
  province: '省份',
  city: '城市',
  county: '区县',
  isRural: '农村户口',
  examLocationProvince: '高考所在省',
  examLocationCity: '高考所在市',
  examLocationCounty: '高考所在县',
  preferredProvinces: '意向省份',
  preferredCities: '意向城市',
  preferredMajors: '意向专业',
  preferredMajorCategories: '意向专业类别',
  preferredUniversities: '意向院校',
  excludedCities: '排除城市',
  excludedMajors: '排除专业',
  stayPreference: '留省偏好',
  acceptLevel: '调剂接受度',
  colorBlind: '色盲',
  colorWeak: '色弱',
  height: '身高',
  weight: '体重',
  visionLeft: '左眼视力',
  visionRight: '右眼视力',
  careerPlan: '升学规划',
  priorityMode: '优先模式',
  tuitionBudget: '学费预算',
};

@Injectable()
export class StudentServiceReportService {
  private template: Handlebars.TemplateDelegate;

  constructor(private prisma: PrismaService) {
    const tplPath = path.join(__dirname, 'templates', 'service-report.html');
    const src = fs.readFileSync(tplPath, 'utf-8');
    this.template = Handlebars.compile(src);
  }

  renderHtml(ctx: unknown): string {
    return this.template(ctx);
  }

  async buildContext(studentId: number) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        user: true,
        teacher: { include: { user: true } },
        volunteerPlans: {
          orderBy: { versionNo: 'desc' },
        },
        fieldChangeLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            changedBy: { select: { realName: true, username: true } },
          },
        },
      },
    });

    if (!student) throw new NotFoundException('学生不存在');

    const totalChangeLogs = await this.prisma.studentFieldChangeLog.count({
      where: { studentId },
    });

    // 沟通统计(服务期内的所有 completed consultations)
    const consultations = await this.prisma.consultationAppointment.findMany({
      where: {
        studentId,
        status: 'completed',
      },
    });
    const consultationCount = consultations.length;
    const consultationMinutes = consultations.reduce(
      (a, c) => a + (c.durationAct ?? 0),
      0,
    );
    const consultationsByChannel: Record<string, number> = {};
    for (const c of consultations) {
      consultationsByChannel[c.channel] = (consultationsByChannel[c.channel] ?? 0) + 1;
    }

    const signedAt = student.createdAt;
    const now = new Date();
    const daysServed = Math.floor(
      (now.getTime() - signedAt.getTime()) / 86_400_000,
    );

    return {
      student: {
        name: student.user.realName ?? student.user.username,
        school: student.highSchool ?? '',
        classInfo: student.classInfo ?? '',
        totalScore: student.totalScore ?? '--',
        rank: student.provincialRank ?? '--',
        examType: student.examType ?? '--',
      },
      service: {
        signedAt: signedAt.toLocaleDateString('zh-CN'),
        daysServed,
        teacherName:
          student.teacher?.user.realName ?? student.teacher?.user.username ?? '--',
      },
      stats: {
        planVersionCount: student.volunteerPlans.length,
        changeLogCount: totalChangeLogs,
      },
      plans: student.volunteerPlans.map((p) => ({
        versionNo: p.versionNo,
        batchName: p.batchName ?? '--',
        status: p.status,
        isFinal: p.isFinal,
        versionNote: p.versionNote ?? '--',
        createdAtFormatted: p.createdAt.toLocaleString('zh-CN'),
      })),
      changeLogs: student.fieldChangeLogs.map((log) => ({
        createdAtFormatted: log.createdAt.toLocaleString('zh-CN'),
        fieldLabel: FIELD_LABEL[log.fieldKey] ?? log.fieldKey,
        actorLabel: log.actor === 'student' ? '学生/家长' : '老师',
        changedByName:
          log.changedBy.realName ?? log.changedBy.username,
      })),
      consultations: {
        count: consultationCount,
        totalMinutes: consultationMinutes,
        hours: Math.floor(consultationMinutes / 60),
        mins: consultationMinutes % 60,
        byChannel: Object.entries(consultationsByChannel).map(([k, v]) => ({
          channel:
            k === 'phone'
              ? '电话'
              : k === 'wechat'
                ? '微信'
                : k === 'in_person'
                  ? '线下'
                  : k === 'video'
                    ? '视频'
                    : k,
          count: v,
        })),
      },
      generatedAt: now.toLocaleString('zh-CN'),
    };
  }

  async exportPdf(studentId: number): Promise<Buffer> {
    const ctx = await this.buildContext(studentId);
    const html = this.renderHtml(ctx);
    // @ts-ignore — puppeteer is optional
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new' as any,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
