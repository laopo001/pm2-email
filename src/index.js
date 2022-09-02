const pm2 = require('pm2')
const nodemailer = require('nodemailer');
const yaml = require('yaml');
const fs = require('fs');
// pm2.list((err, list) => {
//     console.log(err, list)
//     list.forEach(p => {
//         pm2.describe(p.name, function (err, desc) {
//             console.log(err, desc)
//         })
//     })
// })
let configstr = fs.readFileSync('./config.yaml').toString();
let config = yaml.parse(configstr);
console.log(config);

let namespace = config.namespace || 'namespace'
var transporter = nodemailer.createTransport({
    service: config.service,
    // secure: true,
    auth: {
        user: config.user,
        pass: config.pass
    }, 
    debug: true,
    logger: true
});



async function sendEmail(to, subject, text) {
    return new Promise((resolve, reject) => {
        var mailOptions = {
            from: config.user,
            to: to,
            subject: subject,
            text: text
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                // console.log(error);
                reject(error)
            } else {
                // console.log('Email sent: ' + info.response);
                resolve(info)
            }
        });
    })

}

async function sendMails(name, subject, text) {
    config.pickSubscribeEmal = config.pickSubscribeEmal || [];
    let map = {}
    let process = config.pickSubscribeEmal.find(x => x.name == name);
    if (process != null) {
        for (let email of process.emails) {
            await sendEmail(email, subject, text).catch(err => {
                console.log('sendEmail-err: ', email, subject, text, err);
            })
            map[email] = true;
        }
    }
    for (let email of config.emails) {
        if (map[email]) {
            continue;
        }
        await sendEmail(email, subject, text).catch(err => {
            console.log('sendEmail-err: ', email, subject, text, err);
        })
        map[email] = true;
    }
}

pm2.launchBus(function (err, pm2_bus) {
    pm2_bus.on('process:msg', function (msg) {
        console.log('process:msg', msg)
    })
    pm2_bus.on('process:event', function (event) {
        // console.log('process:event', event)
        let name = event.process.name
        let count = event.process.restart_time;
        let cwd = event.process.pm_exec_path;
        let username = event.process.username
        if (event.event == 'exit') {
            sendMails(name, `${namespace}-${name}-stop`, `
                名称: ${name}
                重启次数: ${count}
                路径: ${cwd}
                用户名: ${username}
            `)
        }
        if (event.event == 'online') {
            sendMails(name, `${namespace}-${name}-start`, `
                名称: ${name}
                重启次数: ${count}
                路径: ${cwd}
                用户名: ${username}
            `)
        }
        if (event.event == 'restart overlimit') {
            sendMails(name, `${namespace}-${name}-重启失败-重启次数超过上限`, `
                名称: ${name}
                重启次数: ${count}
                路径: ${cwd}
                用户名: ${username}
            `)
        }
    })
    pm2_bus.on('process:exception', function (exception) {
        console.log('process:exception', exception)
        let name = exception.process.name;
        let data = exception.data;
    })
    // pm2_bus.on('log:err', function (e) {
    //     console.log('log:err', e)
    // });
})