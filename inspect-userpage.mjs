const task = await claimTaskSpace(0);
const page = task.userPage();
console.log(Object.keys(page));
console.log(await page.title());
console.log(await page.url());
console.log(await page.snapshot());