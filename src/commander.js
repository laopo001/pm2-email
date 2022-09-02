const { Command } = require('commander');
const program = new Command();

program
    .option('-c, --config <type>', 'config', './config.yaml');

program.parse(process.argv);


module.exports = program.opts();
