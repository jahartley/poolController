/*
Goals: be able to start at any time and act like its been running all along...

task format: 	startCron 	string,
				startFunc 	function,
				endCron 	string(optional),
				endFunc 	function(optional)





if(user.hasOwnProperty("endCron")){

user poolPi:poolPi

*/

var today = new Date(Date.now());

var todaysDate = today.getDate();
var todaysMonth = today.getMonth() + 1;
var todaysYear = today.getFullYear();

const mysql = require('mysql');
const connection = mysql.createConnection({
  host: '192.168.77.1',
  user: 'poolPi',
  password: 'poolPi',
  database: 'poolState'
});


connection.connect(function(err) {
  if (err) {
    return console.error('error: ' + err.message);
  }

  let createTableSchedule = `create table if not exists schedule(
                          id int primary key auto_increment,
                          name varchar(255)not null,
                          running tinyint not null default 0,
                          day tinyint not null,
                          month tinyint not null,
                          year tinyint not null
                      )`;

  connection.query(createTableSchedule, function(err, results, fields) {
    if (err) {
      console.log(err.message);
    }
  });

  connection.end(function(err) {
    if (err) {
      return console.log(err.message);
    }
  });
});



fetch("http://192.168.77.58/cgi-bin/MUH88TP_Keyvalue.cgi", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    "x-requested-with": "XMLHttpRequest",
    "cookie": "logintype-88=01"
  },
  "referrer": "http://192.168.77.58/88E_Setup.html",
  "referrerPolicy": "no-referrer-when-downgrade",
  "body": "{Save=0,Recall=0,CH1Output=0,CH2Output=0,CH3Output=0,CH4Output=0,CH5Output=0,CH6Output=2,CH7Output=0,CH8Output=0,ALL=0}",
  "method": "POST",
  "mode": "cors"
});