import { hasNextResourceTagPage } from '../../src/funcs/core/resource-tag-page';

describe('hasNextResourceTagPage', () => {
  it.each([
    { name: 'missing token', paginationToken: undefined, expected: false },
    { name: 'empty token', paginationToken: '', expected: false },
    { name: 'next page token', paginationToken: 'page-2', expected: true },
  ])('$name', ({ paginationToken, expected }) => {
    expect(hasNextResourceTagPage(paginationToken)).toBe(expected);
  });
});
