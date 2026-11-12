const task = await taskSpace("inspect notion page");
const page = task.page("p1");
await page.goto("https://app.notion.com/p/adapterz/a13394a4806182068ad4012f04110d4b?v=8be394a480618306bd3088bd74541008&source=copy_link");
await page.waitForTimeout(5000);
console.log("URL", await page.url());
console.log(await page.snapshot());
await task.finish({keep: []});