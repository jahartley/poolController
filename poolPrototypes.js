//pool prototypes


let a = {};
const cfg = require('./poolConfig'); //pool startup config
const events = require('events'); 
const h = require('./jhartleyHelpers.js'); //helper functions
const v = require('./valveBoard.js');
const mqtt = require('async-mqtt');
const client = mqtt.connect(cfg.system.mqttAddress);
//stent state machines
const Machine = require('stent').Machine;
const Connect = require('stent/lib/helpers').connect;
const Call = require('stent/lib/helpers').call
//couchdb
const nano = require('nano')(cfg.system.couchDbAddress);
const dbName = cfg.system.dbName;
//cron
const cron = require('cron').CronJob;

h.setVerbose(cfg.system.verbose);

a.poolEvent = new events.EventEmitter();

a.db;

//switches store
a.switches = {};
//pool machines store
a.machines = {};
// valveBuffer store
a.valveBuffer = {};
// script states
a.activeScripts = {};

a.systemValues = {};

a.jobs = {};

a.startup = false;

a.lastOrpDayAverage = 0;
a.lastPhDayAverage = 0;

// Database functions
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

a.saveItem = function saveItem(obj) {
	return new Promise((resolve, reject) => {
		let d = a.dateObj();
		let doc = {};
		let type = undefined;
		doc.timeStamp = d.ts;
		if ('switchEnabled' in obj) { //switch type
			doc.enabled = obj.switchEnabled;
			type = `switch,${obj.name}`;
		}
		if ('direction' in obj) { //scriptReader
			type = `script`;
			doc.name = obj.name;
			doc.reqBy = obj.reqBy;
			doc.direction = obj.direction;
		}
		if ('me' in obj && obj.me === 'value') { //value
			type = `value,${obj.name}`;
			doc.value = obj.value;
		}

		if ('me' in obj && obj.me === 'time') { //time item
// {me: 'time', name: this.name, speed: 'high' time: currentTime}
			type = `time,${obj.name}`;
			if ('speed' in obj) doc.speed = obj.speed;
			doc.time = obj.time;
		}

		if (type === undefined) throw new Error(`saveItem unknown obj type: ${JSON.stringify(obj)}`);
		let id = `${type},${d.yearString},${d.monthString},${d.dayString},${d.hoursString},${d.minutesString},${d.secondsString},${d.msString}`;
		h.cl(`saveItem ${id}
			${JSON.stringify(doc)}`);
		a.db.insert(doc, id)
		.then((resp) => {
			h.cl(`    saveItem response ${JSON.stringify(resp)}`);
			resolve();
		});
	});
};

a.getLastState = function getLastState(obj) {
	return new Promise((resolve, reject) => {
	h.cl(`getLastState with:`);
	h.cl(`    ${JSON.stringify(obj)}`);
	let params = {};
	let type = undefined;
	let last = '\uffff';
	params.descending = true;

	if (obj.switchEnabled !== undefined) {
		type = 'switch';
	}
	if (obj.me !== undefined && obj.me === 'value') { //value
		type = 'value';
	}

	if (type === undefined) throw new Error(`getLastState unknown obj type: ${JSON.stringify(obj)}`);
	let id = `${type},${obj.name},${last}`;
	params.startkey = id;
	params.limit = 1;
	params.include_docs = true;
	a.db.list(params)
	.then((resp) => {
		h.cl(` `);
		h.cl(`    getLastState result ++++++++++++++++++++++++ ${obj.name} ${resp.rows.length}`);
		//h.cl(resp.rows[0]);
		resolve(resp.rows[0].doc);
	}).catch((err) => {
		throw new Error(`error getting last state ${obj.name}`);
	});
	});
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
		h.cl(`Get Daily Average yesterday: ${yesterday.monthString}-${yesterday.dayString}`);
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
			//h.cl(JSON.stringify(resp.rows));
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

			let i = 0;
			for (i = 0; i < resp.rows.length; i += 1) {
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
			throw new Error(`error getting daily Average: ${err}`);
		});
	});
};


/* depreciated.
a.getTodaysScriptState = function getTodaysScriptState() {
	let active = {};
	let params = {};
	let last = '\uffff';

	let id = `script,${a.todaysDate.yearString},${a.todaysDate.monthString},${a.todaysDate.dayString}`;
	params.startkey = id;
	params.endkey = `${id},${last}`;
	params.include_docs = true;
	a.db.list(params)
	.then((resp) => {
		h.cl(` `);
		h.cl(` getTodaysScriptState result ++++++++++++++++++++++++ ${resp.rows.length}`);
		h.cl(JSON.stringify(resp));
		for (let i = 0; i < resp.rows.length; i += 1) {
			if (resp.rows[i].doc.reqBy === 'cron') {
				h.cl(`found cron job ${resp.rows[i].doc.name} direction ${resp.rows[i].doc.direction}`)
				active[resp.rows[i].doc.name] = resp.rows[i].doc.direction;
			}
		}
		h.cl(`Checked all rows, following were active at last shutdown:`);
		for (name in active) {
			if (active[name]) {
				h.cl(`Cron job ${active[name]}`);
				//start the active jobs...
				a.scriptReader(name, true, 'cron');
			}
		}
		h.cl(`done with active jobs.`);
	}).catch((err) => {
		throw new Error(`error getting todays script state`);
	});

};
*/

// MQTT handlers
client.on('connect', () => {
	h.cl(`MQTT successfully connected to ${cfg.system.mqttAddress}`)
	client.subscribe('home/pool/raw/ph');
	client.subscribe('home/pool/raw/orp');
	client.subscribe('home/pool/raw/poolTemp0');
});

