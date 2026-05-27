import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlanExportService {
  private template: Handlebars.TemplateDelegate;

  constructor(private prisma: PrismaService) {
    const tplPath = path.join(__dirname, 'templates', 'plan-export.html');
    const src = fs.readFileSync(tplPath, 'utf-8');
    this.template = Handlebars.compile(src);
  }

  renderHtml(ctx: any): string {
    return this.template(ctx);
  }

  async buildContext(planId: number) {
    const plan = await this.prisma.volunteerPlan.findUnique({
      where: { id: planId },
      include: {
        planItems: { orderBy: { sequence: 'asc' } },
        student: { include: { user: true } },
        createdBy: true,
        reviews: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    return {
      plan: {
        name: plan.name,
        versionNo: plan.versionNo,
        batchName: plan.batchName,
        versionNote: plan.versionNote ?? '',
      },
      student: {
        name: plan.student.user.realName ?? plan.student.user.username,
        school: plan.student.highSchool ?? '',
        classInfo: plan.student.classInfo ?? '',
        totalScore: plan.student.totalScore,
        rank: plan.student.provincialRank,
        examType: plan.student.examType,
      },
      teacher: {
        name: plan.createdBy.realName ?? plan.createdBy.username,
      },
      items: plan.planItems,
      reviewComments: plan.reviews.filter((r) => r.comment).map((r) => r.comment),
      generatedAt: new Date().toLocaleString('zh-CN'),
    };
  }

  async exportPdf(planId: number): Promise<Buffer> {
    const ctx = await this.buildContext(planId);
    const html = this.renderHtml(ctx);
    // Dynamic import — Puppeteer is now a regular dep (see apps/server/package.json).
    // Dynamic import is kept to avoid loading the Chromium binary at module init.
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      await this.prisma.volunteerPlan.update({
        where: { id: planId },
        data: { exportCount: { increment: 1 } },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
