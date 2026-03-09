import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

// 加密配置
const ENCRYPTION_KEY =
  process.env.AI_KEY_ENCRYPTION_KEY || 'volunteer-helper-default-key-32b!';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export interface CreateAiConfigDto {
  name: string;
  provider: string;
  apiKey: string;
  apiBaseUrl?: string;
  modelName?: string;
  isDefault?: boolean;
}

export interface UpdateAiConfigDto {
  name?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  modelName?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface AiConfigResponse {
  id: string;
  name: string;
  provider: string;
  apiBaseUrl?: string;
  modelName?: string;
  isDefault: boolean;
  isActive: boolean;
  models: {
    id: string;
    modelName: string;
    displayName?: string;
    isDefault: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取所有 AI 配置（不含 API Key）
   */
  async findAll(): Promise<AiConfigResponse[]> {
    const configs = await this.prisma.aiConfig.findMany({
      include: { models: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return configs.map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      apiBaseUrl: c.apiBaseUrl ?? undefined,
      modelName: c.modelName ?? undefined,
      isDefault: c.isDefault,
      isActive: c.isActive,
      models: c.models.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        displayName: m.displayName ?? undefined,
        isDefault: m.isDefault,
      })),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * 获取单个配置
   */
  async findById(id: string): Promise<AiConfigResponse | null> {
    const config = await this.prisma.aiConfig.findUnique({
      where: { id },
      include: { models: true },
    });

    if (!config) return null;

    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      apiBaseUrl: config.apiBaseUrl ?? undefined,
      modelName: config.modelName ?? undefined,
      isDefault: config.isDefault,
      isActive: config.isActive,
      models: config.models.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        displayName: m.displayName ?? undefined,
        isDefault: m.isDefault,
      })),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * 获取默认配置
   */
  async getDefault(): Promise<AiConfigResponse | null> {
    const config = await this.prisma.aiConfig.findFirst({
      where: { isDefault: true, isActive: true },
      include: { models: true },
    });

    if (!config) {
      // 回退到任意一个激活的配置
      const fallback = await this.prisma.aiConfig.findFirst({
        where: { isActive: true },
        include: { models: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!fallback) return null;
      return this.findById(fallback.id);
    }

    return this.findById(config.id);
  }

  /**
   * 创建配置
   */
  async create(dto: CreateAiConfigDto): Promise<AiConfigResponse> {
    const encryptedKey = encrypt(dto.apiKey);

    // 如果设为默认，取消其他默认
    if (dto.isDefault) {
      await this.prisma.aiConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const config = await this.prisma.aiConfig.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        apiKeyEncrypted: encryptedKey,
        apiBaseUrl: dto.apiBaseUrl,
        modelName: dto.modelName,
        isDefault: dto.isDefault ?? false,
      },
      include: { models: true },
    });

    this.logger.log(`创建 AI 配置: ${config.name} (${config.provider})`);

    return this.findById(config.id) as Promise<AiConfigResponse>;
  }

  /**
   * 更新配置
   */
  async update(
    id: string,
    dto: UpdateAiConfigDto,
  ): Promise<AiConfigResponse | null> {
    const existing = await this.prisma.aiConfig.findUnique({ where: { id } });
    if (!existing) return null;

    // 如果设为默认，取消其他默认
    if (dto.isDefault) {
      await this.prisma.aiConfig.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.apiKey !== undefined) updateData.apiKeyEncrypted = encrypt(dto.apiKey);
    if (dto.apiBaseUrl !== undefined) updateData.apiBaseUrl = dto.apiBaseUrl || null;
    if (dto.modelName !== undefined) updateData.modelName = dto.modelName || null;
    if (dto.isDefault !== undefined) updateData.isDefault = dto.isDefault;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    await this.prisma.aiConfig.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`更新 AI 配置: ${id}`);

    return this.findById(id);
  }

  /**
   * 删除配置
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.aiConfig.delete({ where: { id } });
      this.logger.log(`删除 AI 配置: ${id}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取解密后的 API Key（内部使用）
   */
  async getDecryptedKey(id: string): Promise<string | null> {
    const config = await this.prisma.aiConfig.findUnique({
      where: { id },
      select: { apiKeyEncrypted: true },
    });

    if (!config) return null;

    try {
      return decrypt(config.apiKeyEncrypted);
    } catch (e) {
      this.logger.error(`解密 API Key 失败: ${id}`, e);
      return null;
    }
  }

  /**
   * 获取完整配置（含解密 API Key）- 供内部服务调用
   */
  async getFullConfig(id: string): Promise<{
    id: string;
    name: string;
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null> {
    const config = await this.prisma.aiConfig.findUnique({
      where: { id },
      include: { models: true },
    });

    if (!config) return null;

    const apiKey = await this.getDecryptedKey(id);
    if (!apiKey) return null;

    // 获取默认模型
    const defaultModel = config.models.find((m) => m.isDefault) || config.models[0];
    const modelName = defaultModel?.modelName || config.modelName || '';

    // 根据 provider 确定 base_url
    let baseUrl = config.apiBaseUrl || '';
    if (!baseUrl) {
      switch (config.provider) {
        case 'deepseek':
          baseUrl = 'https://api.deepseek.com/v1';
          break;
        case 'openai':
          baseUrl = 'https://api.openai.com/v1';
          break;
        case 'qwen':
          baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
          break;
      }
    }

    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      apiKey,
      baseUrl,
      model: modelName,
    };
  }

  // ========== 子模型管理 ==========

  /**
   * 添加子模型
   */
  async addModel(
    configId: string,
    modelName: string,
    displayName?: string,
    isDefault = false,
  ) {
    if (isDefault) {
      await this.prisma.aiConfigModel.updateMany({
        where: { configId },
        data: { isDefault: false },
      });
    }

    return this.prisma.aiConfigModel.create({
      data: {
        configId,
        modelName,
        displayName,
        isDefault,
      },
    });
  }

  /**
   * 更新子模型
   */
  async updateModel(
    id: string,
    data: { modelName?: string; displayName?: string; isDefault?: boolean },
  ) {
    const existing = await this.prisma.aiConfigModel.findUnique({
      where: { id },
    });
    if (!existing) return null;

    if (data.isDefault) {
      await this.prisma.aiConfigModel.updateMany({
        where: { configId: existing.configId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.aiConfigModel.update({
      where: { id },
      data,
    });
  }

  /**
   * 删除子模型
   */
  async deleteModel(id: string): Promise<boolean> {
    try {
      await this.prisma.aiConfigModel.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