client.on('message', function(topic, message) {
  h.cl(`<<<<<<<<<<<<<<mqtt message: ${topic} ${message}`);
  if (topic.toString() == 'home/boss/resend' && message.toString() == '1') {
	Object.entries(a.switches).map( ([name]) => {
    	a.switches[name].mqtt();
    });
    Object.entries(a.machines).map( ([name]) => {
    	a.machines[name].mqtt();
  	});
  	Object.entries(a.systemValues).map( ([name]) => {
    	a.systemValues[name].mqtt();
  	});
  	return;
  }
  if (topic.toString() == 'home/pool/raw/ph') {
  	a.phCalc(message);
  	return;
  }
  if (topic.toString() == 'home/pool/raw/orp') {
  	a.orpCalc(message);
  	return;
  }
  if (topic.toString() == 'home/pool/raw/poolTemp0') {
  	a.tempCalc(message);
  	return;
  }
  let messageNumber = message;
  if (typeof(messageNumber) != "number") {
      messageNumber = parseInt(messageNumber);
  }
  for (name in a.machines) {
  	// valves listen to setPosition
  	if(topic.toString() == 'home/pool/setPosition/' + name) {
  		h.cl(`    Manual Valve Request: ${name} ${message}`);
  		a.machines[name].request('manual', true, messageNumber, 0);
  		return;
  	}
  	// onOff and pumps use command
  	if(topic.toString() == 'home/pool/command/' + name) {
  		h.cl(`    Manual command Request: ${name} ${message}`);
  		if (messageNumber === 0) {
  			a.machines[name].request('manual', false);
  		} else {
  			a.machines[name].request('manual', true, messageNumber, 0);
  		}
  		return;
  	}
  }
  //switches use switch
  for (name in a.switches) {
  	if(topic.toString() == 'home/pool/switch/' + name) {
  		if (message == 1) a.switches[name].enable(true);
  		if (message == 0) a.switches[name].enable(false);
  		return;
  	}
  }
  //values
  for (name in a.systemValues) {
	if(topic.toString() == 'home/pool/setValue/' + name) {
  		a.systemValues[name].setValue(parseFloat(message), 'mqtt');
  		return;
 	}  	
  }
  h.cl(`Message was unknown ${topic} ${message}`);
});

//POOLEVENT handlers...
a.poolEvent.on('machines.pump', (name, state) => {
	a.scgDecision();
});

a.poolEvent.on('switches.system', (name, tf) => {
	a.switches.scg.enable(tf);
	a.switches.valve.enable(tf);
	a.switches.pump.enable(tf);
	a.switches.light.enable(tf);
});

a.poolEvent.on('switches.swim', (name, tf) => {
	h.cl(`--------SWIM ON: ${tf}`);
	a.scriptReader('swim', tf, 'manual');
});

a.poolEvent.on('switches.solar', (name, tf) => {
	h.cl(`--------SOLAR ON: ${tf}`);
	a.solarHeatDecision();
});

a.poolEvent.on('switches.schedule', (name, tf) => {
	h.cl(`--------SCHEDULE ON: ${tf}`);
	if (tf) {
		//if (a.jobs is empty object build it...
		a.startJobs();
	} else {
		// stop jobs
		a.stopJobs();
	}
});



//systemValues prototype handler
function SystemValues(name, type) {
	this.name = name;
	this.value = undefined;
	this.type = type;
	this.me = 'value';
	this.mqtt = function sytemValueSendMQTT() {
		if (this.value !== undefined) {
			if (this.type === 'tempF') {
				//convert value to F then send
				let f = (this.value * 1.8) + 32
				a.mqttSend('home/pool/value/' + this.name, f);
				return;
			} else {
				a.mqttSend('home/pool/value/' + this.name, this.value);
				return;
			}
		} else {
			throw new Error(`systemValues ${this.name} is undefined`);
		}
	};
	this.setValue = function systemValueSetValue(val, from) {
		let val2 = parseFloat(val);
		if (val2 === undefined) throw new Error(`systemValues.${this.name} setValue value is undefined`);
		if (isNaN(val2)) throw new Error(`systemValues.${this.name} setValue value is NaN`);
		if (this.type === 'tempF') {
			let c = (5/9) * (val2 - 32);
			this.value = c;
  			a.saveItem(this);
  			a.poolEvent.emit(`systemValue.${this.name}`, this.name, this.value);
  			if (from !== 'mqtt') this.mqtt();
		} else {
			this.value = val2;
			a.saveItem(this);
			a.poolEvent.emit(`systemValue.${this.name}`, this.name, this.value);
			if (from !== 'mqtt') this.mqtt();
		}
	};
	this.init = function systemValueInit() { //get last value and set.
		return new Promise((resolve, reject) => {
			h.cl(`init ${this.name}`);
			client.subscribe('home/pool/setValue/' + this.name);
			a.getLastState(this).then((resp) => {
				h.cl(`    init getLastState resp: ${JSON.stringify(resp)}`);
				this.value = resp.value;
				a.poolEvent.emit(`systemValue.${this.name}`, this.name, this.value);
				this.mqtt();
			}).then(() => resolve());
		});
	};
}

//system state switch prototype handler
function StateSwitch(name,tf) {
	this.name = name;
	this.switchEnabled = tf;
	this.enable = function StateSwitchEnable(tf1) {
		this.switchEnabled = tf1;
		a.poolEvent.emit(`switches.${this.name}`, this.name, this.switchEnabled);
		this.mqtt();
		a.saveItem(this);
		return;
	}
	this.mqtt = function StateSwitchMqtt() {
		let tf = 0;
		if (this.switchEnabled) tf = 1;
		a.mqttSend('home/pool/switchPosition/' + this.name, tf);
		return;
	}
	this.init = function StateSwitchInit() {
		return new Promise((resolve, reject) => {
			h.cl(`init ${this.name}`);
			client.subscribe('home/pool/switch/' + this.name);
			a.getLastState(this).then((resp) => {
				h.cl(`    init getLastState resp: ${JSON.stringify(resp)}`);
				this.enable(resp.enabled);
			}).then(() => resolve());
		});
	}
}

