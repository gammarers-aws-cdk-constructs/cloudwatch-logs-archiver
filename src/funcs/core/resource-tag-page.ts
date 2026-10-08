/**
 * Whether the Resource Groups Tagging API returned another page of log groups.
 * A missing or empty token means the page just read is the last one.
 *
 * @param paginationToken - `PaginationToken` from GetResources, if the response included one.
 * @returns `true` when another GetResources call should be made.
 */
export const hasNextResourceTagPage = (paginationToken: string | undefined): boolean =>
  typeof paginationToken === 'string' && paginationToken.length > 0;
