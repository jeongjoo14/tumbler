const task = await taskSpace("inspect notion page 2");
const page = task.page("p1");
await page.goto("https://app.notion.com/p/adapterz/1-415394a48061813c8a2ae1a35aa91c23?v=8be394a480618306bd3088bd74541008&source=copy_link");
await page.waitForTimeout(6000);
console.log("URL", await page.url());
console.log(await page.snapshot());
await task.finish({keep: []});