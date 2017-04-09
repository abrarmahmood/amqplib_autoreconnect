var amqp = require('amqplib');
var EventEmitter = require('events');
var url = 'amqp://guest:guest@localhost';

var Channel = require('./channel');
var emitter = new EventEmitter();

// BE CAREFUL!
emitter.setMaxListeners(0)

var config = {
    attempt: 0,
    delay: 5,
    max: 5
}

class Connect {
    constructor() {
        this.events = emitter;
        this.connecting = false;
        this.connected = false;
        this.connection = false;
        this.connectionString = null;

        this.channels = [];

        this.init = false;
    }

    _init() {
        this.init = true;
        this.events.on('connection-created', conn => {
            this.connected = true;
            this.connection = conn;
            this.connecting = false;
        });

        this.events.on('failed-reconnect', () => {
            this.connected = false;
            this.connection = false;
            this.connecting = false;
        });

        this.events.on('connecting', () => {
            this.connecting = true;
        });

    }

    createConnection(str) {
        if (!this.init) this._init();

        url = str;
        this.connectionString = str;
        return new Promise((resolve, reject) => {
            if (!str) {
                reject('No connection string supplied.');
                return;
            } else if (str.indexOf('@') === -1) {
                reject('ConnecitonString must match the format: amqp://username:password@localhost');
                return;
            } else if (this.connected || this.connecting) {
                reject('Already connected.');
                return;
            } else {
                this.events.emit('connecting');
            }


            const success = conn => {
                this.events.removeListener('connection-created', success);
                resolve(conn);
            }
            const fail = err => {
                this.events.removeListener('failed-reconnect', fail);
                reject(err);
            }

            this.events.on('connection-created', success);
            this.events.on('failed-reconnect', fail);

            this.events.emit('create-connection');
        })
    }

    createChannel() {
        return new Promise((resolve, reject) => {
            if (!this.connecting) {
                reject('No connection available.');
            } else if (this.connected) {
                create(this.connection);
            }            

            this.events.on('connection-created', connection => {
                create(connection);
            });

            let channel = new Channel({config, connectionEvents: this.events});
            const create = connection => {
                return channel.createChannel(connection)
                .then(ch => {
                    resolve(channel);
                })
                .catch(reject);
            }
        });
    }
}


emitter.on('create-connection', str => {
    amqp.connect(str)
    .then(connection => {
        const handleError = err => {
            emitter.emit('reconnect', err);
            connection.removeListener('error')
        }
        const handleClose = err => {
            emitter.emit('reconnect', err);
            connection.removeListener('close')
        }

        connection.on('close', handleClose);
        connection.on('error', handleError);

        config.attempt = 0;

        emitter.emit('connection-created', connection);
    })
    .catch(err => {
        emitter.emit('reconnect', err);
        // emitter.emit('error', err);
    })
})

emitter.on('reconnect', err => {
    if (config.attempt >= config.max) {
        emitter.emit('failed-reconnect', err);
    } else {
        if (config.attempt === 0) console.error('ERROR: Lost connection');

        config.attempt++;
        console.log(`Reconnecting in ${config.delay} seconds (${config.max - config.attempt} attempts left.)`);
        setTimeout(() => {
            emitter.emit('create-connection', url);
        }, config.delay * 1000);
    }
})

module.exports = new Connect();
