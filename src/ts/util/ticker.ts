import { addRenderingTask } from "../visuals/rendering";

export type TickingTask = (dt?: number) => any;
let tickingTasks: TickingTask[] = [];
let lastTickTime: number = null;

export function addTickingTask(task: TickingTask) {
	let index = tickingTasks.indexOf(task);
	if (index !== -1) return;

	tickingTasks.push(task);
}

export function removeTickingTask(task: TickingTask) {
	let index = tickingTasks.indexOf(task);
	if (index === -1) return;

	tickingTasks.splice(index, 1);
}

// Should run as often as possible.
export function tickAll() {
	let dt = 1000 / 250;
	let now = performance.now();

	if (lastTickTime !== null) {
		dt = now - lastTickTime;
	}
	lastTickTime = now;

	for (let i = 0; i < tickingTasks.length; i++) {
		tickingTasks[i](dt);
	}
}

setInterval(tickAll, 0);
addRenderingTask(tickAll);