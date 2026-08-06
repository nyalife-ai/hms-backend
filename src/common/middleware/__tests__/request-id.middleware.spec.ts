import {
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from '../request-id.middleware';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('preserves an existing x-request-id header', () => {
    const req: any = { headers: { [REQUEST_ID_HEADER]: 'existing-id' } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.headers[REQUEST_ID_HEADER]).toBe('existing-id');
    expect(res.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'existing-id',
    );
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when no request id is present', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(typeof req.headers[REQUEST_ID_HEADER]).toBe('string');
    expect(req.headers[REQUEST_ID_HEADER].length).toBeGreaterThan(10);
    expect(res.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      req.headers[REQUEST_ID_HEADER],
    );
    expect(next).toHaveBeenCalled();
  });
});
