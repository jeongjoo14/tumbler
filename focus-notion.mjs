const task = await claimTaskSpace(0);
const page = task.userPage();
await page.bringToFront();
await task.handOff();