//multiple input request handeler each machine prototype
function OutputRequest2() {
	this.enabled = true;
	this.r = {};
	this.request = function OutputRequest2request(
		who, 
		tf,
		value = this.default, 
		pri = 9
	) {
		if (who === undefined) throw new Error('Must have who requested');
		if (tf === undefined) throw new Error('Must have true/false to request or cancel');
		if (typeof(this.r[who]) != 'object') this.r[who] = {};
		this.r[who].requested = tf;
		if (this.r[who].requested) {
			this.r[who].value = value;
			this.r[who].pri = pri;
		}
		this.check();
	};
	this.check = function OutputRequest2Check() {
		h.cl(`OutputRequest check for: ${this.name}`);
		let pri = 99;
		let value = this.default;
		let who = '';
		// get highest priority value
		for (name in this.r) {
			if (this.r[name].requested) {
				h.cl(`    OutputRequest check ${this.name} requested who: ${name} val: ${this.r[name].value} pri: ${this.r[name].pri}`);
				if (this.r[name].pri < pri) {
					pri = this.r[name].pri;
					value = this.r[name].value;
					who = name;
				}
			}
		}
		h.cl(`    OutputRequest check result: ${this.name} requested who: ${who} val: ${value} pri: ${pri}`);
		if ('protect' in this) {
			let c1 = a.efbn(this.protect.test);
			let c2 = a.positionTest(this.protect.positionTest, value, this.protect.positionTestValue);
			//h.cl(`protect exists, test is ${c1} and position test is ${c2}`)
			if (c1 && c2) {
				h.cl(`    Protect active ${this.name} is overridden to ${this.protect.positionOverrideValue}`);
				value = this.protect.positionOverrideValue;
			}
		}
		// make request if enabled or not.
		if (this.enabled) { //enabled send request
			this.machineRequest(value);
		} else { //disabled, stop...
			this.stop();
		}

	};
	this.init2 = function () {
		h.cl(`init Request Handeler ${this.name}`);
		this.r.default = {};
		this.r.default.requested = true;
		this.r.default.value = this.default;
		this.r.default.pri = 10;
		if ('protect' in this) {
			if ('listener' in this.protect) {
				a.poolEvent.on(this.protect.listener, () => {
					this.check();
				});
			}
		}
		a.poolEvent.on(`switches.${this.type}`, (name, tf) => {
			h.cl(`${this.name} enabled: ${tf} by ${this.type}`);
			this.request('manual', false);
			this.enabled = tf;
			this.check();
		});
		this.enabled = a.switches[this.type].switchEnabled;
		this.check();
	};
}

async function valveBuffer() {
	while(true) {
		let keys = Object.keys(a.valveBuffer);
		for (let i = 0; i < keys.length; i += 1) {
			if (a.valveBuffer[keys[i]]) {
				let x = [];
				for (name in a.machines) {
					if ('isMoving' in a.machines[name]) {
						x.push(a.machines[name].isMoving());
					}
				}
				if (!x.includes(true) && a.machines[keys[i]].enabled) {
					a.valveBuffer[keys[i]] = false;
					a.machines[keys[i]].move();
				}
			}
		}
		await h.sleep(250);
	}
}

//pool valve state machine prototype
function ValvePrototype() {
	this.state = {name:'unknown', position: -1},
	this.transitions = {
		'stopped': {
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.stopped.move ${me.nextPosition}`);
				if (me.nextPosition == me.state.position) {
					return {name: 'stopped', position: me.state.position}
				} else if (me.nextPosition == 0) {
					h.cl('    move valve to 0');
					me.on(1,0,me.t0max);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: 0};
					me.movingValvePosition(me.t0max);
					yield Call(h.sleep, me.t0max);
					me.end();
					return
				} else if (me.nextPosition == 100) {
					h.cl('    move valve to 100');
					me.on(1,1,me.t100max);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: 100};
					me.movingValvePosition(me.t100max);
					yield Call(h.sleep, me.t100max);
					me.end();
					return
				} else if (me.state.position == 100) {
					let moveTime = (((100 - me.nextPosition)/100) * me.t0);
					h.cl(`    move valve ms: ${moveTime}`);
					me.on(1,0,moveTime);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: me.nextPosition};
					me.movingValvePosition(moveTime);
					yield Call(h.sleep, moveTime);
					me.end();
					return					
				} else if (me.state.position == 0) {
					let moveTime = ((me.nextPosition / 100) * me.t100);
					h.cl(`    move valve ms: ${moveTime}`);
					me.on(1,1,moveTime);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: me.nextPosition};
					me.movingValvePosition(moveTime);
					yield Call(h.sleep, moveTime);
					me.end();
					return
				} else if (me.nextPosition < 50) {
					h.cl('    move valve to 0 then nextpos');
					me.on(1,0,me.t0max);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: 0};
					me.movingValvePosition(me.t0max);
					yield Call(h.sleep, me.t0max);
					me.end();
					return
				} else {
					h.cl('    move valve to 100 then nextpos');
					me.on(1,1,me.t100max);
					me.oldpos = me.state.position;
					yield {name: 'moving', position: 100};
					me.movingValvePosition(me.t100max);
					yield Call(h.sleep, me.t100max);
					me.end();
					return
				}
			},
			'stop': function (me) {//internal to valve
				h.cl('    already stopped');
				me.on(0);
				me.mqtt();
				return;
			}
		},
		'moving': {
			'move': function (me) {
				h.cl('    currently moving');
				//return {name: 'unknown', position: pos};
			},
			'stop': function (me) {//internal to valve
				me.on(0);
				return {name: 'unknown', position: -1};
			},
			'end': function * (me) {
				h.cl('    reached end');
				//me.on(0);
				//check if this was last move ie next position != position
				if (me.nextPosition == me.state.position) {
					return {name: 'stopped', position: me.state.position};
				} else {
					yield {name: 'stopped', position: me.state.position};
					me.move();
					return
				}
			}
		},
		'unknown': { //move to known
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name} moving from unknown`);
				if (me.nextPosition < 50) {
					h.cl('    move valve to 0 then pos');
					me.on(1,0, me.t0max);
					me.oldpos = 100;
					yield {name: 'moving', position: 0};
					me.movingValvePosition(me.t0max);
					yield Call(h.sleep, me.t0max);
					me.end();
					return
				} else {
					h.cl('    move valve to 100 then pos');
					me.on(1,1, me.t100max);
					me.oldpos = 0
					yield {name: 'moving', position: 100};
					me.movingValvePosition(me.t100max);
					yield Call(h.sleep, me.t100max);
					me.end();
					return
				}
			},
			'stop': function (me) {//internal to valve
				me.on(0);
				return {name: 'unknown', position: -1};
			}
		}
	}
}




