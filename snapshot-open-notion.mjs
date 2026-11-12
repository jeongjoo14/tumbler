const task = await claimTaskSpace(0);
const tabs = await task.pages();
console.log(tabs);
await task.handOff();