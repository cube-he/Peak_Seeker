declare module 'china-area-data' {
  /**
   * Flat lookup: parentCode → { childCode: chineseName }.
   * - '86' is the root (top of country); maps to province codes.
   * - province codes map to city codes; city codes map to county codes.
   */
  const data: Record<string, Record<string, string>>;
  export default data;
}