//pool valve extra properties prototype
function Valve() {
	this.moveNbr = 0;
	this.position = function () {return	this.state.position};
	this.nextPosition = -1;
	this.oldPos = -1;
	this.machineRequest = function (pos) {
		h.cl(`* ${this.name} request ${pos}`);
		if(pos > 100) pos = 100;
		if(pos < 0) pos = 0;
		//set next position
		this.nextPosition = pos;
		//request a move...
		a.valveBuffer[this.name] = true;
	}
	this.on = function (onVal, direction = 0, timeValue = 0) {
		h.cl(`    ${this.name} valveNumber ${this.valveNumber} direction: ${direction} for: ${timeValue}`);
		if (onVal === 1) {
			v.moveValve(this.valveNumber, direction, timeValue);
		} else {
			v.stopValve(this.valveNumber);
		}
	}
	this.init = function () {
		h.cl(`init machine ${this.name}`);
		client.subscribe('home/pool/command/' + this.name);
		client.subscribe('home/pool/setPosition/' + this.name);
	}
	this.movingValvePosition = async function (moveTime) {
		let startTime = Date.now();
		this.moveNbr += 1;
		let move = this.moveNbr;
		let endPos = this.position();
		let startPos = this.oldpos;
		while (this.isMoving() && this.moveNbr == move) {
			let percent = ((Date.now() - startTime)/moveTime);
			let pos = -1;
			if (startPos > endPos) { //decreasing
				pos = startPos - ((startPos - endPos) * percent)
			} else {
				pos = startPos + ((endPos - startPos) * percent)
			}
			pos = pos.toFixed(0);
			h.cl(`    ${pos} ${this.name} : ${move}`);
			a.mqttSend('home/pool/position/' + this.name, Math.round(pos));
			await h.sleep(2000);
		}
	}
	this.mqtt = function () {
		a.mqttSend('home/pool/position/' + this.name, this.position());
	}
}

//pump state machine prototype states off, low, high
function PumpPrototype() {
	this.state = {name:'off', position: 0, last: Date.now()},
	this.transitions = {
		'off': {
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.off.move to ${me.nextPosition}`);
				if (me.nextPosition == 0) {
					h.cl(`    move ${me.name} to 0`);
					me.on(0,0);
					me.time();
					return {name: 'off', position: 0, last: Date.now()}
				} else if (me.nextPosition == 1) {
					h.cl(`    move ${me.name} to low`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1, 1);
						me.time();
						return {name: 'low', position: 1, last: Date.now()}
					}
				} else if (me.nextPosition == 2) {
					h.cl(`    move ${me.name} to high`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1, 0);
						me.time();
						return {name: 'high', position: 2, last: Date.now()}
					}
				}
			},
			'stop': function (me) {//stop usualy because disabled
				h.cl(`${me.name} is stopping`);
				me.on(0,0);
				me.time();
				return {name: 'off', position: 0, last: Date.now()}
			}
		},
		'low': {
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.low.move to ${me.nextPosition}`);
				if (me.nextPosition == 0) {
					h.cl(`    move ${me.name} to 0`);
					me.on(0, 0);
					me.time();
					return {name: 'off', position: 0, last: Date.now()}
				} else if (me.nextPosition == 1) {
					h.cl(`    move ${me.name} is already low`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1, 1);
						me.time();
						return {name: 'low', position: 1, last: Date.now()}
					}
				} else if (me.nextPosition == 2) {
					h.cl(`    move ${me.name} to high`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1,0);
						me.time();
						return {name: 'high', position: 2, last: Date.now()}
					}
				}
			},
			'stop': function (me) {//stop usualy because disabled
				h.cl(`${me.name} is stopping`);
				me.on(0, 0);
				me.time();
				return {name: 'off', position: 0, last: Date.now()}
			}
		},
		'high': { //move to known
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.high.move ${me.nextPosition}`);
				if (me.nextPosition == 0) {
					h.cl(`    move ${me.name} to 0`);
					me.on(0,0);
					me.time();
					return {name: 'off', position: 0, last: Date.now()}
				} else if (me.nextPosition == 1) {
					h.cl(`    move ${me.name} to low`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1, 1);
						me.time();
						return {name: 'low', position: 1, last: Date.now()}
					}
				} else if (me.nextPosition == 2) {
					h.cl(`    move ${me.name} is already high`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1, 0);
						me.time();
						return {name: 'high', position: 2, last: Date.now()}
					}
				}
			},
			'stop': function (me) {//stop usualy because disabled
				h.cl(`${me.name} is stopping`);
				me.on(0, 0);
				me.time();
				return {name: 'off', position: 0, last: Date.now()}
			}
		}
	}
}




//Pump extra properties prototype
function Pump() {
	this.position = function () {return	this.state.position};
	this.nextPosition = 0;
	this.lowTime = 0;
	this.highTime = 0;
	this.machineRequest = function (pos) {
		h.cl(`* ${this.name} request ${pos}`);
		if(pos > 2) pos = 2;
		if(pos < 0) pos = 0;
		this.nextPosition = pos;
		this.move();
	}
	this.on = function (onVal, lowVal) {
		h.cl(`    ${this.name} onPin ${this.onPin} to value: ${onVal}`);
		h.cl(`    ${this.name} lowPin ${this.lowPin} to value: ${lowVal}`);
		let newVal = 1;
		let newLowVal = 1;
		if (onVal == 1) newVal = 0;
		if (lowVal == 1) newLowVal = 0;
		//mcp23017.writePin(this.onPin, newVal);
		//mcp23017.writePin(this.lowPin, newLowVal);
	}
	this.delayCalc = function () {
		let a = (this.delay - (Date.now() - this.state.last));
		if (a <= 0) a = 0;
  		return a;
	}
	this.init = function () {
		h.cl(`init machine ${this.name}`);
		client.subscribe('home/pool/command/' + this.name);
	}
	this.mqtt = function () {
		a.mqttSend('home/pool/position/' + this.name, this.position());
	}
	this.time = function () {
		return new Promise((resolve, reject) => {
			h.cl(`${this.name}.time()`);
			let currentTime = 0;
			if (this.isLow()) {
				currentTime = Date.now() - this.state.last;
				h.cl(`    runTime for ${this.name} is ${currentTime/1000/60} minutes`);
				resolve(a.saveItem({me: 'time', name: this.name, speed: 'low', time: currentTime}));
			}
			if (this.isHigh()) {
				currentTime = Date.now() - this.state.last;
				h.cl(`    runTime for ${this.name} is ${currentTime/1000/60} minutes`);
				resolve(a.saveItem({me: 'time', name: this.name, speed: 'high', time: currentTime}));
			}
			 else {
				resolve(h.cl(`    ${this.name} is off`));
			}
		});
	}
	this.onTime = function () {
		let currentTime = 0;
		if (this.isLow()) {
			currentTime += Date.now() - this.state.last;
		}
		if (this.isHigh()) {
			currentTime += Date.now() - this.state.last;
		}
		return this.lowTime + this.highTime + currentTime;
	}
	this.resetTime = function () {
		this.move();
		//clear time now...
	}
}

//OnOff state machine prototype states off, on
function OnOffPrototype() {
	this.state = {name:'off', position: 0, last: Date.now()},
	this.transitions = {
		'off': {
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.off.move ${me.nextPosition}`);
				if (me.nextPosition == 0) {
					h.cl(`    move ${me.name} is already off`);
					me.on(0);
					me.time();
					return {name: 'off', position: 0, last: Date.now()}
				} else if (me.nextPosition == 1) {
					h.cl(`    move ${me.name} to on`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1);
						me.time();
						return {name: 'on', position: 1, last: Date.now()}
					}
				}
			},
			'stop': function (me) {//stop usualy because disabled
				h.cl(`${me.name} is stopping`);
				me.on(0);
				me.time();
				return {name: 'off', position: 0, last: Date.now()}
			}
		},
		'on': {
			'move': function * (me) {
				if (!me.enabled) return;
				h.cl(`${me.name}.on.move ${me.nextPosition}`);
				if (me.nextPosition == 0) {
					h.cl(`    move ${me.name} to off`);
					me.on(0);
					me.time();
					return {name: 'off', position: 0, last: Date.now()}
				} else if (me.nextPosition == 1) {
					h.cl(`    move ${me.name} is already on`);
					let a = me.delayCalc();
					if (a) { //state changed less than delay
						yield Call(h.sleep, a);
						me.move();
						return
					} else { //change now...
						me.on(1);
						me.time();
						return {name: 'on', position: 1, last: Date.now()}
					}
				}
			},
			'stop': function (me) {//stop usualy because disabled
				h.cl(`${me.name} is stopping`);
				me.on(0);
				me.time();
				return {name: 'off', position: 0, last: Date.now()}
			}
		}
	}
}




