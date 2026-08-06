import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  const mockAppService = {
    getApiInfo: jest.fn().mockReturnValue({
      name: 'api',
      version: '1.0.0',
      environment: 'test',
      status: 'operational',
      timestamp: '2026-07-25T12:00:00.000Z',
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should call AppService.getApiInfo exactly once', () => {
      appController.getApiInfo();
      expect(appService.getApiInfo).toHaveBeenCalledTimes(1);
    });

    it('should return the API info object provided by AppService', () => {
      const result = appController.getApiInfo();

      expect(result).toEqual({
        name: 'api',
        version: '1.0.0',
        environment: 'test',
        status: 'operational',
        timestamp: '2026-07-25T12:00:00.000Z',
      });
    });
  });
});
