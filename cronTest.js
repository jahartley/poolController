const cron = require('cron').CronJob;
let a = {};


a.efbn = function executeFunctionByName(functionName) {
  let args = Array.prototype.slice.call(arguments, 1);
  let namespaces = functionName.split(".");
  let context = a;
  for(var i = 0; i < namespaces.length; i++) {
    context = context[namespaces[i]];
  }
  return context.apply(context, args);
};

a.func1 = function (arg) {
	console.log(`func1 called ${arg}`);
};

a.func2 = function (arg) {
	console.log(`func2 called ${arg}`);
};

a.func3 = function () {
	console.log(`func3`);
};

a.dateObj = function returnDateObject() {
	let obj = {};
	obj.ts = Date.now();
 	let date_ob = new Date(obj.ts);
	obj.day = date_ob.getDate();
	if (obj.day < 10) {
		obj.dayString = `0${obj.day}`;
	} else {
		obj.dayString = `${obj.day}`;
	}
	obj.month = date_ob.getMonth() + 1;
	if (obj.month < 10) {
		obj.monthString = `0${obj.month}`;
	} else {
		obj.monthString = `${obj.month}`;
	}
	obj.year = date_ob.getFullYear();
	obj.yearString = `${obj.year}`;
	obj.hours = date_ob.getHours();
	if (obj.hours < 10) {
		obj.hoursString = `0${obj.hours}`;
	} else {
		obj.hoursString = `${obj.hours}`;
	}
	obj.minutes = date_ob.getMinutes();
	if (obj.minutes < 10) {
		obj.minutesString = `0${obj.minutes}`;
	} else {
		obj.minutesString = `${obj.minutes}`;
	}
	obj.seconds = date_ob.getSeconds();
	if (obj.seconds < 10) {
		obj.secondsString = `0${obj.seconds}`;
	} else {
		obj.secondsString = `${obj.seconds}`;
	}
	obj.ms = date_ob.getMilliseconds();
	if (obj.ms < 100 && obj.ms > 9) {
		obj.msString = `0${obj.ms}`
	} else if (obj.ms < 10) {
		obj.msString = `00${obj.ms}`
	} else {
		obj.msString = `${obj.ms}`
	}
	return obj;
};

var tasks = {
	test1: {
		cronStart: '0 10 0 * * *',
		cronEnd: '0 20 0 * * *',
		funcStart: 'func2',
		argStart: ['test1','nextarg'],
		funcEnd: 'func2',
		argEnd: ['test1','nextarg']

	},
	test2: {
		cron: '0 0 9 * * *',
		func: 'func1',
		arg: 'test2'
	},
	test3: {
		cron: '*/2 * * * * *',
		func: 'func3'
	}

};

a.tomorrow = function () {
	let today = new Date(Date.now());
	let tomorrow = new Date(`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return tomorrow;
}
/*
var today = a.dateObj();
var today2 = new Date();
var tomorrow = new Date(`${today.yearString}-${today.monthString}-${today.dayString}`);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setMinutes(today2.getTimezoneOffset());
console.log(today2);
console.log(today2.getTimezoneOffset());
*/
console.log(a.tomorrow());

var jobs = {};
a.buildJobs = function () {
//make all tasks into jobs
for (name in tasks) {
	//var t = tasks[x].func;
	let b = a.tomorrow();
	if ('cronStart' in tasks[name]) {
		jobs[name] = {};
		jobs[name].Start = new cron(tasks[name].cronStart, a.efbn.bind(null, tasks[name].funcStart ,tasks[name].argStart), null, true);
		jobs[name].End = new cron(tasks[name].cronEnd, a.efbn.bind(null, tasks[name].funcEnd ,tasks[name].argEnd), null, true);
		let c = jobs[name].End.nextDates(1);
		c = new Date(c);
		let d = jobs[name].Start.nextDates(1);
		d = new Date(d);
		console.log(`Start ${d} End ${c} tomorrow ${b}`)
		let y = (c - b);
		let z = (d - b);
		if (z > 0) console.log(`${name}.Start already happened today...`);
		if (y > 0) console.log(`${name}.End already happened today...`);
		if (y > 0 && z > 0) console.log(`task already ended, do nothing`);
		if (z > 0 && y < 0) console.log(`task started but didnt end yet, run start`);
		if (z < 0) console.log(`task happens later today...`);
	} else {
		jobs[name] = new cron(tasks[name].cron, a.efbn.bind(null, tasks[name].func ,tasks[name].arg), null, true);
		let c = jobs[name].nextDates(1);
		c = new Date(c);
		//let b = new Date(Date.now());
		let z = (c-b)
		if (z > 0) console.log(`${name} already happened today...`);
		console.log(`${name} happens in: ${(c-b)/1000/60}`);
	}
}
}
a.buildJobs();
// need to delete first seven, and last from string.
let c = jobs['test2'].nextDates();
let b = new Date(Date.now());
c = new Date(c);
console.log(c);
console.log(c.getHours());
console.log(b);
console.log(b.getHours());
console.log(jobs);

a.stopJobs = function stopAllJobs() {
	for (name in jobs) {
		if ('Start' in jobs[name]) {
			jobs[name].Start.stop();
			jobs[name].End.stop();
		} else {
			jobs[name].stop();
		}
	}
	jobs = null;
	jobs = {};
}
a.startJobs = function startAllJobs() {
	a.buildJobs();
}
a.counter = false;
a.alternate = function () {
	if (a.counter) {
		console.log('starting jobs')
		a.startJobs();
		a.counter = false;
	} else {
		console.log('stopping jobs')
		a.stopJobs();
		a.counter = true;
	}
}

setInterval(a.alternate, 10000);