//Pump extra properties prototype
function OnOff() {
	this.position = function () {return	this.state.position};
	this.nextPosition = 0;
	this.runTime = 0;
	this.machineRequest = function (pos) {
		h.cl(`* ${this.name} request ${pos}`);
		if(pos > 1) pos = 1;
		if(pos < 0) pos = 0;
		this.nextPosition = pos;
		this.move();
	}
	this.on = function (val) {
		h.cl(`    ${this.name} onPin ${this.onPin} to value: ${val}`);
		let newVal = 1;
		if (val == 1) newVal = 0;
		//mcp23017.writePin(this.onPin, newVal);
	}
	this.delayCalc = function () {
		let a = (this.delay - (Date.now() - this.state.last));
		if (a <= 0) a = 0;
  		return a;
	}
	this.init = function () {
		h.cl(`init machine ${this.name}`);
		client.subscribe('home/pool/command/' + this.name);
	}
	this.mqtt = function () {
		a.mqttSend('home/pool/position/' + this.name, this.position());
	}
	this.time = function () {
		return new Promise((resolve, reject) => {
			h.cl(`${this.name}.time()`);
			let currentTime = 0;
			if (this.isOn()) {
				currentTime = Date.now() - this.state.last;
				h.cl(`    runTime for ${this.name} is ${currentTime/1000/60} minutes`);
				resolve(a.saveItem({me: 'time', name: this.name, time: currentTime}));
			} else {
				resolve(h.cl(`    ${this.name} is off`));
			}
		});
		 
	}
	this.onTime = function () {
		let currentTime = 0;
		if (this.isOn()) {
			currentTime += Date.now() - this.state.last;
		}
		return this.runTime + currentTime;
	}
	this.resetTime = function () {
		this.move();
		//clear time now...
	}
}

function machineEvents() {
	for (x in a.machines) {
		Connect()
  			.with(x)
  			.map((data) => {
    			//h.cl('====== ' + data.name + ' is ' + data.state.name + ' @ ' + data.position());
    			a.poolEvent.emit(`machines.${data.name}`, data.name, data.state.name, data.position());
    			a.mqttSend('home/pool/position/' + data.name, data.position());
    			//if (data.state.name == 'stopped') mqttSend('home/pool/position/' + data.name, data.position());    			
		  	});
	};
}

a.orpLastTime = 0;
a.orpLastValue = 0;
a.orpLastTime2 = 0;
a.orpLastValue2 = 0;
a.orpDerivative = 0;
a.orpStable = false;

a.orpCalc = function orpCalc(raw) {
	//using two values back in order to prevent back to back same readings making derivative 0...
	raw2 = parseFloat(raw);
	let timeNow = Date.now();
	if (a.orpLastTime2 == 0) a.orpLastTime2 = timeNow; //if value still 0 just use now...
	let timeDiff = timeNow - a.orpLastTime2;
	if (timeDiff != 0) a.orpDerivative = Math.abs((raw2 - a.orpLastValue2) / (timeDiff/60000));
	let stableDiff = Math.abs(raw2 - a.systemValues.orpStable.value);
	if (!a.machines.pump.isOff() && a.orpDerivative < 0.5) { //stable
		if (stableDiff > 3) a.systemValues.orpStable.setValue(raw2, 'orpCalc');
		a.orpStable = true;
	} else {
		a.orpStable = false;
	}
	h.cl(`orpCalc raw: ${raw2} lastValue: ${a.orpLastValue} timeDif: ${timeDiff}`); 
	h.cl(`    derivative<0.5: ${a.orpDerivative} stableDiff>3: ${stableDiff} stable: ${a.systemValues.orpStable.value}`);

	a.orpLastValue2 = a.orpLastValue;
	a.orpLastTime2 = a.orpLastTime;
	a.orpLastValue = raw2;
	a.orpLastTime = timeNow;
};

