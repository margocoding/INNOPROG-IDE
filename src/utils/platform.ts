/** Pure browser-platform detection; UI modules must not import the app entry. */
export function isDesktop() {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('windows') || userAgent.includes('macintosh');
}
