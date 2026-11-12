const task = await claimTaskSpace(0);
const page = task.userPage();
console.log(await page.snapshot());
await task.finish({ keep: [] });