a.phLastTime = 0;
a.phLastValue = 0;
a.phLastTime2 = 0;
a.phLastValue2 = 0;
a.phDerivative = 0;
a.phStable = false;
a.phCalc = function phCalc(raw) {
	//using two values back in order to prevent back to back same readings making derivative 0...
	raw2 = parseFloat(raw);
	let timeNow = Date.now();
	if (a.phLastTime2 == 0) a.phLastTime2 = timeNow; //if value still 0 just use now...
	let timeDiff = timeNow - a.phLastTime2;
	if (timeDiff != 0) a.phDerivative = Math.abs((raw2 - a.phLastValue2) / (timeDiff/60000));
	let stableDiff = Math.abs(raw2 - a.systemValues.phStable.value);
	if (!a.machines.pump.isOff() && a.phDerivative < 0.005) { //stable
		if (stableDiff > 0.01) a.systemValues.phStable.setValue(raw2, 'phCalc');
		a.phStable = true;
	} else {
		a.phStable = false;
	}
	h.cl(`phCalc raw: ${raw2} lastValue: ${a.phLastValue} timeDif: ${timeDiff}`);
	h.cl(`    derivative<0.005: ${a.phDerivative} stableDiff>0.01: ${stableDiff} stable: ${a.systemValues.phStable.value}`);

	a.phLastValue2 = a.phLastValue;
	a.phLastTime2 = a.phLastTime;
	a.phLastValue = raw2;
	a.phLastTime = timeNow;
};

a.tempLastTime = 0;
a.tempLastValue = 0;
a.tempLastTime2 = 0;
a.tempLastValue2 = 0;
a.tempDerivative = 0;
a.tempStable = false;
a.tempCalc = function tempCalc(raw) {
	//using two values back in order to prevent back to back same readings making derivative 0...
	raw2 = parseFloat(raw);
	let timeNow = Date.now();
	if (a.tempLastTime2 == 0) a.tempLastTime2 = timeNow; //if value still 0 just use now...
	let timeDiff = timeNow - a.tempLastTime2;
	if (timeDiff != 0) a.tempDerivative = Math.abs((raw2 - a.tempLastValue2) / (timeDiff/60000));
	let stableDiff = Math.abs(raw2 - a.systemValues.poolTempStable.value);
	if (!a.machines.pump.isOff() && a.tempDerivative < 0.3) { //stable
		if (stableDiff > 0.2) a.systemValues.poolTempStable.setValue(raw2, 'tempCalc');
		a.tempStable = true;
	} else {
		a.tempStable = false;
	}
	h.cl(`tempCalc raw: ${raw2} lastValue: ${a.tempLastValue} timeDif: ${timeDiff}`);
	h.cl(`    derivative<0.3: ${a.tempDerivative} stableDiff>0.2: ${stableDiff} stable: ${a.systemValues.poolTempStable.value}`);

	a.tempLastValue2 = a.tempLastValue;
	a.tempLastTime2 = a.tempLastTime;
	a.tempLastValue = raw2;
	a.tempLastTime = timeNow;
};

a.chemCheck = function pumpTillChemsStable(maxHours = 2) {
	let startTime = Date.now();
	let maxTime = maxHours * 3600000;
	// use scriptreader to request chemCheck settings...
	a.scriptReader('chemCheck', true, 'chemCheck');
	while (!a.orpStable || !a.phStable || !a.tempStable) {
		if (Date.now() - startTime > maxTime) break; //if not stable by maxHours cancel
		h.sleep(300000);
	}
	// use scriptreader to cancel chemCheck settings...
	a.scriptReader('chemCheck', false, 'chemCheck');
}

a.mqttSend = function mqttSend(address, value) {
	return new Promise((resolve, reject) => {
		let addressString = address;
		let valueString = value;
		if (typeof(addressString) != "string") {addressString = addressString.toString();}
		if (typeof(valueString) != "string") {valueString = valueString.toString();}
		h.cl(`>>>>>>>>mqttSend: ${addressString} ${valueString}`);
		resolve(client.publish(addressString, valueString));
	});
};

a.efbn = function executeFunctionByName(functionName, args) {

	//let args = Array.prototype.slice.call(arguments, 1);
  	h.cl(`EFBN ${functionName} args: ${args}`)
  	let namespaces = functionName.split(".");
  	let context = a;
  	for(var i = 0; i < namespaces.length; i++) {
	    context = context[namespaces[i]];
  	}
  	return context.apply(context, args);
};

a.positionTest = function positionTestDecision(testOperator, value, testValue) {
	if (testOperator === '>') {
		if (value > testValue) {return true;} else {return false;}
	} else if (testOperator === '<') {
		if (value < testValue) {return true;} else {return false;}
	} else {
		throw new Error(`positionTest testOperator ${testOperator} is unknown`);
	}
};

