import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtPayloadUser } from '../casl/types';
import { PrismaService } from '../../prisma/prisma.service';
import { BonusCalcService } from './bonus-calc.service';
import type { BonusCalcInput, BonusCalcResult } from './bonus-calc.types';

/**
 * 政策计算端点（加分计算）。
 *
 * 学生端：GET /policy/bonus/me     —— 算自己的加分
 * 老师端：GET /policy/bonus/:studentProfileId —— 算指定学生的加分
 *
 * 返回 BonusCalcResult；前端直接渲染 caveats / matchedItems / appliedItem 即可。
 */
@ApiTags('政策计算')
@Controller('policy')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class PolicyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bonusCalc: BonusCalcService,
  ) {}

  @Get('bonus/me')
  @ApiOperation({ summary: '学生：自动计算自己的加分政策（含驳回原因/优先录取标记）' })
  async getMyBonus(@CurrentUser() user: JwtPayloadUser): Promise<BonusCalcResult> {
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('仅学生角色可调用此端点');
    }
    const input = await this.loadInputByUserId(user.id);
    return this.bonusCalc.calculate(input);
  }

  @Get('bonus/:studentProfileId')
  @ApiOperation({ summary: '老师/管理员：查看指定学生的加分计算结果' })
  @CheckPolicies((ability) => ability.can('read', 'StudentProfile'))
  async getStudentBonus(
    @Param('studentProfileId', ParseIntPipe) studentProfileId: number,
  ): Promise<BonusCalcResult> {
    const input = await this.loadInputByStudentProfileId(studentProfileId);
    return this.bonusCalc.calculate(input);
  }

  /** 学生端：从 user.id 反查 studentProfile + user.ethnicity */
  private async loadInputByUserId(userId: number): Promise<BonusCalcInput> {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: { select: { ethnicity: true } } },
    });
    if (!sp) throw new NotFoundException('学生档案不存在');
    return {
      ethnicity: sp.user?.ethnicity || null,
      province: sp.province,
      city: sp.city,
      county: sp.county,
      declaredItems: (sp.bonusItems as BonusCalcInput['declaredItems']) || null,
    };
  }

  /** 老师端：直接按 studentProfile.id 查 */
  private async loadInputByStudentProfileId(
    studentProfileId: number,
  ): Promise<BonusCalcInput> {
    const sp = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: { user: { select: { ethnicity: true } } },
    });
    if (!sp) throw new NotFoundException('学生档案不存在');
    return {
      ethnicity: sp.user?.ethnicity || null,
      province: sp.province,
      city: sp.city,
      county: sp.county,
      declaredItems: (sp.bonusItems as BonusCalcInput['declaredItems']) || null,
    };
  }
}
