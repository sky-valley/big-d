/**
 * ASCII banner printed at startup.
 */

const BANNER = `
 _     ___   ___  ___
| |   / _ \\ / _ \\| _ \\
| |__| (_) | (_) |  _/
|____|\\___/ \\___/|_|
  adaptive agent loop
`;

export function printBanner(): void {
  console.log(BANNER);
}
