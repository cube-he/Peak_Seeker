import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('new-hash'),
  compare: jest.fn(),
}));

describe('UserService 账号安全', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService(prisma as any);
  });

  describe('changePassword', () => {
    it('原密码错误时抛 BadRequestException, 不更新', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(1, 'wrong', 'newpass1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('用户不存在时抛 NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword(99, 'x', 'newpass1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('原密码正确时哈希新密码并写库', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: 'old-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({ id: 1 });

      await service.changePassword(1, 'correct', 'newpass1');

      expect(bcrypt.hash).toHaveBeenCalledWith('newpass1', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: 'new-hash' },
      });
    });
  });

  describe('changeUsername', () => {
    it('新用户名被别人占用时抛 ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'taken' });

      await expect(service.changeUsername(1, 'taken')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('用户名可用时更新并返回去掉 passwordHash 的用户', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        id: 1,
        username: 'newname',
        passwordHash: 'secret',
      });

      const result = await service.changeUsername(1, 'newname');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { username: 'newname' },
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.username).toBe('newname');
    });

    it('用户名属于自己(未改)时允许通过', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'newname' });
      prisma.user.update.mockResolvedValue({ id: 1, username: 'newname', passwordHash: 's' });

      await expect(service.changeUsername(1, 'newname')).resolves.toBeDefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
