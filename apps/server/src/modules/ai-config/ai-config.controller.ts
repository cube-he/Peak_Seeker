import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  SetMetadata,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiConfigService, CreateAiConfigDto, UpdateAiConfigDto } from './ai-config.service';

@Controller('ai-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@SetMetadata('roles', ['ADMIN', 'SUPER_ADMIN'])
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  /**
   * 获取所有 AI 配置
   */
  @Get()
  async findAll() {
    const configs = await this.aiConfigService.findAll();
    return { configs };
  }

  /**
   * 获取默认配置
   */
  @Get('default')
  async getDefault() {
    const config = await this.aiConfigService.getDefault();
    if (!config) {
      throw new HttpException('未配置默认 AI', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  /**
   * 获取单个配置
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    const config = await this.aiConfigService.findById(id);
    if (!config) {
      throw new HttpException('配置不存在', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  /**
   * 创建配置
   */
  @Post()
  async create(@Body() dto: CreateAiConfigDto) {
    try {
      return await this.aiConfigService.create(dto);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '创建失败';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * 更新配置
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAiConfigDto) {
    const config = await this.aiConfigService.update(id, dto);
    if (!config) {
      throw new HttpException('配置不存在', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  /**
   * 删除配置
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    const success = await this.aiConfigService.delete(id);
    if (!success) {
      throw new HttpException('删除失败', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }

  // ========== 子模型管理 ==========

  /**
   * 添加子模型
   */
  @Post(':id/models')
  async addModel(
    @Param('id') configId: string,
    @Body() dto: { modelName: string; displayName?: string; isDefault?: boolean },
  ) {
    return this.aiConfigService.addModel(
      configId,
      dto.modelName,
      dto.displayName,
      dto.isDefault,
    );
  }

  /**
   * 更新子模型
   */
  @Put('models/:modelId')
  async updateModel(
    @Param('modelId') modelId: string,
    @Body() dto: { modelName?: string; displayName?: string; isDefault?: boolean },
  ) {
    const model = await this.aiConfigService.updateModel(modelId, dto);
    if (!model) {
      throw new HttpException('模型不存在', HttpStatus.NOT_FOUND);
    }
    return model;
  }

  /**
   * 删除子模型
   */
  @Delete('models/:modelId')
  async deleteModel(@Param('modelId') modelId: string) {
    const success = await this.aiConfigService.deleteModel(modelId);
    if (!success) {
      throw new HttpException('删除失败', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }
}
