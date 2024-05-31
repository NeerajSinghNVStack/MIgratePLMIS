const {createLogger , transports , format} = require('winston');

const todayDate = new Date().toISOString().slice(0, 10);

exports.logger = createLogger({
    transports : [
        new transports.File({
            filename : 'logs/info/info-log-' + todayDate + '.log',
            level : 'info',
            format : format.combine(format.timestamp() , format.json())
        }),
        new transports.File({
            filename : 'logs/error/error-log-' + todayDate + '.log',
            level : 'error',
            format : format.combine(format.timestamp() , format.json())
        }),
        new transports.File({
            filename : 'logs/warn/warn-log-' + todayDate + '.log',
            level : 'warn',
            format : format.combine(format.timestamp() , format.json())
        })
    ]
})