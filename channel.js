var EventEmitter = require('events');
var Promise = require('bluebird');

module.exports = class Channel extends EventEmitter {
    constructor(params) {
        super();
        this.connection = null;

        this._config = params.config;
        this.connectionEvents = params.connectionEvents;

        // state
        this._channel = null;

        this.init = false;
        this.reconnect = false;

        this.failedReconnect = false;

        // BE CAREFUL!
        this.setMaxListeners(0)
    }

    _init() {
        this.init = true;

        this.on('create-channel', () => {
            this.connection.createChannel()
            .then(ch => {
                this._channel = ch;

                ch.on('close', err => {
                    console.error('Channel closed, re-opening in 1 second. info: ');
                    console.log(err);
                    setTimeout(() => {
                        this.emit('reconnect');
                    }, 1000)
                });

                ch.on('error', err => {
                    console.error('Channel closed, re-opening in 1 second. info: ');
                    console.log(err);
                    setTimeout(() => {
                        this.emit('reconnect');
                    }, 1000)
                });

                if (this.reconnect) {
                    this.emit('reconnection');
                } else {
                    this.emit('success-channel');
                    this.reconnect = true;
                }
            })
            .catch(err => {
                this.emit('failed-channel', err);
            })            
        })

        this.connectionEvents.on('failed-reconnect', err => {
            this.failedReconnect = err;
        })
    }

    // Verified
    createChannel(connection) {
        this.connection = connection;

        if (!this.init) this._init();

        return new Promise((resolve, reject) => {
            const success = () => {
                this.removeListener('success-channel', success);
                resolve(this._channel);
            }
            const fail = err => {
                this.removeListener('failed-channel', fail);
                reject(err);
            }

            this.on('success-channel', success);
            this.on('failed-channel', fail);
            this.connectionEvents.on('failed-reconnect', fail);

            this.emit('create-channel');
        });

    }

    // Verified
    assertQueue(queue, options) {
        return new Promise((resolve, reject) => {
            if (!this._channel) {
                reject('No channel available.');
                return;
            }
            const task = () => {
                this._channel.assertQueue(queue, options)
                .then(q => {
                    return q;
                })
                .then(q => {
                    resolve(q);
                })
                .catch(err => {
                    reject(err);
                });
            }
            this.on('reconnection', task);
            task();
        })
    }

    bindQueue(queue, source, pattern, args) {
        return new Promise((resolve, reject) => {
            if (!this._channel) {
                reject('No channel available.');
                return;
            }
            const task = () => {
                this._channel.bindQueue(queue, source, pattern, args)
                .then(q => {
                    return q;
                })
                .then(q => {
                    resolve(q);
                })
                .catch(err => {
                    reject(err);
                });
            }
            this.on('reconnection', task);
            task();
        })
    }

    assertExchange(queue, options) {
        return new Promise((resolve, reject) => {
            if (!this._channel) {
                reject('No channel available.');
                return;
            }
            const task = () => {
                this._channel.assertExchange(queue, options)
                .then(q => {
                    return q;
                })
                .then(q => {
                    resolve(q);
                })
                .catch(err => {
                    reject(err);
                });
            }
            this.on('reconnection', task);
            task();
        })
    }

    // buffering required from now on.
    // Do not use EventEmitter 'reconnection' because we don't want to duplicate the actions of these methods

    // Verified
    consume(queue, fn, options) {
        return new Promise((resolve, reject) => {
            if (!this._channel) {
                reject('No channel available.');
                return;
            }
            const task = () => {
                this._channel.consume(queue, fn, options)
            }
            this.on ('reconnection', task);
            task();
        })
    }

    // Verified
    sendToQueue(queue, content, options = {}) {
        if (!this._channel) {
            reject('No channel available.');
            return;
        }

        return new Promise((resolve, reject) => {

            const task = () => {
                if (this.failedReconnect) {
                    reject(`Failed reconnecting after ${this._config.max} retries.`);
                    return;
                }

                try {
                    const result = this._channel.sendToQueue(queue, content, options)
                    resolve(result);
                } catch(err) {
                    if (err.message === 'Channel closed') {
                        // console.log(`WARNING: Channel closed, retrying 'sendToQueue' in ${this._config.delay/2} seconds.`);

                        setTimeout(() => {
                            options.reconnecting = true;
                            task();
                        }, (this._config.delay /2) * 1000);
                    } else {
                        reject(err)
                    }
                }
            };
            task();
        });
    }

    publish(exchange, routingKey, content, options = {}) {
        if (!this._channel) {
            reject('No channel available.');
            return;
        }

        return new Promise((resolve, reject) => {

            const task = () => {
                if (this.failedReconnect) {
                    reject(`Failed reconnecting after ${this._config.max} retries.`);
                    return;
                }

                try {
                    const result = this._channel.publish(exchange, routingKey, content, options)
                    resolve(result);
                } catch(err) {
                    if (err.message === 'Channel closed') {
                        // console.log(`WARNING: Channel closed, retrying 'sendToQueue' in ${this._config.delay/2} seconds.`);

                        setTimeout(() => {
                            options.reconnecting = true;
                            task();
                        }, (this._config.delay /2) * 1000);
                    } else {
                        reject(err)
                    }
                }
            };
            task();
        });
    }


    // Pass through the following methods:

    // Verified
    ack(msg) {
        return this._channel.ack(msg);
    }

    nack(msg) {
        return this._channel.nack(msg);
    }

    cancel(consumerTag) {
        return this._channel.cancel(consumerTag);
    }

    prefetch(count) {
        return this._channel.prefetch(count);
    }

}
