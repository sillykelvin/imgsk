// client.js

var net = require('net');
var protobuf = require('protobufjs');
var proto = require('../lib/proto');

var host = 'localhost';
var port = 8080;

function parseArgs() {
    var args = process.argv.slice(2);
    if (args[0] === '-h' || args[0] === '--help') {
        console.log('Usage: node client.js [host] [port]');
        process.exit(0);
    }

    if (args[0])
        host = args[0];

    if (args[1])
        port = args[1];
}

function processMessage(header, body) {
    switch (header.msgId) {
    case proto.messages.MessageId.LoginRsp:
        console.log('login response:', body);
        break;
    // TODO: add other cases here
    default:
        console.log('unknown msgid:', header.msgId);
    }
}

function handleData(conn, data) {
    if (conn.msgBuffer)
        conn.msgBuffer = Buffer.concat([conn.msgBuffer, data]);
    else
        conn.msgBuffer = data;

    while (true) {
        // header has not been extracted
        if (!conn.msgHeader) {
            var headerLength = conn.msgBuffer[0];

            // received data length is less than the header length, continue
            if (conn.msgBuffer.length < headerLength + 1) {
                console.log('INCOMPLETE HEADER');
                return;
            }

            var rawHeader = conn.msgBuffer.slice(1, 1 + headerLength);
            conn.msgHeader = proto.readMessageHeader(rawHeader);
            if (!conn.msgHeader)
                // TODO: error handling
                return;

            // if there is no content left in buffer
            if (conn.msgBuffer.length - headerLength - 1 <= 0) {
                if (conn.msgHeader.bodyLength > 0) {
                    conn.msgBuffer = undefined;
                    return;
                }
            }

            conn.msgBuffer = conn.msgBuffer.slice(1 + headerLength);
        }

        // body has not been extracted
        if (!conn.msgBody) {
            var bodyLength = conn.msgHeader.bodyLength;
            if (conn.msgBuffer.length < bodyLength) {
                console.log('INCOMPLETE BODY');
                return;
            }

            var rawBody = conn.msgBuffer.slice(0, bodyLength);
            conn.msgBody = proto.readMessageBody(conn.msgHeader.msgId, rawBody);
            if (!conn.msgBody)
                // TODO: error handling
                return;

            // if there is no content left in buffer
            if (conn.msgBuffer.length - bodyLength <= 0)
                conn.msgBuffer = undefined;
            else
                conn.msgBuffer = conn.msgBuffer.slice(bodyLength);
        }

        processMessage(conn.msgHeader, conn.msgBody);

        conn.msgHeader = undefined;
        conn.msgBody = undefined;

        if (!conn.msgBuffer)
            break;
    }
}

function start() {
    parseArgs();
    proto.init();

    var client = new net.Socket();
    var conn = {};

    client.connect(port, host, function() {
        console.log('CONNECTED: ' + host + ':' + port);

        var login = new proto.messages.LoginReq();
        login.setEmail('i@a.com');
        login.setPassword('123');
        var buf = proto.encodeMessage(proto.messages.MessageId.LoginReq, login);

        client.write(buf);
    });

    client.on('error', function(err) {
        if (err.syscall !== 'connect')
            throw err;

        switch (err.code) {
        case 'ECONNREFUSED':
            console.log('Failed to connect ' + host + ':' + port + ', server started?');
            process.exit(1);

        default:
            throw err;
        }
    });

    client.on('data', function(data) {
        console.log('DATA: ', data);
        handleData(conn, data);
    });

    client.on('close', function() {
        console.log('Connection closed.');
    });
}

start();
