var net = require('net');
var fs = require('fs');
var aprs = require('aprs-parser');
var config = require('../config.js'); //Putting config up out of the checked in directory to keep passwords out of git
var mysql = require('mysql');

var pool  = mysql.createPool({
  connectionLimit : 10,
  host            : config.sqlHost,
  user            : config.sqlUser,
  password        : config.sqlPass,
  database        : 'aprslogger'
});

var firstRun = true;
var parser = new aprs.APRSParser();


var client = new net.Socket();
client.connect({
	port: config.aprsPort,
	host: config.aprsHost
});

client.on('connect', function(){
	console.log("APRS-IS Server connected " + config.aprsHost);
});

client.setEncoding('ASCII');

client.on('data', function(data){
	
	if (data.charAt(0) == "#")
	{
		//Server status message
		//TODO: Handle Port Full message? Get this on connect sometimes and it'd be nice to retry and not just sit here pretending we're going to get data.
		console.log(data.trim());
	}
	else
	{
		//Real APRS message. Parse it!
		var parsedMessage = parser.parse(data.trim());
		//console.log(parsedMessage);
		if (!parsedMessage.data.telemetrySequence)
		{
			//No TM in this packet, so we'll put 0 in there for now
			parsedMessage.data.telemetrySequence = 0;
			parsedMessage.data.telemetryValues = [0,0];
		}

		var query = "INSERT INTO locations (callsign, latitude, longitude, altitude, course, speed, raw, tmSequence, tm1, tm2) VALUES ('"
			+ parsedMessage.from.call + "-" + parsedMessage.from.ssid + "', " + parsedMessage.data.latitude + ", " + parsedMessage.data.longitude + ", " + parsedMessage.data.altitude + ", "
			+ parsedMessage.data.extension.courseDeg + ", " + parsedMessage.data.extension.speedMPerS + ", '" + Buffer.from(parsedMessage.raw).toString('base64') + "', " + parsedMessage.data.telemetrySequence + ", " + parsedMessage.data.telemetryValues[0] + ", " + parsedMessage.data.telemetryValues[1] + ")";
			//Base64 Encoding the raw packet because weird characters. Reverse with Buffer.from(message, 'base64').toString('ascii')


		pool.getConnection(function(err, connection) {
  			if (err) throw err; // not connected!

  			// Use the connection
  			connection.query(query, function (error, results, fields) {
    			// When done with the connection, release it.
    			connection.release();
    			console.log("Message logged from "+ parsedMessage.from.call + "-" + parsedMessage.from.ssid);

    			// Handle error after the release.
    			if (error)
    			{
    				console.log("SQL Error " + err.code + ": " + query);
    			}

  			});
		});

	}
	//The first response from the server will be the server version. We need to send the login string to enable filter
	if (firstRun)
	{
		firstRun = false;
		client.write("user " + config.callsign + " pass " + config.aprsPass + " vers APRSLogger " + config.softVers + " " + config.filterString + "\r\n") //For use with the filtered feed
	}
});

