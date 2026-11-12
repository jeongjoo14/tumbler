const task = await taskSpace("Open Notion link");
const page = task.page("notion");
await page.goto("https://app.notion.com/p/adapterz/1-415394a48061813c8a2ae1a35aa91c23?v=8be394a480618306bd3088bd74541008&source=copy_link");
console.log(await page.snapshot());
await task.finish({ keep: ["notion"] });