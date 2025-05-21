const i2c = require('i2c-bus');
let i2c1;
const i2cAdd = 0x17;
let deviceCount = 0;
let adcCount = 4;

let tempValues = [];
let adcValues = [];
let coreVcc = 0;
let coreTemp = 0;
let valveIsMoving = 0;
let lastStatus = 0;

function read(len = 3) {
	//console.log('read');
	const readBuf = Buffer.alloc(len);
	i2c1 = i2c.openSync(1);
	i2c1.i2cReadSync(i2cAdd, readBuf.length, readBuf);
	i2c1.closeSync();
	/*
	for (var i = 0; i < readBuf.length; i++) {
		console.log('position: ' + i + ' is: ' + readBuf[i]);
	}
	console.log("read complete");
	*/
	lastStatus = readBuf[0];
	valveIsMoving = readBuf[2];
	return readBuf;
}

exports.read = function readWrapper(len) {
	return read(len);
}

function write(command) {
	//console.log(`write command: ${command}`);
	let b;
	let a;
	if (Buffer.isBuffer(command)) {
		a = command;
	} else {
		if (!Array.isArray(command)) {
			//console.log('not a array');
			b = [command];
		}
		a = Buffer.from(b);
	}
	//console.log(`Buffer Length: ${a.length}`);
	//console.log(`buffer is ${a}`);
	i2c1 = i2c.openSync(1);
	i2c1.i2cWriteSync(i2cAdd, a.length, a);
	i2c1.closeSync();

	//console.log('write complete');
}


exports.readTemp = async function read1WireTemp(x) {
	if (x > 7 || x < 0) throw new Error(` read Temp ${x} is out of range`);
	let tempNo = 240 + x;
	let result;
	let count = 0;
	write(tempNo);
	while (true) {
		count += 1;
		await new Promise(resolve => setTimeout(resolve, 750));
		result = read(7);
		if (result[0] == 248) break;
		if (count > 4) throw new Error('Unable to get 1 Wire Temp');
	}
	//console.log(`read took ${count} to get data`);
	let val = 0;
	let base = result.readInt16BE(4);
	if (base > 0) {
		val = base + (result.readInt8(6)/100)
	} else {
		val = base - (result.readInt8(6)/100)
	}
	tempValues[result.readInt8(3)] = val;
	//console.log(tempValues);
	return val;
}

exports.readAdc = async function readOnBoardAdc(x) {
	if (x > 3 || x < 0) throw new Error(` read Adc ${x} is out of range`);
	let tempNo = 230 + x;
	let result;
	let count = 0;
	write(tempNo);
	while (true) {
		count += 1;
		result = read(6);
		if (result[0] == 238) break;
		if (count > 15) throw new Error('Unable to read ADC value');
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	//console.log(`read took ${count} to get data`);
	let base = result.readInt16BE(4);
	adcValues[result.readInt8(3)] = base;
	//console.log(adcValues);
	return base;
}

exports.getTempCount = async function getNumberOfTemperatureSensorsCount() {
	let result;
	let count = 0;
	write(249);
	while (true) {
		count += 1;
		result = read(4);
		if (result[0] == 249) break;
		if (count > 15) throw new Error('Unable to get 1 Wire temp sensor count');
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	//console.log(`read took ${count} to get data`);
	if (result[3] > 8) {
		deviceCount = 8;
	} else {
		deviceCount = result[3];
	}
	//console.log(`Number of Sensors is: ${deviceCount}`);
	return deviceCount;
}

exports.getVcc = async function getCoreVcc() {
	let result;
	let count = 0;
	write(210);
	while (true) {
		count += 1;
		result = read(5);
		if (result[0] == 210) break;
		if (count > 15) throw new Error('Unable to get core VCC');
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	//console.log(`read took ${count} to get data`);
	let base = result.readInt16BE(3);
	base = 1110.576 / base;
	coreVcc = base;
	//console.log(`core Vcc is: ${base}`);
	return base;
}

exports.getCoreTemp = async function getCoreTemp() {
	let result;
	let count = 0;
	write(211);
	while (true) {
		count += 1;
		result = read(5);
		if (result[0] == 211) break;
		if (count > 15) throw new Error('Unable to get core Temp');
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	//console.log(`read took ${count} to get data`);
	let base = result.readInt16BE(3);
	base = base - 245;
	coreTemp = base;
	//console.log(`core temperature is: ${base}`);
	return base;
}

exports.moveValve = async function moveValve(valve, direction, duration) {
	if (valve < 0 || valve > 3) throw new Error('moveValve valve Number out of range');
	if (direction < 0 || direction > 1) throw new Error('moveValve direction out of range');
	if (duration < 0 || duration > 60000) throw new Error('moveValve duration out of range');
	const writeBuf = Buffer.alloc(4);
	writeBuf[0] = valve + 220;
	writeBuf[1] = direction;
	writeBuf.writeUInt16BE(duration, 2);
	write(writeBuf);
	result = read(4);
	if (result[0] === writeBuf[0]) {
		return;
	} else {
		if (result[0] === 228) throw new Error(`Valve ${valve} is already moving...`);
		throw new Error(`Valve command not received response ${result}`);
	}
} 

exports.stopValve = async function stopValve(valve) {
	if (valve < 0 || valve > 3) throw new Error('stopValve valve Number out of range');
	write((valve + 224));
	return;
}
/*
async function main() {
	await tempCount();
	for (let i = 0; i < deviceCount; i += 1) {
		await readTemp(i);
	}
	for (let i = 0; i < adcCount; i += 1) {
		await readAdc(i);
	}
	await getVcc();
	await getCoreTemp();
	write([220,0,19,136]);
	read();
	write([220,0,19,136]);
	read();
	write([221,1,19,136]);
	read();
	write([222,0,19,136]);
	read();
	write([223,1,19,136]);
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();
	await new Promise(resolve => setTimeout(resolve, 1000));
	read();


}

main().catch(console.log);

*/