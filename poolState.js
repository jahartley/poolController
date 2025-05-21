// POOL STATE MACHINE

/* toDO list
temp system
	checks temps, multi source, ignores when pool off...
	solar, freeze protect.

valve actuator system
	0-100 percent.  save run times for deciding percent.

salt chlorine generator system  PID over days?

swim command

*/

// machines...
// pump: off, low, high via rOff rLow rHigh
// valve actuator: 0-100 percent stopped moving unknown

const h = require('./jhartleyHelpers');
const pool = require('./poolPrototypes');
const cfg = require('./poolConfig');

// logging via helpers
h.setVerbose(cfg.verbose);



h.cla('////////////////////////////////////////////////startup//////');


//*
//home/pool/command/?name
pool.client.on('message', function(topic, message) {
  h.cl('                            <<<<<<<<<<<<<<<<<<<<<<<<');
  h.cl('mqtt message: ' + topic.toString() + " " + message.toString());
  for (x in pool.requests) {
  	// valves listen to setPosition
  	if(topic.toString() == 'home/pool/setPosition/' + x) {
  		h.cl('Manual Valve Request: ' + x + ' ' + message);
  		var messageNumber = message;
  		if (typeof(messageNumber) != "number") {messageNumber = parseInt(messageNumber);}

  		pool.requests[x].request('manual', messageNumber, 0);
  	}
  	// onOff and pumps use command
  	if(topic.toString() == 'home/pool/command/' + x) {
  		h.cl('Manual command Request: ' + x + ' ' + message);
  		var messageNumber = message;
  		if (typeof(messageNumber) != "number") {messageNumber = parseInt(messageNumber);}
  		if (messageNumber === 0) {
  			pool.requests[x].cancel('manual');
  		} else {
  			pool.requests[x].request('manual', messageNumber, 0);
  		}
  		
  	}
  }
  //switches use switch
  for (x in pool.switches) {
  	if(topic.toString() == 'home/pool/switch/' + pool.switches[x].name) {
  		if (message == 1) pool.switches[x].enable(true);
  		if (message == 0) pool.switches[x].enable(false);
  	}
  }
});

//*/


//machine event listener
pool.poolEvent.on('machineState', (name, state, position) =>{
	h.cl('======machineState ' +name+' '+state+' '+position);
	if (name == 'pump') pool.scgDecision();
});

//switch event listener
pool.poolEvent.on('switchState', (name, tf) =>{
	h.cl('======switchState ' +name+' '+tf);
});

pool.poolEvent.on('system', (tf) => {
	pool.switches.scg.enable(tf);
	pool.switches.valve.enable(tf);
	pool.switches.pump.enable(tf);
	pool.switches.light.enable(tf);

});

pool.poolEvent.on('swim', (tf) => {
	h.cl('--------SWIM ON: '+ tf);
	pool.scriptReader('swim', tf);
});

pool.poolEvent.on('solar', (tf) => {
	h.cl('--------SOLAR ON: '+ tf);
	pool.solarHeatDecision();
});




async function test() {
	//await h.sleep(20000);
	h.cl('=============================================running tests')
	pool.solarHeatDecision();
	setInterval( () => {pool.solarHeatDecision();}, 120000);




	/*

	h.cl('request test');
	pumpLow.request('test');
	h.cl('request solar');
	pumpHigh.request('solar');
	h.cl('cancel test');
	pumpLow.cancel('test');
	h.cl('request manual')
	pumpHigh.request('manual');
	h.cl('cancel solar');
	pumpHigh.cancel('solar');
	h.cl('cancel manual');
	pumpHigh.cancel('manual');
	*/	

	//h.cl(solarValve);
	//h.cl(solarValve.machine);
	//h.cl(solarValve.isUnknown());
	//h.cl(pool.valves.solarValve.position());
	//h.sleep(30000).then(() => {
	//pool.valves.solarValve.request(25);
	//pool.valves.intakeValve.request(25);
	//pool.valves.outputValve.request(25);
	//});
	//pool.valves.intakeValve.request(48);
	//h.cl(pool.valves.solarValve.position());
}

test();