/*script system (name of script)
// @param script = name of script to execute
// @param dir = true or 1 goes forwards, 0 or false goes reverse.
// @param by = 'auto', 'manual', 'cron' depending on who sent
*/
a.scriptReader = async function scriptReader(script, dir, by) {
	h.cl(`ScriptReader script: ${script} direction: ${dir} by: ${by}`);
	if (script === undefined) throw new Error('must list script');
	if (dir === undefined) throw new Error('must define direction (true/false)');
	let length = Object.keys(cfg.scripts[script]).length;
	if (!(script in a.activeScripts)) {
		h.cl(`    first time running script ${script}`);
		a.activeScripts[script] = {};
		a.activeScripts[script].active = false;
		a.activeScripts[script].dir = dir;
	}
	if (a.activeScripts[script].dir == dir && a.activeScripts[script].active == true) {
		// current script is already running, return
		h.cl('    this script is currently running');
		return;
	}
	if (a.activeScripts[script].dir != dir && a.activeScripts[script].active == true) {
		// this scrip is running in the other direction, check back in 10s
		h.cl(`    This script ${script} is running the other direction`)
		setTimeout(a.scriptReader.bind(null, script, dir, by), 10000);
		return;
	}
	// this script is not running, start it...
	a.activeScripts[script].active = true;
	h.cl(`    scriptReader: ${script} length: ${length} dir: ${dir}`);
	if (dir) {
		for (let x = 0; x < length; x += 1) {
			h.cl(`    scriptOn: ${script} line: ${x}`);
			for (y in cfg.scripts[script][x]) {
				h.cl(`    scriptOn: ${script} line: ${x} requesting: ${y}`);
				if (y == 'check') {
					let skip = [];
					let count = 0;
					let stop = true;
					while(stop && count < 4) {
						h.cl(`    scriptReader check count: ${count}`);
						for (z in cfg.scripts[script][(x-1)]) {
							if (z != 'delay' && z != 'check') {
								h.cl(`    checking ${z} position.`)
								if (a.machines[z].type == 'valve') { //make sure all valves are stopped
									Object.entries(a.machines).map( ([name]) => {
										if (a.machines[name].type == 'valve' && a.machines[name].isMoving()) {
											skip.push(false); //position unknown
											h.cl(`    skip false due to ${name} is moving`);
										}
									});
								} else if (a.machines[z].position() == cfg.scripts[script][(x-1)][z].value) {
									skip.push(true);
								} else {
									skip.push(false);
									h.cl(`    skip false due to ${z} not in position`);
								}
							}
						}
						if (skip.includes(false)) {
							h.cl(`    delay for: ${cfg.scripts[script][x][y]}`);
							count += 1;
							await h.sleep(cfg.scripts[script][x][y]);
						} else {
							h.cl('All check requirements met, next step.');
							stop = false;
							count = 99;
						}
						skip = [];
					}
				} else if (y == 'delay') {
					h.cl(`    delay for: ${cfg.scripts[script][x][y]}`);
					await h.sleep(cfg.scripts[script][x][y]);
				} else {
					a.machines[y].request(script, true, cfg.scripts[script][x][y].value, cfg.scripts[script][x][y].pri);
				}
			}
		}
		h.cl(`scriptOn: ${script} complete...`);
		a.activeScripts[script].active = false;
		a.saveItem({name: script, direction: dir, reqBy: by});
	} else {
		h.cl(`scriptOff: ${script} length: ${length}`);
		for (let x = length-1; x > -1; x -= 1) {
			h.cl(`    scriptOff: ${script} line: ${x}`);
			for (y in cfg.scripts[script][x]) {
				h.cl(`    scriptOff: ${script} line: ${x} cancel: ${y}`);
				if (y == 'check') {
				} else if (y == 'delay') {
					h.cl(`    delay for: ${cfg.scripts[script][x][y]}`);
					await h.sleep(cfg.scripts[script][x][y]);
				} else {
					a.machines[y].request(script, false);
				}
			}
		}
		h.cl(`scriptOff: ${script} complete...`);
		a.activeScripts[script].active = false;
		a.saveItem({name: script, direction: dir, reqBy: by});
	}
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

a.tomorrow = function () {
	let today = new Date(Date.now());
	let tomorrow = new Date(`${today.getFullYear()},${today.getMonth()+1},${today.getDate()}`);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return tomorrow;
};

a.dateDiff = function getDateByNumberOfDaysAdded(yearString, monthString, dayString, daysToAdd) {
	let tomorrow = new Date(`${yearString},${monthString},${dayString}`);
	tomorrow.setDate(tomorrow.getDate() + daysToAdd);
	return tomorrow;
};


a.solarHeatDecision = function solarHeatDecision() {
	h.cl(`Solar Heat Decision`);
	if (a.startup) {
		//check if enabled...
		if (a.switches.solar.switchEnabled) {
			a.scriptReader('solarHeat', true, 'auto');
		} else {
			a.scriptReader('solarHeat', false, 'auto');
		}
	}
};

a.scgDecision = function scgDecision() {
	h.cl(`SCG Decision`);
	if (a.startup) {
		if (a.machines.pump.isOff()) {
			a.machines.scg.request('autoScg', false, 1, 8);
		} else {
			a.machines.scg.request('autoScg', true, 1, 8);
		}
	}
};

function endGracefully() {
	h.cla(`ENDING GRACEFULLY`);
	let promises = [];
		if (a.startup) {
			//send mqtt off messages...
			Object.entries(a.machines).map( ([name]) => {
				promises.push(a.machines[name].stop());
				if ('time' in a.machines[name]) {
					promises.push(a.machines[name].time());
				}
				promises.push(a.mqttSend('home/pool/position/' + name, 0));
			});
			Object.entries(a.switches).map( ([name]) => {
				promises.push(a.mqttSend('home/pool/switchPosition/' + name, 0));
			});
		}
		//turn off outputs

		//save state
	return Promise.all(promises);
}

process.on('SIGTERM', () => {
	endGracefully()
	//.then((resp) => h.sleep(5000))
	.then((resp) => h.cla('ending from SIGTERM'))
	.then(() => process.exit(0));
});

process.on('SIGINT', () => {
	endGracefully()
	//.then((resp) => h.sleep(5000))
	.then((resp) => h.cla('ending from SIGINT'))
	.then(() => process.exit(0));
});

process.on('uncaughtException', function(err) {
    // handle the error safely
    h.cla(err);
    if (!cfg.system.production) {
    	endGracefully()
    	.then(() => h.cla(`ending from uncaughtException`))
    	.then(() => process.exit(0));
    }
});

function buildSwitches() {
	return new Promise((resolve, reject) => {
		Object.entries(cfg.switchesDefaults).map( ([name, tf]) => {
			h.cl(`Build switch ${name}`);
			a.switches[name] = {};
			Object.assign(a.switches[name], new StateSwitch(name,tf));
		});
		h.cl(a.switches);
		resolve();
	});
}

function initSwitches() {
	return new Promise((resolve, reject) => {
		Object.entries(a.switches).map( ([name]) => {
			h.cl(`Init switch ${name}`);
			a.switches[name].init();
		});
		resolve();
	});
}

function buildMachines() {
	return new Promise((resolve, reject) => {
		Object.entries(cfg.outputConfig).map( ([name, obj]) => {
			h.cl(`Build machine ${name}`);
			a.machines[name] = {};
			if (obj.type == 'valve') {
				a.machines[name] = Machine.create(name, new ValvePrototype());
				Object.assign(a.machines[name], new Valve());
				a.valveBuffer[name] = false;		
			} else if (obj.type == 'pump') {
				a.machines[name] = Machine.create(name, new PumpPrototype());
				Object.assign(a.machines[name], new Pump());
			} else {
				a.machines[name] = Machine.create(name, new OnOffPrototype());
				Object.assign(a.machines[name], new OnOff());
			}
			Object.assign(a.machines[name], cfg.outputConfig[name]);
			h.cl(`Build request handler ${name}`);
			Object.assign(a.machines[name], new OutputRequest2());
		});
		h.cl(a.machines);
		resolve();
	});
}

function initMachines() {
	return new Promise((resolve, reject) => {
		Object.entries(a.machines).map( ([name]) => {
			h.cl(`Init machine ${name}`);
			a.machines[name].init();
			a.machines[name].init2();
		});
		machineEvents();
		client.subscribe('home/boss/resend');
		resolve();
	});
}

function startupLastValues() {
	return new Promise((resolve, reject) => {
		Object.entries(cfg.values).map( ([name, type]) => {
			h.cl(`Build systemValues ${name}`);
			a.systemValues[name] = {};
			Object.assign(a.systemValues[name], new SystemValues(name, type));
			h.cl(`Init systemValues ${name}`);
			a.systemValues[name].init();
		});
		resolve();
	});
}

a.startJobs = function setupTasksAndStartJobs() {
	//make sure not to duplicate jobs
	delete a.jobs;
	a.jobs = {};
	//make all tasks into jobs
	return new Promise((resolve, reject) => {
		h.cl(`Building Tasks =======================================`);
		let b = a.tomorrow();
		for (name in cfg.tasks) {
			h.cl(`    Building Task ${name}`);
			if ('cronStart' in cfg.tasks[name]) {
				h.cl(`    ${cfg.tasks[name].cronStart}, ${cfg.tasks[name].funcStart}, ${cfg.tasks[name].argStart}`);
				h.cl(`    ${cfg.tasks[name].cronEnd}, ${cfg.tasks[name].funcEnd}, ${cfg.tasks[name].argEnd}`);
				a.jobs[name] = {};
				a.jobs[name].Start = new cron(cfg.tasks[name].cronStart, a.efbn.bind(null, cfg.tasks[name].funcStart, cfg.tasks[name].argStart), null, true);
				h.cl(`    ${name} start created`);
				a.jobs[name].End = new cron(cfg.tasks[name].cronEnd, a.efbn.bind(null, cfg.tasks[name].funcEnd, cfg.tasks[name].argEnd), null, true);
				h.cl(`    ${name} end created`);
				let c = a.jobs[name].End.nextDates(1);
				c = new Date(c);
				let d = a.jobs[name].Start.nextDates(1);
				d = new Date(d);
				h.cl(`    Start ${d} End ${c} tomorrow ${b}`)
				let y = (c - b);
				let z = (d - b);
				if (z > 0) h.cl(`    ${name}.Start already happened today...`);
				if (y > 0) h.cl(`    ${name}.End already happened today...`);
				if (y > 0 && z > 0) h.cl(`    task already ended, do nothing`);
				if (z > 0 && y < 0) {
					h.cl(`task started but didnt end yet, run start`);
					a.efbn(cfg.tasks[name].funcStart, cfg.tasks[name].argStart);
				}
				if (z < 0) h.cl(`    task happens later today... do nothing`);
			} else {
				h.cl(`    ${cfg.tasks[name].cron}, ${cfg.tasks[name].func}, ${cfg.tasks[name].arg}`);
				a.jobs[name] = new cron(cfg.tasks[name].cron, a.efbn.bind(null, cfg.tasks[name].func, cfg.tasks[name].arg), null, true);
				h.cl(`${name} created`);
				let c = a.jobs[name].nextDates(1);
				c = new Date(c);
				//let b = new Date(Date.now());
				let z = (c-b)
				if (z > 0) h.cl(`    ${name} already happened today...`);
			}
		}
		resolve();
	});
}

a.stopJobs = function stopAllJobs() {
	let b = a.tomorrow();
	h.cl(`STOPPING ALL JOBS...`);
	for (name in a.jobs) {
		if ('Start' in a.jobs[name]) {
			a.jobs[name].Start.stop();
			a.jobs[name].End.stop();
			let c = a.jobs[name].End.nextDates(1);
			c = new Date(c);
			let d = a.jobs[name].Start.nextDates(1);
			d = new Date(d);
			h.cl(`    Start ${d} End ${c} tomorrow ${b}`)
			let y = (c - b);
			let z = (d - b);
			if (z > 0 && y < 0) {
				h.cl(`    task is running but didnt end yet, run stop`);
				a.efbn(cfg.tasks[name].funcEnd, cfg.tasks[name].argEnd);
			}
		} else {
			a.jobs[name].stop();
		}
	}
	delete a.jobs;
	a.jobs = {};
}

a.endDay = function restAllTimesAtMidnight() {
	h.cl(`================================ END DAY ==============`);
	let promises = [];
	Object.entries(a.machines).map( ([name]) => {
		if ('resetTime' in a.machines[name]) {
			promises.push(a.machines[name].resetTime());
		}
	});
	return Promise.all(promises);
}


h.cla(`RUNNING STARTUP`);
checkDatabase()
.then(buildSwitches)
.then(buildMachines)
.then(initSwitches)
.then(initMachines)
.then(startupLastValues)
.then(() => {
	a.startup = true;
	valveBuffer();
	h.cla(`STARTUP COMPLETE`);
})
.catch((err) => {
throw new Error(err);
});



