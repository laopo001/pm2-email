const pm2 = require('pm2')
const nodemailer = require('nodemailer');
const yaml = require('yaml');
const fs = require('fs');
const worker = require('./task');
const options = require('./commander')
// pm2.list((err, list) => {
//     console.log(err, list)
//     list.forEach(p => {
//         pm2.describe(p.name, function (err, desc) {
//             console.log(err, desc)
//         })
//     })
// })
async function sleep(t = 1000) {
    return new Promise(resolve => {
        setTimeout(resolve, t);
    })
}


let configstr = fs.readFileSync(options.config).toString();
let config = yaml.parse(configstr);
console.log(config);

let namespace = config.namespace || 'namespace'
var transporter = nodemailer.createTransport({
    service: config.auth.service,
    // secure: true,
    auth: {
        user: config.auth.user,
        pass: config.auth.pass
    },
    // debug: true,
    // logger: true
});
transporter.verify(err => {
    if (err == null) {
        console.log('登录成功')
    } else {
        console.log('登录失败')
    }
})


async function sendEmail(to, subject, text) {
    return new Promise((resolve, reject) => {
        var mailOptions = {
            from: config.auth.user,
            to: to,
            subject: subject,
            text: text
        };
        // console.log(mailOptions);
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
    console.log(subject)
    config.pickSubscribeEmal = config.pickSubscribeEmal || [];
    let map = {}
    let process = config.pickSubscribeEmal.find(x => x.name == name);
    if (process != null) {
        for (let email of process.emails) {
            await sendEmail(email, subject, text).catch(err => {
                console.log('sendEmail-err: ', email, subject, text, err);
            })
            await sleep()
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
        await sleep()
        map[email] = true;
    }
}

pm2.launchBus(function (err, pm2_bus) {
    pm2_bus.on('process:msg', function (msg) {
        console.log('process:msg', msg)
    })
    pm2_bus.on('process:event', async function (event) {
        let name = event.process.name
        console.log('process:event', event.process.status, event.manually, name)
        if (event.manually && event.process.status == 'stopping') {
            return;
        }
        let count = event.process.restart_time;
        let cwd = event.process.pm_exec_path;
        let username = event.process.username
        let title = ""
        if (event.event == 'exit') {
            title = `${namespace}-${name}-exit`
        }
        if (event.event == 'online') {
            title = `${namespace}-${name}-online`
        }
        if (event.event == 'restart overlimit') {
            title = `${namespace}-${name}-重启失败-重启次数超过上限`
        }
        let text = `
            标题: ${title}
            进程名称: ${name}
            重启次数: ${count}
            路径: ${cwd}
            用户名: ${username}
        `
        if (title != "") {
            await worker.exec(async () => {
                return sendMails(name, title, text)
            })
        }
    })
    pm2_bus.on('process:exception', function (exception) {
        let name = exception.process.name;
        console.log('process:exception', exception, name)
        let data = exception.data;
        worker.exec(async () => {
            return sendMails(name, `${namespace}-${name}-panic`, `
            进程名称: ${name}
            报错: 
                name: ${data.name}
                callsite: ${data.callsite}
                context: ${data.context}
                stack: ${data.stack}
                message: ${data.message}
        `)
        })
    })
    // pm2_bus.on('log:err', function (e) {
    //     console.log('log:err', e)
    // });
})