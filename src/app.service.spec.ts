import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'app.environment') return 'test';
      if (key === 'app.name') return 'api';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  describe('getApiInfo', () => {
    it('should return API metadata with the correct structure', () => {
      const result = service.getApiInfo();

      expect(result).toHaveProperty('name', 'api');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('environment', 'test');
      expect(result).toHaveProperty('status', 'operational');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should use the default environment if app.environment is not set', () => {
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'app.name') return 'api';
          return defaultValue;
        });

      const result = service.getApiInfo();

      expect(result.environment).toBe('development');
    });
  });
});
