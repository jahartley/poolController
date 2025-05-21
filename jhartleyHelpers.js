//helper functions
//sleep(ms)
var verbose = false;
exports.sleep = duration => new Promise(resolve => setTimeout(resolve, duration));
exports.cl = function (msg) {if (verbose) console.log(msg);}
exports.cla = function (msg) {console.log(msg);}
exports.setVerbose = function (tf) {verbose = tf;}
