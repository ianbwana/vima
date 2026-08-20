import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { ControlPlaneDbService } from './database/control-plane-db.service';
import { REDIS_CLIENT } from './database/redis.module';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDbService: { isHealthy: jest.Mock };
  let mockRedis: { ping: jest.Mock };

  beforeEach(async () => {
    mockDbService = { isHealthy: jest.fn() };
    mockRedis = { ping: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: ControlPlaneDbService, useValue: mockDbService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  function mockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as any;
  }

  it('returns 200 with status ok when all dependencies are healthy', async () => {
    mockDbService.isHealthy.mockResolvedValue(true);
    mockRedis.ping.mockResolvedValue('PONG');

    const res = mockResponse();
    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      postgres: 'connected',
      redis: 'connected',
    });
  });

  it('returns 503 when Postgres is unreachable', async () => {
    mockDbService.isHealthy.mockResolvedValue(false);
    mockRedis.ping.mockResolvedValue('PONG');

    const res = mockResponse();
    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      postgres: 'disconnected',
      redis: 'connected',
    });
  });

  it('returns 503 when Redis is unreachable', async () => {
    mockDbService.isHealthy.mockResolvedValue(true);
    mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

    const res = mockResponse();
    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      postgres: 'connected',
      redis: 'disconnected',
    });
  });

  it('returns 503 when both dependencies are unreachable', async () => {
    mockDbService.isHealthy.mockResolvedValue(false);
    mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

    const res = mockResponse();
    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      postgres: 'disconnected',
      redis: 'disconnected',
    });
  });

  it('returns redis disconnected when ping returns unexpected value', async () => {
    mockDbService.isHealthy.mockResolvedValue(true);
    mockRedis.ping.mockResolvedValue('NOT_PONG');

    const res = mockResponse();
    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      postgres: 'connected',
      redis: 'disconnected',
    });
  });
});
