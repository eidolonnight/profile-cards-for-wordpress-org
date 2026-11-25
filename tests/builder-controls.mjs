// Shared by the browser suites. Formats are tiles and roles are chips: both are radios.
// The legacy card has no tile, since only an old link reaches it, so for that format
// the suites set the value the tiles mirror.
export async function chooseFormat(page, layout) {
  const tile = page.locator(`#format-${layout}`);
  if (await tile.count()) return tile.check();
  return page.locator('#layout').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }, layout);
}
export const chooseRole = (page, role) => page.locator(`#role-option-${role}`).check();
