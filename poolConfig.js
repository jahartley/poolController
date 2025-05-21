//configuration file for pool.

exports.system = {
	verbose: true,
	production: false,
	mqttAddress: 'mqtt://192.168.77.1',
	couchDbAddress: 'http://admin:bob@192.168.77.60:5984',
	dbName: 'test2'
}

exports.switchesDefaults = {
	system: true,
	solar: true,
	freezeProtect: true,
	swim: false,
	schedule: true,
	skimmerPriority: false,
	scg: true,
	valve: true,
	pump: true,
	light: true
}



/* Output Device Example:

	solarValve: {
		name: 'solarValve', //valve name to make requests to...
		onPin: 5, //pin for relay for black valve wire
		lrPin: 2, //(left-right pin) pin for relay for red/white wires
		t0: 5000, // time to move from 100 to 0
		t100: 5000, // time to move from 0 to 100
		t0max: 28000, // time to ensure that it makes it to 0
		t100max: 28000 // time to ensure that it makes it to 100
	}

*/
//var outputDefault = {light: 0, pump: 0, solarValve: 0, intakeValve: 0, outputValve: 0, scg: 0}

exports.outputConfig = {
	solarValve: {
		name: 'solarValve',
		type: 'valve',
		default: 0,
		valveNumber: 0,
		t0: 35300,
		t100: 35300,
		t0max: 40000, 
		t100max: 40000
	},
	intakeValve: {
		name: 'intakeValve',
		type: 'valve',
		default: 0,
		valveNumber: 1,
		t0: 24700,
		t100: 24700,
		t0max: 28000,
		t100max: 28000,
		protect: {
			listener: 'machines.pump',
			test: 'machines.pump.isHigh',
			positionTest: '>',
			positionTestValue: 70,
			positionOverrideValue: 70
		}
	},
	outputValve: {
		name: 'outputValve',
		type: 'valve',
		default: 0,
		valveNumber: 2,
		t0: 24700,
		t100: 24700,
		t0max: 28000,
		t100max: 28000
	},
	pump: {
		name: 'pump',
		type: 'pump',
		default: 0,
		onPin: 8,
		lowPin: 9,
		delay: 1000
	},
	light: {
		name: 'light',
		type: 'light',
		default: 0,
		onPin: 11,
		delay: 1000
	},
	scg: {
		name: 'scg',
		type: 'scg',
		default: 0,
		onPin: 10,
		delay: 30000
	}
};


exports.scripts = {
	chemCheck: {
		0: {solarValve: {value:0,pri: 9},
			intakeValve: {value: 100, pri: 9},
			outputValve: {value: 0, pri: 9}
		},
		1: {check: 30000},
		2: {pump: {value: 1, pri: 9}}
	},
	solarHeat: {
		0: {pump: {value: 2, pri: 3}},
		1: {delay: 30000},
		2: {solarValve: {value:100,pri:3}}
	},
	freezeProtect: {
		0: {intakeValve: {value: 70, pri: 4},
			outputValve: {value: 0, pri: 4}
		},
		1: {check: 30000},
		2: {pump: {value: 2, pri: 4}},
		3: {delay: 30000},
		4: {solarValve: {value: 100, pri: 4}}
	},
	swim: {
		0: {light: {value: 1, pri: 2},
			intakeValve: {value: 0, pri: 2}
		},
		1: {check: 30000},
		2: {pump: {value: 2, pri: 2}},
		3: {outputValve: {value: 60, pri: 2}}
	},
	clean: {
		0: {intakeValve: {value: 70, pri: 8},
			outputValve: {value: 0, pri: 8}
		},
		1: {check: 30000},
		2: {pump: {value: 2, pri: 8}},
	}
};


exports.values = {
	solarGoalTemp: 'tempF',
	freezeProtectActiveTemp: 'tempF',
	orpStable: 'mv',
	phStable: 'pH',
	poolTempStable: 'tempC'
};

/* 
This is a quick reference to cron syntax and also 
shows the options supported by node-cron.

Allowed fields
 # ┌────────────── second (optional)
 # │ ┌──────────── minute
 # │ │ ┌────────── hour
 # │ │ │ ┌──────── day of month
 # │ │ │ │ ┌────── month
 # │ │ │ │ │ ┌──── day of week
 # │ │ │ │ │ │
 # │ │ │ │ │ │
 # * * * * * *
Allowed values
field	value
second	0-59
minute	0-59
hour	0-23
day of month	1-31
month	1-12 (or names)
day of week	0-7 (or names, 0 or 7 are sunday)
Using multiples values
You may use multiples values separated by comma:
 
'1,2,4,5 * * * *', () => {
  console.log('running every minute 1, 2, 4 and 5');

Using ranges
You may also define a range of values:

'1-5 * * * *', () => {
  console.log('running every minute to 1 from 5');

Using step values  remove - between * and /
Step values can be used in conjunction with ranges, 
following a range with '/' and a number. 
e.g: 1-10/2 that is the same as 2,4,6,8,10. 
Steps are also permitted after an asterisk, 
so if you want to say “every two minutes”, just use *-/2.

'*-/2 * * * *', () => {
  console.log('running a task every two minutes');

Using names
For month and week day you also may use names or short names. e.g:

'* * * January,September Sunday', () => {
  console.log('running on Sundays of January and September');

Or with short names:

'* * * Jan,Sep Sun', () => {
  console.log('running on Sundays of January and September');

EXAMPLE runs one command
startNewDay: {
	cron: '5 0 0 * * *',
	func: 'startDay'
},

EXAMPLE runs start and end commands
chemCheck: {
	cronStart: '0 0 8 * * *',
	funcStart: 'scriptReader',
	argStart: ['chemCheck', true, 'cron'],
	cronEnd: '0 30 8 * * *',
	funcEnd: 'scriptReader',
	argEnd: ['chemCheck', false, 'cron']
},




*/

exports.tasks = {
	startNewDay: {
		cron: '55 59 23 * * *',
		func: 'endDay',
		arg: []
	},
	chemCheck1: {
		cronStart: '0 0 8 * * *',
		funcStart: 'chemCheck',
		arg: []
	},
	chemCheck2: {
		cronStart: '0 0 20 * * *',
		funcStart: 'chemCheck',
		arg: []
	},
	clean: {
		cronStart: '0 0 12 * * *',
		funcStart: 'scriptReader',
		argStart: ['clean', true, 'cron'],
		cronEnd: '0 0 16 * * *',
		funcEnd: 'scriptReader',
		argEnd: ['clean', false, 'cron']
	}
};
