
const cfg = require('./poolConfig'); //pool startup config
const h = require('./jhartleyHelpers.js'); //helper functions
const nano = require('nano')(cfg.system.couchDbAddress);
const dbName = cfg.system.dbName;
h.setVerbose(cfg.system.verbose);

let a = {};

a.db;

function checkDatabase() {
	return nano.db.get(cfg.system.dbName)
	.then((resp) =>{
		h.cl(`CouchDb connected got database: ${cfg.system.dbName}`);
		h.cl(`    ${JSON.stringify(resp)}`);
		a.db = nano.use(cfg.system.dbName);
	}).catch((err) => {
		h.cl(`    ${JSON.stringify(err)}`);
		if (err.reason === 'Database does not exist.') {
			return nano.db.create(cfg.system.dbName)
			.then((resp) => {
				h.cl(`    CouchDb connected got database: ${cfg.system.dbName}`);
				h.cl(`    ${JSON.stringify(resp)}`);
				a.db = nano.use(cfg.system.dbName);
			})
			.catch((err) => {
				h.cl(JSON.stringify(err));
			});
		}
	});
};

a.dateDiff = function getDateByNumberOfDaysAdded(yearString, monthString, dayString, daysToAdd) {
	let tomorrow = new Date(`${yearString},${monthString},${dayString}`);
	tomorrow.setDate(tomorrow.getDate() + daysToAdd);
	return tomorrow;
};

a.dateObj = function returnDateObject(timeStamp = 0) {
	let obj = {};
	let date_ob;
	if (timeStamp === 0) {
		obj.ts = Date.now();
 		date_ob = new Date(obj.ts);	
	} else {
		obj.ts = timeStamp;
		date_ob = new Date(timeStamp);
	}
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



a.getDailyAverage = function getDailyAverage(idStart, yearString, monthString, dayString) {
	return new Promise((resolve, reject) => {
		let lastTimestamp = 0;
		let lastValue = 0;
		let totalValue = 0;
		let totalTime = 0;
		let active = {};
		let params = {};
		let last = '\uffff';
		let today = new Date(`${yearString},${monthString},${dayString}`);
		today = a.dateObj(today.getTime());
		let yesterday = a.dateObj(a.dateDiff(yearString, monthString, dayString, -1).getTime());
		let tomorrow = a.dateObj(a.dateDiff(yearString, monthString, dayString, 1).getTime());
		h.cl(`Get Daily Average ${idStart}`);
		h.cl(`yesterday: ${yesterday.monthString}-${yesterday.dayString}`);
		h.cl(`today: ${today.monthString}-${today.dayString}`);
		h.cl(`tomorrow: ${tomorrow.monthString}-${tomorrow.dayString}`);
		params.startkey = `${idStart},${yesterday.yearString},${yesterday.monthString},${yesterday.dayString},${last}`;
		params.include_docs = true;
		params.limit = 1;
		params.descending = true;
		h.cl(`${JSON.stringify(params)}`);
		a.db.list(params)
		.then((resp) => {
			h.cl(` `);
			h.cl(` query 1 result ++++++++++++++++++++++++ ${resp.rows.length}`);
			if (resp.rows.length != 1) {
				throw new Error(`getDailyAverage query 1 wrong length id: ${idStart}`);
			}
			let queryDate = a.dateObj(resp.rows[0].doc.timeStamp)
			if (queryDate.dayString != yesterday.dayString || queryDate.monthString != yesterday.monthString || queryDate.yearString != yesterday.yearString) {
				throw new Error (`getDailyAverage query 1 wrong date id: ${idStart}`);
			}
			h.cl(JSON.stringify(resp.rows));
			lastValue = resp.rows[0].doc.value;
			lastTimestamp = today.ts;
			params = {};
			params.startkey = `${idStart},${today.yearString},${today.monthString},${today.dayString}`;
			params.endkey = `${params.startkey},${last}`;
			params.include_docs = true;
			h.cl(`${JSON.stringify(params)}`);
		})
		.then(() => a.db.list(params))
		.then((resp) => {
			h.cl(` `);
			h.cl(` query 2 result ++++++++++++++++++++++++ ${resp.rows.length}`);
			if (resp.rows.length === 0) {
				throw new Error(`getDailyAverage query 2 no results id: ${idStart}`);
			}
			h.cl(JSON.stringify(resp.rows));
			let i = 0;
			let queryDate;
			for (i = 0; i < resp.rows.length; i += 1) {
				queryDate = a.dateObj(resp.rows[i].doc.timeStamp)
				if (queryDate.dayString != today.dayString || queryDate.monthString != today.monthString || queryDate.yearString != today.yearString) {
					throw new Error (`getDailyAverage query 2 wrong date id: ${idStart}`);
				}
				h.cl(`${resp.rows[i].id}`)
				h.cl(`${resp.rows[i].doc.timeStamp} : ${resp.rows[i].doc.value}`);
				let timeDiff = resp.rows[i].doc.timeStamp - lastTimestamp;
				let periodValue = lastValue * timeDiff;
				totalValue += periodValue;
				totalTime += timeDiff;
				lastValue = resp.rows[i].doc.value;
				lastTimestamp = resp.rows[i].doc.timeStamp;
				h.cl(`maths: timeDiff: ${timeDiff}, periodValue: ${periodValue}, totalValue: ${totalValue}, totalTime: ${totalTime}`);
			}
			let timeDiff = tomorrow.ts - lastTimestamp;
			let periodValue = lastValue * timeDiff;
			totalValue += periodValue;
			totalTime += timeDiff;
			h.cl(`maths: timeDiff: ${timeDiff}, periodValue: ${periodValue}, totalValue: ${totalValue}, totalTime: ${totalTime}`);
			h.cl(` `);
			h.cl(`Average value: ${totalValue/totalTime}`);
			resolve(totalValue/totalTime);
		})
		.catch((err) => {
			reject(err);
		});
	});
};




let lastOrpDay;
let lastphDay;

h.cla('startup');
checkDatabase()
.then(() => a.getDailyAverage('value,orpStable', '2020', '08', '06'))
.then((resp) => {
	lastOrpDay = resp.toFixed(2); 
})
.catch((err) => {
	lastOrpDay = 0;
	h.cla(err);
})
.then(() => a.getDailyAverage('value,phStable', '2020', '08', '09'))
.then((resp) => {
	lastphDay = resp.toFixed(2);
})
.catch((err) => {
	lastphDay = 0;
	h.cla(err);
})
.then(() => h.cl(`lastOrpDay: ${lastOrpDay}, lastphDay ${lastphDay}`));


