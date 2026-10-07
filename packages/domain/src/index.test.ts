import { DEMO_USERS } from './index';

describe('@bfp/domain', () => {
  it('exposes the three demo users', () => {
    expect(DEMO_USERS.map((user) => user.role)).toEqual(['admin', 'analyst', 'business']);
  });
});
